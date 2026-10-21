<?php
declare(strict_types=1);
// Ilk calistirma (ornek: GitHub'dan indirilen kopya): config.php yoksa ornekten, rastgele anahtarlarla olusur.
// Giris sifresi 1234 olur; degistirmek icin config.php icindeki APP_PASSWORD duzenlenir.
if (!is_file(__DIR__ . '/config.php') && is_file(__DIR__ . '/config.example.php')) {
    $https = (($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off');
    $cfg = strtr((string)file_get_contents(__DIR__ . '/config.example.php'), [
        "'degistir-bunu'" => "'1234'",
        "'degistir-uzun-rastgele-metin-64-karakter'" => "'" . bin2hex(random_bytes(32)) . "'",
        "'degistir-agent-token'" => "'" . bin2hex(random_bytes(24)) . "'",
        "define('SECURE_COOKIE', true);" => "define('SECURE_COOKIE', " . ($https ? 'true' : 'false') . ');',
    ]);
    file_put_contents(__DIR__ . '/config.php', $cfg, LOCK_EX);
}
require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

// Hata ayrintisi disari sizmasin.
ini_set('display_errors', '0');
set_exception_handler(function (Throwable $e) {
    error_log((string)$e);
    http_response_code(500);
    echo json_encode(['detail' => 'Sunucu hatasi']);
});

const COOKIE = 'fil_session';
// config.php'de LOGIN_LIMIT: 15 dk icinde izin verilen yanlis deneme. 0 = sinir yok.
define('LOGIN_MAX_ATTEMPTS', defined('LOGIN_LIMIT') ? (int)LOGIN_LIMIT : 8);
const LOGIN_WINDOW_S = 900;

// IP basina basarisiz giris sayaci (data/ altinda, web'den kapali).
function login_attempts(string $ip, bool $record): int {
    $file = dirname(DB_FILE) . '/login_attempts.json';
    if (!is_dir(dirname($file))) mkdir(dirname($file), 0755, true);
    $fh = fopen($file, 'c+');
    flock($fh, LOCK_EX);
    $data = json_decode(stream_get_contents($fh) ?: '{}', true) ?: [];
    $now = time();
    foreach ($data as $k => $list) {
        $data[$k] = array_values(array_filter($list, fn($t) => $t > $now - LOGIN_WINDOW_S));
        if (!$data[$k]) unset($data[$k]);
    }
    if ($record) $data[$ip][] = $now;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($data));
    flock($fh, LOCK_UN);
    fclose($fh);
    return count($data[$ip] ?? []);
}

function out($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code = 400): void {
    out(['detail' => $msg], $code);
}

function body(): array {
    $j = json_decode(file_get_contents('php://input') ?: '[]', true);
    return is_array($j) ? $j : [];
}

function num($v, float $default = 0.0): float {
    return is_numeric($v) ? (float)$v : $default;
}

function valid_date($v): string {
    return (is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) ? $v : date('Y-m-d');
}

$token = hash_hmac('sha256', 'session', SECRET_KEY);
$action = $_GET['a'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// ---- giris / cikis (oturum gerektirmez) ----
if (APP_PASSWORD === 'degistir-bunu' || SECRET_KEY === 'degistir-uzun-rastgele-metin-64-karakter'
    || AGENT_TOKEN === 'degistir-agent-token' || strlen(SECRET_KEY) < 32 || strlen(AGENT_TOKEN) < 32) {
    fail('config.php henuz ayarlanmadi: APP_PASSWORD, SECRET_KEY ve AGENT_TOKEN degistirilmeli', 503);
}
// CSRF: tarayicidan gelen her degistiren istek bu basligi tasimali (form ile taklit edilemez).
if ($method !== 'GET' && $action !== 'agent_report' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'fetch') {
    fail('Gecersiz istek', 403);
}
// ---- yonetim paneli koprusu ----
// ADMIN_BRIDGE acikken giris, sitenin yonetim paneli kullanicilariyla yapilir (ayni kullanici adi + sifre)
// ve panelde acik oturum varsa filament otomatik acilir.
$adminBridge = defined('ADMIN_BRIDGE') && ADMIN_BRIDGE && is_file(ADMIN_DB_FILE);

function admin_session_user(): ?array {
    if (session_status() === PHP_SESSION_NONE) {
        if (defined('ADMIN_COOKIE_DOMAIN') && ADMIN_COOKIE_DOMAIN !== '') {
            ini_set('session.cookie_domain', ADMIN_COOKIE_DOMAIN);
        }
        session_start();
    }
    return $_SESSION['user'] ?? null;
}

if ($action === 'auth_mode') {
    $user = $adminBridge ? admin_session_user() : null;
    $loginUrl = $adminBridge && defined('ADMIN_LOGIN_URL') ? ADMIN_LOGIN_URL : null;
    out(['mode' => $adminBridge ? 'admin' : 'password', 'user' => $user['username'] ?? null, 'login_url' => $loginUrl]);
}

if ($action === 'login' && $method === 'POST') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    // Panel sifresi korunuyor: kopru modunda deneme siniri her zaman acik.
    $limit = $adminBridge ? (LOGIN_MAX_ATTEMPTS > 0 ? LOGIN_MAX_ATTEMPTS : 8) : LOGIN_MAX_ATTEMPTS;
    if ($limit > 0 && login_attempts($ip, false) >= $limit) fail('Cok fazla deneme. 15 dakika bekle.', 429);
    $b = body();
    if ($adminBridge) {
        // Panelin giris sayfasiyla ayni: kullanici adi cleanInput ile temizlenir.
        $username = htmlspecialchars(trim((string)($b['username'] ?? '')), ENT_QUOTES, 'UTF-8');
        require ADMIN_DB_FILE; // $pdo
        $st = $pdo->prepare('SELECT id, username, password, role FROM users WHERE username = ?');
        $st->execute([$username]);
        $u = $st->fetch(PDO::FETCH_ASSOC);
        if (!$u || !password_verify((string)($b['password'] ?? ''), $u['password'])) {
            login_attempts($ip, true);
            fail('Kullanici adi veya sifre yanlis', 401);
        }
        admin_session_user();
        $_SESSION['user'] = ['id' => $u['id'], 'username' => $u['username'], 'role' => $u['role']];
        session_regenerate_id(true);
        out(['ok' => true]);
    }
    if (!hash_equals(APP_PASSWORD, (string)($b['password'] ?? ''))) {
        if ($limit > 0) login_attempts($ip, true);
        fail('Sifre yanlis', 401);
    }
    setcookie(COOKIE, $token, [
        'expires' => time() + 86400 * 30, 'path' => '/', 'httponly' => true,
        'samesite' => 'Lax', 'secure' => SECURE_COOKIE,
    ]);
    out(['ok' => true]);
}
if ($action === 'logout') {
    setcookie(COOKIE, '', ['expires' => 1, 'path' => '/']);
    if ($adminBridge) {
        // Ortak oturum: filamentten cikis panelden de cikis yapar.
        admin_session_user();
        $_SESSION = [];
        session_destroy();
    }
    out(['ok' => true]);
}

// ---- oturum kontrolu ----
$authed = hash_equals($token, $_COOKIE[COOKIE] ?? '') || ($adminBridge && admin_session_user() !== null);
if ($action !== 'agent_report' && !$authed) fail('Giris gerekli', 401);
if (session_status() === PHP_SESSION_ACTIVE) session_write_close(); // panel oturumunu kilitli tutma

// ---- veritabani ----
if (!is_dir(dirname(DB_FILE))) mkdir(dirname(DB_FILE), 0755, true);
$db = new PDO('sqlite:' . DB_FILE, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$db->exec('PRAGMA foreign_keys = ON');
$db->exec("
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, brand TEXT NOT NULL,
  material TEXT NOT NULL, color TEXT NOT NULL, color_hex TEXT NOT NULL, net_g REAL NOT NULL,
  qty INTEGER NOT NULL, unit_price REAL NOT NULL, payment_type TEXT NOT NULL, card_name TEXT,
  installments INTEGER NOT NULL, monthly_amount REAL, total_paid REAL NOT NULL, notes TEXT
);
CREATE TABLE IF NOT EXISTS spools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER REFERENCES purchases(id) ON DELETE CASCADE,
  brand TEXT NOT NULL, material TEXT NOT NULL, color TEXT NOT NULL, color_hex TEXT NOT NULL,
  net_g REAL NOT NULL, cost_total REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spool_id INTEGER NOT NULL REFERENCES spools(id) ON DELETE CASCADE,
  date TEXT NOT NULL, kind TEXT NOT NULL, category TEXT, grams REAL NOT NULL, note TEXT
);
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, description TEXT NOT NULL,
  spool_id INTEGER REFERENCES spools(id) ON DELETE SET NULL,
  grams REAL NOT NULL DEFAULT 0, price REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS printers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, model TEXT,
  serial TEXT NOT NULL UNIQUE, ip TEXT, status_json TEXT, last_seen TEXT
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  printer_id INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  job_key TEXT NOT NULL, name TEXT, status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0,
  started_at TEXT, ended_at TEXT, grams REAL, cost REAL NOT NULL DEFAULT 0,
  price REAL NOT NULL DEFAULT 0,
  spool_id INTEGER REFERENCES spools(id) ON DELETE SET NULL,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  UNIQUE(printer_id, job_key)
);
CREATE TABLE IF NOT EXISTS printer_slots (
  printer_id INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  spool_id INTEGER REFERENCES spools(id) ON DELETE SET NULL,
  PRIMARY KEY (printer_id, slot)
);
");
// Sonradan eklenen kolonlar: urun serisi (ornek "PLA Basic") ve etiketteki renk kodu.
foreach (['spools', 'purchases'] as $tbl) {
    $cols = array_column($db->query("PRAGMA table_info($tbl)")->fetchAll(), 'name');
    foreach (['product', 'color_code'] as $col) {
        if (!in_array($col, $cols, true)) $db->exec("ALTER TABLE $tbl ADD COLUMN $col TEXT");
    }
}

// Stok karti: filamentin tanimi (marka, malzeme, seri, renk, rulo grami). Stoga rulo sadece alimla
// eklenir: her alim, secilen karta bagli `qty` adet rulo (spools satiri) olusturur.
$db->exec("CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, material TEXT NOT NULL,
  product TEXT, color_code TEXT, color TEXT NOT NULL, color_hex TEXT NOT NULL,
  net_g REAL NOT NULL, notes TEXT
)");
foreach (['spools', 'purchases'] as $tbl) {
    $cols = array_column($db->query("PRAGMA table_info($tbl)")->fetchAll(), 'name');
    if (!in_array('card_id', $cols, true)) $db->exec("ALTER TABLE $tbl ADD COLUMN card_id INTEGER");
}

// Satis satirlari: satilan parcada hangi rulodan kac gram gittigi. Her satir rulodan baski hareketi olarak duser.
$db->exec("CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  spool_id INTEGER REFERENCES spools(id) ON DELETE SET NULL,
  grams REAL NOT NULL,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL
)");

// Satis dosyalari: urun resimleri ve 3MF/STL. Dosyalar data/uploads/ altinda (web'den kapali), sadece API ile verilir.
$db->exec("CREATE TABLE IF NOT EXISTS sale_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  name TEXT NOT NULL, stored TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  kind TEXT NOT NULL, created_at TEXT NOT NULL
)");
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const UPLOAD_TYPES = [
    'jpg' => ['image', 'image/jpeg'], 'jpeg' => ['image', 'image/jpeg'], 'png' => ['image', 'image/png'],
    'webp' => ['image', 'image/webp'], 'gif' => ['image', 'image/gif'],
    '3mf' => ['model', 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'], 'stl' => ['model', 'model/stl'],
];

function upload_dir(): string {
    return dirname(DB_FILE) . '/uploads/sales';
}

function ini_bytes(string $v): int {
    $v = trim($v);
    $n = (int)$v;
    switch (strtolower(substr($v, -1))) {
        case 'g': $n *= 1024;
        case 'm': $n *= 1024;
        case 'k': $n *= 1024;
    }
    return $n;
}

// Sunucunun izin verdigi en buyuk dosya (php.ini) ile uygulama sinirinin kucugu.
function upload_limit(): int {
    $lim = [UPLOAD_MAX_BYTES];
    foreach (['upload_max_filesize', 'post_max_size'] as $k) {
        $b = ini_bytes((string)ini_get($k));
        if ($b > 0) $lim[] = $b;
    }
    return min($lim);
}

function delete_sale_files(PDO $db, int $saleId): void {
    $st = $db->prepare('SELECT stored FROM sale_files WHERE sale_id = ?');
    $st->execute([$saleId]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $f) @unlink(upload_dir() . '/' . basename($f));
}

function clean_text($v, int $max = 80): ?string {
    $s = trim((string)($v ?? ''));
    $s = function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
    return $s === '' ? null : $s;
}

// Ayni tanim = ayni kart (buyuk/kucuk harf ve bosluk farki sayilmaz, renk tonu sayilmaz).
function card_key(array $c): string {
    $n = fn($v) => function_exists('mb_strtolower') ? mb_strtolower(trim((string)($v ?? '')), 'UTF-8') : strtolower(trim((string)($v ?? '')));
    return implode('|', [$n($c['brand']), $n($c['material']), $n($c['product'] ?? ''), $n($c['color_code'] ?? ''),
        $n($c['color']), (string)(float)$c['net_g']]);
}

function find_card_by_key(PDO $db, array $c, int $except = 0): ?int {
    $key = card_key($c);
    foreach ($db->query('SELECT * FROM cards')->fetchAll() as $r) {
        if ((int)$r['id'] !== $except && card_key($r) === $key) return (int)$r['id'];
    }
    return null;
}

function find_or_create_card(PDO $db, array $c): int {
    $found = find_card_by_key($db, $c);
    if ($found !== null) return $found;
    $db->prepare('INSERT INTO cards (brand, material, product, color_code, color, color_hex, net_g) VALUES (?,?,?,?,?,?,?)')
       ->execute([$c['brand'], $c['material'], $c['product'] ?? null, $c['color_code'] ?? null, $c['color'],
                  $c['color_hex'], (float)$c['net_g']]);
    return (int)$db->lastInsertId();
}

// Eski veri: karti olmayan rulolar ve alimlar ayni tanimdaki karta baglanir. Hicbir satir silinmez,
// rulolarin gram/maliyet/hareketleri degismez. Gocmeden once veritabani dosyasi yedeklenir.
$pending = (int)$db->query('SELECT (SELECT COUNT(*) FROM spools WHERE card_id IS NULL)
    + (SELECT COUNT(*) FROM purchases WHERE card_id IS NULL)')->fetchColumn();
if ($pending > 0) {
    if (is_file(DB_FILE)) copy(DB_FILE, dirname(DB_FILE) . '/filament-yedek-' . date('Ymd-His') . '.db');
    $db->exec('BEGIN IMMEDIATE');
    $setSpool = $db->prepare('UPDATE spools SET card_id = ? WHERE id = ?');
    foreach ($db->query('SELECT * FROM spools WHERE card_id IS NULL ORDER BY id')->fetchAll() as $sp) {
        $setSpool->execute([find_or_create_card($db, $sp), $sp['id']]);
    }
    $spoolCard = $db->prepare('SELECT card_id FROM spools WHERE purchase_id = ? AND card_id IS NOT NULL ORDER BY id LIMIT 1');
    $setPurchase = $db->prepare('UPDATE purchases SET card_id = ? WHERE id = ?');
    foreach ($db->query('SELECT * FROM purchases WHERE card_id IS NULL ORDER BY id')->fetchAll() as $pu) {
        $spoolCard->execute([$pu['id']]);
        $cid = $spoolCard->fetchColumn();
        $setPurchase->execute([$cid !== false ? (int)$cid : find_or_create_card($db, $pu), $pu['id']]);
    }
    $db->exec('COMMIT');
}

const SPOOL_SQL = "
SELECT s.*,
  COALESCE((SELECT SUM(grams) FROM events e WHERE e.spool_id = s.id), 0) AS delta_g,
  COALESCE((SELECT -SUM(grams) FROM events e WHERE e.spool_id = s.id AND e.kind = 'print'), 0) AS print_g,
  COALESCE((SELECT -SUM(grams) FROM events e WHERE e.spool_id = s.id AND e.kind = 'waste'), 0) AS waste_g,
  COALESCE((SELECT -SUM(grams) FROM events e WHERE e.spool_id = s.id AND e.kind = 'weigh'), 0) AS sapma_g,
  (SELECT COUNT(*) FROM events e WHERE e.spool_id = s.id) AS event_count,
  EXISTS(SELECT 1 FROM printer_slots ps WHERE ps.spool_id = s.id) AS in_slot
FROM spools s";

function spool_stats(PDO $db, string $where = '', array $args = []): array {
    $st = $db->prepare(SPOOL_SQL . $where . ' ORDER BY s.id');
    $st->execute($args);
    $out = [];
    foreach ($st->fetchAll() as $d) {
        $net = (float)$d['net_g'];
        $cost = (float)$d['cost_total'];
        $cpg = $cost / $net;
        $remaining = $net + (float)$d['delta_g'];
        $consumed = (float)$d['print_g'] + (float)$d['waste_g'] + (float)$d['sapma_g'];
        $d['net_g'] = $net;
        $d['cost_total'] = $cost;
        $d['remaining_g'] = $remaining;
        $d['cost_per_g'] = $cpg;
        $d['stock_value'] = max($remaining, 0) * $cpg;
        $d['consumed_cost'] = $consumed * $cpg;
        $d['waste_cost'] = ((float)$d['waste_g'] + (float)$d['sapma_g']) * $cpg;
        $d['pct'] = max(0.0, min(100.0, $remaining / $net * 100));
        // kapali: hic kullanilmamis, tartilmamis ve hicbir AMS slotunda degil (paketinde duruyor)
        $d['in_slot'] = (bool)$d['in_slot'];
        $d['status'] = $remaining <= 0 ? 'bitti'
            : (((int)$d['event_count'] === 0 && !$d['in_slot']) ? 'kapali' : 'acik');
        $out[] = $d;
    }
    return $out;
}

function spool_fields(array $b): array {
    $brand = trim((string)($b['brand'] ?? ''));
    $material = trim((string)($b['material'] ?? ''));
    $color = trim((string)($b['color'] ?? ''));
    if ($brand === '' || $material === '' || $color === '') fail('Marka, malzeme ve renk zorunlu');
    $hex = (string)($b['color_hex'] ?? '#888888');
    if (!preg_match('/^#[0-9a-fA-F]{6}$/', $hex)) $hex = '#888888';
    return [$brand, $material, $color, $hex];
}

// Odeme bilgisi: kartta aylik tutar girildiyse toplam = aylik x taksit, yoksa birim x adet.
function payment_info(array $b, int $qty, float $unit): array {
    $is_card = ($b['payment_type'] ?? '') === 'card';
    $inst = $is_card ? max(1, min(36, (int)($b['installments'] ?? 1))) : 1;
    $monthly = ($is_card && isset($b['monthly_amount']) && $b['monthly_amount'] !== '' && $b['monthly_amount'] !== null)
        ? num($b['monthly_amount']) : null;
    $total = $monthly !== null ? $monthly * $inst : $unit * $qty;
    return [$is_card ? 'card' : 'cash', $is_card ? ($b['card_name'] ?? null) : null, $inst, $monthly, $total];
}

function card_fields(array $b): array {
    [$brand, $material, $color, $hex] = spool_fields($b);
    $net = num($b['net_g'] ?? null);
    if ($net <= 0) fail('Rulo grami 0\'dan buyuk olmali');
    return ['brand' => $brand, 'material' => $material, 'product' => clean_text($b['product'] ?? null),
            'color_code' => clean_text($b['color_code'] ?? null), 'color' => $color, 'color_hex' => $hex,
            'net_g' => $net, 'notes' => clean_text($b['notes'] ?? null, 300)];
}

function get_card(PDO $db, int $cid): array {
    $st = $db->prepare('SELECT * FROM cards WHERE id = ?');
    $st->execute([$cid]);
    $c = $st->fetch();
    if (!$c) fail('Stok karti bulunamadi', 404);
    return $c;
}

// Kart + stok ozeti: bitmemis rulolar, toplam kalan gram ve deger.
function card_list(PDO $db): array {
    $cards = $db->query('SELECT * FROM cards ORDER BY brand, product, color, id')->fetchAll();
    $by = [];
    foreach (spool_stats($db) as $s) $by[(int)$s['card_id']][] = $s;
    $pc = [];
    foreach ($db->query('SELECT card_id, COUNT(*) AS n FROM purchases GROUP BY card_id')->fetchAll() as $r) {
        $pc[(int)$r['card_id']] = (int)$r['n'];
    }
    // son alim fiyati (rulo basi): kartin en son alimi; alim yoksa en son maliyetli rulo
    $lastBuy = [];
    foreach ($db->query('SELECT card_id, total_paid * 1.0 / qty AS per_roll FROM purchases WHERE qty > 0 ORDER BY date, id')->fetchAll() as $r) {
        $lastBuy[(int)$r['card_id']] = (float)$r['per_roll'];
    }
    foreach ($cards as &$c) {
        $all = $by[(int)$c['id']] ?? [];
        $active = array_values(array_filter($all, fn($s) => $s['status'] !== 'bitti'));
        $paid = array_values(array_filter($all, fn($s) => $s['cost_total'] > 0));
        $c['net_g'] = (float)$c['net_g'];
        $c['rolls'] = $active;
        $c['roll_count'] = count($active);
        $c['finished_count'] = count($all) - count($active);
        $c['open_count'] = count(array_filter($active, fn($s) => $s['status'] === 'acik'));
        $c['closed_count'] = count(array_filter($active, fn($s) => $s['status'] === 'kapali'));
        $c['remaining_g'] = array_sum(array_map(fn($s) => max($s['remaining_g'], 0), $active));
        $c['capacity_g'] = array_sum(array_column($active, 'net_g'));
        $c['stock_value'] = array_sum(array_column($active, 'stock_value'));
        $c['purchase_count'] = $pc[(int)$c['id']] ?? 0;
        $c['last_cost'] = $lastBuy[(int)$c['id']] ?? ($paid ? end($paid)['cost_total'] : null);
    }
    unset($c);
    return $cards;
}

// Istekten satis satirlari: [[rulo id, gram], ...]. Bos satirlar atlanir. Eski istemci tek rulo gonderebilir.
function sale_items_in(array $b): array {
    $items = [];
    foreach ((array)($b['items'] ?? []) as $it) {
        if (!is_array($it)) continue;
        $sid = (int)($it['spool_id'] ?? 0);
        $g = num($it['grams'] ?? null);
        if ($sid <= 0 && $g <= 0) continue;
        if ($sid <= 0) fail('Gram girilen satirda filament secilmeli');
        if ($g <= 0) fail('Filament satirinda gram 0\'dan buyuk olmali');
        $items[] = [$sid, $g];
    }
    if (!$items && !empty($b['spool_id']) && num($b['grams'] ?? null) > 0) $items[] = [(int)$b['spool_id'], num($b['grams'])];
    return $items;
}

// Satisin eski satir ve hareketlerini siler, yenilerini yazar (rulolardan duser). Islem icinde cagrilir.
function save_sale_items(PDO $db, int $saleId, string $date, string $name, array $items): void {
    $db->prepare('DELETE FROM events WHERE id IN (SELECT event_id FROM sale_items WHERE sale_id = ? AND event_id IS NOT NULL)')
       ->execute([$saleId]);
    $db->prepare('DELETE FROM sale_items WHERE sale_id = ?')->execute([$saleId]);
    $need = [];
    foreach ($items as [$sid, $g]) $need[$sid] = ($need[$sid] ?? 0) + $g;
    foreach ($need as $sid => $g) {
        $sp = get_spool($db, $sid);
        if ($g > $sp['remaining_g'] + 1e-9) {
            fail("{$sp['brand']} {$sp['color']} rulosunda " . round(max($sp['remaining_g'], 0)) . ' g kaldi, ' . round($g) . ' g dusulemez');
        }
    }
    $ev = $db->prepare('INSERT INTO events (spool_id, date, kind, category, grams, note) VALUES (?,?,?,?,?,?)');
    $it = $db->prepare('INSERT INTO sale_items (sale_id, spool_id, grams, event_id) VALUES (?,?,?,?)');
    $total = 0.0;
    foreach ($items as [$sid, $g]) {
        $ev->execute([$sid, $date, 'print', null, -$g, 'Satis: ' . $name]);
        $it->execute([$saleId, $sid, $g, (int)$db->lastInsertId()]);
        $total += $g;
    }
    $db->prepare('UPDATE sales SET spool_id = NULL, grams = ? WHERE id = ?')->execute([$total, $saleId]);
}

function sale_event_guard(PDO $db, int $eventId): void {
    $st = $db->prepare('SELECT 1 FROM sale_items WHERE event_id = ?');
    $st->execute([$eventId]);
    if ($st->fetch()) fail('Bu hareket bir satisa bagli. Satis sekmesinden duzenle.');
}

function get_spool(PDO $db, int $sid): array {
    $found = spool_stats($db, ' WHERE s.id = ?', [$sid]);
    if (!$found) fail('Filament bulunamadi', 404);
    return $found[0];
}

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

// ---- rotalar ----
switch ("$method $action") {

    case 'GET purchases':
        out($db->query('SELECT * FROM purchases ORDER BY id DESC')->fetchAll());

    case 'POST purchase':
        $b = body();
        // Stok karti secildiyse tanim karttan gelir. Kart yoksa (eski istemci) alanlardan bulunur ya da olusur.
        $card = !empty($b['card_id']) ? get_card($db, (int)$b['card_id']) : null;
        $fields = $card ? null : card_fields($b);
        $qty = max(1, min(200, (int)($b['qty'] ?? 1)));
        $unit = num($b['unit_price'] ?? null);
        if ($unit < 0) fail('Fiyat negatif olamaz');
        [$pay, $cardName, $inst, $monthly, $total] = payment_info($b, $qty, $unit);

        $db->beginTransaction();
        if (!$card) $card = get_card($db, find_or_create_card($db, $fields));
        $st = $db->prepare('INSERT INTO purchases (date, brand, material, color, color_hex, net_g, qty,
            unit_price, payment_type, card_name, installments, monthly_amount, total_paid, notes, product, color_code, card_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $st->execute([
            valid_date($b['date'] ?? null), $card['brand'], $card['material'], $card['color'], $card['color_hex'],
            (float)$card['net_g'], $qty, $unit, $pay, $cardName, $inst, $monthly, $total, clean_text($b['notes'] ?? null, 300),
            $card['product'], $card['color_code'], $card['id'],
        ]);
        $pid = (int)$db->lastInsertId();
        $sp = $db->prepare('INSERT INTO spools (purchase_id, brand, material, color, color_hex, net_g, cost_total, product, color_code, card_id)
            VALUES (?,?,?,?,?,?,?,?,?,?)');
        for ($i = 0; $i < $qty; $i++) {
            $sp->execute([$pid, $card['brand'], $card['material'], $card['color'], $card['color_hex'], (float)$card['net_g'],
                          $total / $qty, $card['product'], $card['color_code'], $card['id']]);
        }
        $db->commit();
        out(['id' => $pid, 'total_paid' => $total, 'card_id' => (int)$card['id']], 201);

    case 'DELETE purchase':
        $db->prepare('DELETE FROM spools WHERE purchase_id = ?')->execute([$id]);
        $st = $db->prepare('DELETE FROM purchases WHERE id = ?');
        $st->execute([$id]);
        if ($st->rowCount() === 0) fail('Alim bulunamadi', 404);
        out(['ok' => true]);

    case 'GET backup':
        // Veritabaninin tutarli kopyasini indir. VACUUM INTO yoksa (eski SQLite) dosyanin kendisi gonderilir.
        $tmp = tempnam(sys_get_temp_dir(), 'filbak');
        @unlink($tmp);
        $file = DB_FILE;
        try {
            $db->exec('VACUUM INTO ' . $db->quote($tmp));
            $file = $tmp;
        } catch (PDOException $e) {
            error_log('backup VACUUM INTO: ' . $e->getMessage());
        }
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="filament-yedek-' . date('Ymd-His') . '.db"');
        header('Content-Length: ' . filesize($file));
        readfile($file);
        if ($file === $tmp) @unlink($tmp);
        exit;

    case 'GET cards':
        out(card_list($db));

    case 'POST card':
        $c = card_fields(body());
        if (find_card_by_key($db, $c) !== null) fail('Bu stok karti zaten var', 409);
        $db->prepare('INSERT INTO cards (brand, material, product, color_code, color, color_hex, net_g, notes) VALUES (?,?,?,?,?,?,?,?)')
           ->execute([$c['brand'], $c['material'], $c['product'], $c['color_code'], $c['color'], $c['color_hex'], $c['net_g'], $c['notes']]);
        out(['id' => (int)$db->lastInsertId()], 201);

    case 'POST card_update':
        get_card($db, $id);
        $c = card_fields(body());
        if (find_card_by_key($db, $c, $id) !== null) fail('Ayni tanimda baska bir stok karti var', 409);
        $db->beginTransaction();
        $db->prepare('UPDATE cards SET brand = ?, material = ?, product = ?, color_code = ?, color = ?, color_hex = ?, net_g = ?, notes = ? WHERE id = ?')
           ->execute([$c['brand'], $c['material'], $c['product'], $c['color_code'], $c['color'], $c['color_hex'], $c['net_g'], $c['notes'], $id]);
        // Tanim bagli rulo ve alimlara da yazilir. Rulo grami yeni alimlar icindir, eski rulolar degismez.
        foreach (['spools', 'purchases'] as $tbl) {
            $db->prepare("UPDATE $tbl SET brand = ?, material = ?, product = ?, color_code = ?, color = ?, color_hex = ? WHERE card_id = ?")
               ->execute([$c['brand'], $c['material'], $c['product'], $c['color_code'], $c['color'], $c['color_hex'], $id]);
        }
        $db->commit();
        out(['ok' => true]);

    case 'DELETE card':
        get_card($db, $id);
        $st = $db->prepare('SELECT (SELECT COUNT(*) FROM spools WHERE card_id = ?) + (SELECT COUNT(*) FROM purchases WHERE card_id = ?)');
        $st->execute([$id, $id]);
        if ((int)$st->fetchColumn() > 0) fail('Bu karta bagli alim veya rulo var. Once onlari sil.', 409);
        $db->prepare('DELETE FROM cards WHERE id = ?')->execute([$id]);
        out(['ok' => true]);

    case 'GET spools':
        out(spool_stats($db));

    case 'POST spool_use':
        $b = body();
        $spool = get_spool($db, $id);
        $kind = ($b['kind'] ?? '') === 'waste' ? 'waste' : 'print';
        $grams = num($b['grams'] ?? null);
        if ($grams <= 0) fail('Gram 0\'dan buyuk olmali');
        if ($grams > $spool['remaining_g']) fail('Kalan gramdan fazla kullanilamaz');
        $cat = $kind === 'waste'
            ? (in_array($b['category'] ?? '', ['failed', 'purge', 'support', 'other'], true) ? $b['category'] : 'other')
            : null;
        $db->prepare('INSERT INTO events (spool_id, date, kind, category, grams, note) VALUES (?,?,?,?,?,?)')
           ->execute([$id, valid_date($b['date'] ?? null), $kind, $cat, -$grams, $b['note'] ?? null]);
        out(['ok' => true], 201);

    case 'POST spool_weigh':
        $b = body();
        $spool = get_spool($db, $id);
        $measured = num($b['measured_g'] ?? null, -1);
        if ($measured < 0) fail('Olcum gecersiz');
        if ($measured > $spool['net_g']) fail('Olcum rulo gramini asiyor');
        $diff = $measured - $spool['remaining_g'];
        $db->prepare('INSERT INTO events (spool_id, date, kind, category, grams, note) VALUES (?,?,?,?,?,?)')
           ->execute([$id, valid_date($b['date'] ?? null), 'weigh', null, $diff, $b['note'] ?? null]);
        out(['ok' => true, 'diff_g' => $diff], 201);

    case 'GET events':
        $sql = 'SELECT e.*, s.brand, s.material, s.color, s.color_hex, s.net_g, s.cost_total
                FROM events e JOIN spools s ON s.id = e.spool_id WHERE 1=1';
        $args = [];
        if (!empty($_GET['kind'])) { $sql .= ' AND e.kind = ?'; $args[] = $_GET['kind']; }
        if (!empty($_GET['spool_id'])) { $sql .= ' AND e.spool_id = ?'; $args[] = (int)$_GET['spool_id']; }
        $sql .= ' ORDER BY e.id DESC LIMIT 500';
        $st = $db->prepare($sql);
        $st->execute($args);
        $rows = [];
        foreach ($st->fetchAll() as $d) {
            $d['cost'] = -(float)$d['grams'] * (float)$d['cost_total'] / (float)$d['net_g'];
            $rows[] = $d;
        }
        out($rows);

    case 'DELETE event':
        sale_event_guard($db, $id);
        $st = $db->prepare('DELETE FROM events WHERE id = ?');
        $st->execute([$id]);
        if ($st->rowCount() === 0) fail('Kayit bulunamadi', 404);
        out(['ok' => true]);

    case 'GET sales':
        $rows = $db->query('SELECT sa.*, s.brand, s.color, s.color_hex, (s.cost_total / s.net_g) AS cost_per_g
            FROM sales sa LEFT JOIN spools s ON s.id = sa.spool_id ORDER BY sa.id DESC')->fetchAll();
        $items = [];
        foreach ($db->query('SELECT si.*, s.brand, s.product, s.material, s.color, s.color_code, s.color_hex,
                (s.cost_total / s.net_g) AS cost_per_g
            FROM sale_items si LEFT JOIN spools s ON s.id = si.spool_id ORDER BY si.id')->fetchAll() as $it) {
            $it['cost'] = (float)$it['grams'] * (float)($it['cost_per_g'] ?? 0);
            $items[(int)$it['sale_id']][] = $it;
        }
        $files = [];
        foreach ($db->query('SELECT id, sale_id, name, mime, size, kind, created_at FROM sale_files ORDER BY id')->fetchAll() as $f) {
            $files[(int)$f['sale_id']][] = $f;
        }
        foreach ($rows as &$r) {
            $r['items'] = $items[(int)$r['id']] ?? [];
            $r['files'] = $files[(int)$r['id']] ?? [];
            // eski satis (satirsiz, tek rulo): gram rulodan dusmemisti, sadece maliyet hesaplanir
            $r['material_cost'] = $r['items'] ? array_sum(array_column($r['items'], 'cost'))
                : (float)$r['grams'] * (float)($r['cost_per_g'] ?? 0);
            $r['gross_profit'] = (float)$r['price'] - $r['material_cost'];
        }
        unset($r);
        out($rows);

    case 'POST sale':
        $b = body();
        $desc = clean_text($b['description'] ?? null, 200);
        if ($desc === null) fail('Parca adi zorunlu');
        $items = sale_items_in($b);
        $date = valid_date($b['date'] ?? null);
        $db->beginTransaction();
        $db->prepare('INSERT INTO sales (date, description, spool_id, grams, price) VALUES (?,?,NULL,0,?)')
           ->execute([$date, $desc, num($b['price'] ?? null)]);
        $saleId = (int)$db->lastInsertId();
        save_sale_items($db, $saleId, $date, $desc, $items);
        $db->commit();
        out(['ok' => true, 'id' => $saleId], 201);

    case 'DELETE sale':
        delete_sale_files($db, $id);
        $db->prepare('DELETE FROM events WHERE id IN (SELECT event_id FROM sale_items WHERE sale_id = ? AND event_id IS NOT NULL)')
           ->execute([$id]);
        $st = $db->prepare('DELETE FROM sales WHERE id = ?');
        $st->execute([$id]);
        if ($st->rowCount() === 0) fail('Satis bulunamadi', 404);
        out(['ok' => true]);

    case 'GET upload_limit':
        out(['bytes' => upload_limit()]);

    case 'POST sale_file_upload':
        $st = $db->prepare('SELECT id FROM sales WHERE id = ?');
        $st->execute([$id]);
        if (!$st->fetch()) fail('Satis bulunamadi', 404);
        if (empty($_FILES['files'])) {
            // post_max_size asilinca PHP $_FILES'i bos birakir
            fail('Dosya alinamadi. En fazla ' . round(upload_limit() / 1048576) . ' MB yuklenebilir.', 413);
        }
        $f = $_FILES['files'];
        $names = (array)$f['name'];
        $dir = upload_dir();
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        $saved = [];
        foreach ($names as $i => $orig) {
            $err = (int)((array)$f['error'])[$i];
            $tmp = (string)((array)$f['tmp_name'])[$i];
            $size = (int)((array)$f['size'])[$i];
            $orig = clean_text(basename((string)$orig), 120) ?? 'dosya';
            if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE || $size > upload_limit()) {
                fail("$orig cok buyuk. En fazla " . round(upload_limit() / 1048576) . ' MB.', 413);
            }
            if ($err !== UPLOAD_ERR_OK || !is_uploaded_file($tmp)) fail("$orig yuklenemedi");
            $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
            if (!isset(UPLOAD_TYPES[$ext])) fail("$orig: sadece resim (jpg, png, webp, gif), 3MF ve STL yuklenebilir");
            [$kind, $mime] = UPLOAD_TYPES[$ext];
            // icerik kontrolu: resim gercekten resim, 3MF gercekten zip olmali
            $head = (string)file_get_contents($tmp, false, null, 0, 4);
            if ($kind === 'image') {
                $info = @getimagesize($tmp);
                if (!$info || !in_array($info['mime'], ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) fail("$orig gecerli bir resim degil");
                $mime = $info['mime'];
            } elseif ($ext === '3mf' && $head !== "PK\x03\x04") {
                fail("$orig gecerli bir 3MF dosyasi degil");
            }
            $stored = bin2hex(random_bytes(16)) . '.' . $ext;
            if (!move_uploaded_file($tmp, "$dir/$stored")) fail("$orig kaydedilemedi", 500);
            $db->prepare('INSERT INTO sale_files (sale_id, name, stored, mime, size, kind, created_at) VALUES (?,?,?,?,?,?,?)')
               ->execute([$id, $orig, $stored, $mime, $size, $kind, date('Y-m-d H:i:s')]);
            $saved[] = (int)$db->lastInsertId();
        }
        out(['ok' => true, 'ids' => $saved], 201);

    case 'GET sale_file':
        $st = $db->prepare('SELECT * FROM sale_files WHERE id = ?');
        $st->execute([$id]);
        $file = $st->fetch();
        if (!$file) fail('Dosya bulunamadi', 404);
        $path = upload_dir() . '/' . basename($file['stored']);
        if (!is_file($path)) fail('Dosya bulunamadi', 404);
        $inline = $file['kind'] === 'image' && empty($_GET['download']);
        header('Content-Type: ' . $file['mime']);
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: private, max-age=86400');
        header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
        header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="'
            . preg_replace('/[^A-Za-z0-9._-]/', '_', $file['name']) . '"; filename*=UTF-8\'\'' . rawurlencode($file['name']));
        readfile($path);
        exit;

    case 'DELETE sale_file':
        $st = $db->prepare('SELECT stored FROM sale_files WHERE id = ?');
        $st->execute([$id]);
        $stored = $st->fetchColumn();
        if ($stored === false) fail('Dosya bulunamadi', 404);
        @unlink(upload_dir() . '/' . basename($stored));
        $db->prepare('DELETE FROM sale_files WHERE id = ?')->execute([$id]);
        out(['ok' => true]);

    case 'GET summary':
        $spools = spool_stats($db);
        $purchases_total = (float)$db->query('SELECT COALESCE(SUM(total_paid), 0) FROM purchases')->fetchColumn();
        $revenue = (float)$db->query('SELECT COALESCE(SUM(price), 0) FROM sales')->fetchColumn()
            + (float)$db->query('SELECT COALESCE(SUM(price), 0) FROM jobs')->fetchColumn();
        $sales_count = (int)$db->query('SELECT COUNT(*) FROM sales')->fetchColumn();
        $waste_by_cat = [];
        foreach ($db->query("SELECT category, -SUM(grams) AS g FROM events WHERE kind = 'waste' GROUP BY category")->fetchAll() as $r) {
            $waste_by_cat[$r['category']] = (float)$r['g'];
        }
        $consumed_cost = $consumed_g = $waste_g = $waste_cost = $stock = $remaining = 0.0;
        $open = $closed = 0;
        foreach ($spools as $s) {
            $consumed_cost += $s['consumed_cost'];
            $consumed_g += $s['print_g'] + $s['waste_g'] + $s['sapma_g'];
            $waste_g += $s['waste_g'] + $s['sapma_g'];
            $waste_cost += $s['waste_cost'];
            $stock += $s['stock_value'];
            $remaining += max($s['remaining_g'], 0);
            if ($s['status'] === 'acik') $open++;
            if ($s['status'] === 'kapali') $closed++;
        }
        $sapma_g = array_sum(array_map(fn($s) => (float)$s['sapma_g'], $spools));
        if ($sapma_g > 0) $waste_by_cat['sapma'] = $sapma_g;
        $low = array_values(array_filter($spools, fn($s) => $s['remaining_g'] > 0 && $s['remaining_g'] <= LOW_STOCK_G));
        out([
            'low_stock' => $low,
            'low_stock_g' => LOW_STOCK_G,
            'revenue' => $revenue,
            'sales_count' => $sales_count,
            'consumed_cost' => $consumed_cost,
            'consumed_g' => $consumed_g,
            'profit' => $revenue - $consumed_cost,
            'stock_value' => $stock,
            'remaining_g' => $remaining,
            'purchases_total' => $purchases_total,
            'waste_g' => $waste_g,
            'waste_cost' => $waste_cost,
            'waste_pct' => $consumed_g > 0 ? $waste_g / $consumed_g * 100 : 0,
            'waste_by_category' => $waste_by_cat,
            'spool_count' => count($spools),
            'open_spools' => $open,
            'closed_spools' => $closed,
        ]);

    case 'GET printers':
        $rows = $db->query('SELECT * FROM printers ORDER BY id')->fetchAll();
        foreach ($rows as &$r) {
            $r['status'] = $r['status_json'] ? json_decode($r['status_json'], true) : null;
            unset($r['status_json']);
            $st = $db->prepare("SELECT COUNT(*) AS total,
                    COALESCE(SUM(status = 'finished'), 0) AS ok,
                    COALESCE(SUM(status = 'failed'), 0) AS failed,
                    COALESCE(SUM(grams), 0) AS grams,
                    COALESCE(SUM(cost), 0) AS cost,
                    COALESCE(SUM(price), 0) AS revenue
                FROM jobs WHERE printer_id = ?");
            $st->execute([$r['id']]);
            $r['summary'] = $st->fetch();
            $r['summary']['profit'] = (float)$r['summary']['revenue'] - (float)$r['summary']['cost'];
            $r['online'] = $r['last_seen'] !== null && (time() - strtotime($r['last_seen'])) < 120;
            $sl = $db->prepare('SELECT slot, spool_id FROM printer_slots WHERE printer_id = ? AND spool_id IS NOT NULL');
            $sl->execute([$r['id']]);
            $r['slots'] = (object)array_column($sl->fetchAll(), 'spool_id', 'slot');
        }
        unset($r);
        out($rows);

    case 'POST printer':
        $b = body();
        $name = trim((string)($b['name'] ?? ''));
        $serial = trim((string)($b['serial'] ?? ''));
        if ($name === '' || $serial === '') fail('Isim ve seri no zorunlu');
        try {
            $db->prepare('INSERT INTO printers (name, model, serial, ip) VALUES (?,?,?,?)')
               ->execute([$name, $b['model'] ?? null, $serial, $b['ip'] ?? null]);
        } catch (PDOException $e) {
            fail('Bu seri no zaten kayitli', 409);
        }
        out(['ok' => true], 201);

    case 'DELETE printer':
        $db->prepare('DELETE FROM events WHERE id IN (SELECT event_id FROM jobs WHERE printer_id = ? AND event_id IS NOT NULL)')
           ->execute([$id]);
        $st = $db->prepare('DELETE FROM printers WHERE id = ?');
        $st->execute([$id]);
        if ($st->rowCount() === 0) fail('Yazici bulunamadi', 404);
        out(['ok' => true]);

    case 'GET jobs':
        $sql = 'SELECT j.*, p.name AS printer_name, s.brand, s.color, s.color_hex
                FROM jobs j JOIN printers p ON p.id = j.printer_id
                LEFT JOIN spools s ON s.id = j.spool_id WHERE 1=1';
        $args = [];
        if (!empty($_GET['printer_id'])) { $sql .= ' AND j.printer_id = ?'; $args[] = (int)$_GET['printer_id']; }
        $sql .= ' ORDER BY j.id DESC LIMIT 300';
        $st = $db->prepare($sql);
        $st->execute($args);
        out($st->fetchAll());

    case 'POST agent_report':
        if (!hash_equals(AGENT_TOKEN, $_SERVER['HTTP_X_AGENT_TOKEN'] ?? '')) fail('Yetkisiz', 401);
        $b = body();
        $pst = $db->prepare('SELECT id FROM printers WHERE serial = ?');
        $pst->execute([(string)($b['serial'] ?? '')]);
        $pid = $pst->fetchColumn();
        if ($pid === false) fail('Yazici kayitli degil', 404);
        $pid = (int)$pid;
        $now = date('Y-m-d H:i:s');
        if (isset($b['status']) && is_array($b['status'])) {
            $db->prepare('UPDATE printers SET status_json = ?, last_seen = ? WHERE id = ?')
               ->execute([json_encode($b['status'], JSON_UNESCAPED_UNICODE), $now, $pid]);
        }
        $job = $b['job'] ?? null;
        if (is_array($job) && !empty($job['key'])) {
            $map = ['RUNNING' => 'running', 'PREPARE' => 'running', 'PAUSE' => 'running',
                    'FINISH' => 'finished', 'FAILED' => 'failed'];
            $state = $map[strtoupper((string)($job['state'] ?? ''))] ?? null;
            $key = (string)$job['key'];
            $name = (string)($job['name'] ?? '');
            $progress = num($job['progress'] ?? null);
            $ex = $db->prepare('SELECT id FROM jobs WHERE printer_id = ? AND job_key = ?');
            $ex->execute([$pid, $key]);
            $row = $ex->fetch();
            if (!$row) {
                $db->prepare('INSERT INTO jobs (printer_id, job_key, name, status, progress, started_at) VALUES (?,?,?,?,?,?)')
                   ->execute([$pid, $key, $name, $state ?? 'running', $progress, $now]);
                $jid = (int)$db->lastInsertId();
            } else {
                $jid = (int)$row['id'];
                $db->prepare('UPDATE jobs SET name = ?, progress = ?, status = COALESCE(?, status) WHERE id = ?')
                   ->execute([$name, $progress, $state, $jid]);
            }
            if (in_array($state, ['finished', 'failed'], true)) {
                $db->prepare('UPDATE jobs SET ended_at = COALESCE(ended_at, ?) WHERE id = ?')->execute([$now, $jid]);
            }
            // Aktif AMS slotuna makara atanmissa isi o makaraya bagla (gram sonra girilir).
            $trayNow = $b['status']['tray_now'] ?? null;
            if (is_string($trayNow) && $trayNow !== '') {
                $sl = $db->prepare('SELECT spool_id FROM printer_slots WHERE printer_id = ? AND slot = ?');
                $sl->execute([$pid, $trayNow]);
                $slotSpool = $sl->fetchColumn();
                if ($slotSpool) {
                    $db->prepare('UPDATE jobs SET spool_id = COALESCE(spool_id, ?) WHERE id = ? AND event_id IS NULL')
                       ->execute([(int)$slotSpool, $jid]);
                }
            }
        }
        out(['ok' => true]);

    case 'POST job_assign':
        $b = body();
        $st = $db->prepare('SELECT * FROM jobs WHERE id = ?');
        $st->execute([$id]);
        $job = $st->fetch();
        if (!$job) fail('Is bulunamadi', 404);
        if ($job['event_id']) {
            $db->prepare('DELETE FROM events WHERE id = ?')->execute([$job['event_id']]);
        }
        $sid = (isset($b['spool_id']) && $b['spool_id'] !== '' && $b['spool_id'] !== null) ? (int)$b['spool_id'] : null;
        $grams = num($b['grams'] ?? null, (float)($job['grams'] ?? 0));
        $price = num($b['price'] ?? null, (float)$job['price']);
        $cost = 0.0;
        $event_id = null;
        if ($sid !== null && $grams > 0) {
            $spool = get_spool($db, $sid);
            if ($grams > $spool['remaining_g']) fail('Filamentte yeterli malzeme yok');
            $cost = $grams * $spool['cost_per_g'];
            $when = substr((string)($job['ended_at'] ?? $job['started_at'] ?? date('Y-m-d H:i:s')), 0, 10);
            $db->prepare('INSERT INTO events (spool_id, date, kind, category, grams, note) VALUES (?,?,?,?,?,?)')
               ->execute([$sid, $when, 'print', null, -$grams, 'Yazici isi #' . $job['job_key']]);
            $event_id = (int)$db->lastInsertId();
        }
        $db->prepare('UPDATE jobs SET spool_id = ?, grams = ?, cost = ?, event_id = ?, price = ? WHERE id = ?')
           ->execute([$sid, $grams, $cost, $event_id, $price, $id]);
        out(['ok' => true]);

    case 'DELETE job':
        $st = $db->prepare('SELECT event_id FROM jobs WHERE id = ?');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) fail('Is bulunamadi', 404);
        if ($row['event_id']) {
            $db->prepare('DELETE FROM events WHERE id = ?')->execute([$row['event_id']]);
        }
        $db->prepare('DELETE FROM jobs WHERE id = ?')->execute([$id]);
        out(['ok' => true]);

    case 'POST slot_assign':
        $b = body();
        $st = $db->prepare('SELECT id FROM printers WHERE id = ?');
        $st->execute([$id]);
        if (!$st->fetch()) fail('Yazici bulunamadi', 404);
        $slot = (string)($b['slot'] ?? '');
        if (!preg_match('/^(\d-\d|EXT)$/', $slot)) fail('Gecersiz slot');
        $sid = (isset($b['spool_id']) && $b['spool_id'] !== '' && $b['spool_id'] !== null) ? (int)$b['spool_id'] : null;
        if ($sid === null) {
            $db->prepare('DELETE FROM printer_slots WHERE printer_id = ? AND slot = ?')->execute([$id, $slot]);
        } else {
            get_spool($db, $sid);
            // Bir makara ayni anda tek slotta durur.
            $db->prepare('DELETE FROM printer_slots WHERE spool_id = ?')->execute([$sid]);
            $db->prepare('INSERT OR REPLACE INTO printer_slots (printer_id, slot, spool_id) VALUES (?,?,?)')->execute([$id, $slot, $sid]);
        }
        out(['ok' => true]);

    // ---- duzenleme / ekleme ----
    case 'DELETE spool':
        if (get_spool($db, $id)['purchase_id'] !== null) fail('Bu rulo bir alima bagli. Alimi duzenle ya da sil.', 409);
        $st = $db->prepare('DELETE FROM spools WHERE id = ?');
        $st->execute([$id]);
        if ($st->rowCount() === 0) fail('Filament bulunamadi', 404);
        $db->exec('UPDATE jobs SET cost = 0 WHERE spool_id IS NULL AND event_id IS NULL');
        out(['ok' => true]);

    case 'POST purchase_update':
        $b = body();
        $st = $db->prepare('SELECT * FROM purchases WHERE id = ?');
        $st->execute([$id]);
        $p = $st->fetch();
        if (!$p) fail('Alim bulunamadi', 404);
        $qty = (int)$p['qty'];
        $unit = num($b['unit_price'] ?? null, (float)$p['unit_price']);
        if ($unit < 0) fail('Fiyat negatif olamaz');
        // Rulo grami duzeltilebilir; her rulonun kullanilmis miktari yeni gramdan buyuk olamaz.
        $net = num($b['net_g'] ?? null, (float)$p['net_g']);
        if ($net <= 0) fail('Rulo grami 0\'dan buyuk olmali');
        foreach (spool_stats($db, ' WHERE s.purchase_id = ?', [$id]) as $sp) {
            $used = $sp['net_g'] - $sp['remaining_g'];
            if ($net < $used) fail('Rulo grami kullanilan miktardan (' . round($used) . ' g) kucuk olamaz');
        }
        [$pay, $cardName, $inst, $monthly, $total] = payment_info($b, $qty, $unit);
        $db->beginTransaction();
        if (!empty($b['card_id'])) {
            $card = get_card($db, (int)$b['card_id']);
        } elseif (isset($b['brand'])) { // eski istemci: alanlardan kart
            $card = get_card($db, find_or_create_card($db, card_fields(['net_g' => $p['net_g']] + $b)));
        } else {
            $card = get_card($db, (int)$p['card_id']);
        }
        $db->prepare('UPDATE purchases SET date = ?, brand = ?, material = ?, color = ?, color_hex = ?, product = ?, color_code = ?,
                card_id = ?, net_g = ?, unit_price = ?, payment_type = ?, card_name = ?, installments = ?, monthly_amount = ?, total_paid = ?,
                notes = ? WHERE id = ?')
           ->execute([valid_date($b['date'] ?? $p['date']), $card['brand'], $card['material'], $card['color'], $card['color_hex'],
                      $card['product'], $card['color_code'], $card['id'], $net, $unit, $pay, $cardName, $inst, $monthly, $total,
                      clean_text($b['notes'] ?? null, 300), $id]);
        $db->prepare('UPDATE spools SET brand = ?, material = ?, color = ?, color_hex = ?, product = ?, color_code = ?,
                card_id = ?, net_g = ?, cost_total = ? WHERE purchase_id = ?')
           ->execute([$card['brand'], $card['material'], $card['color'], $card['color_hex'], $card['product'], $card['color_code'],
                      $card['id'], $net, $total / $qty, $id]);
        $db->commit();
        out(['ok' => true, 'total_paid' => $total]);

    case 'POST printer_update':
        $b = body();
        $st = $db->prepare('SELECT id FROM printers WHERE id = ?');
        $st->execute([$id]);
        if (!$st->fetch()) fail('Yazici bulunamadi', 404);
        $name = trim((string)($b['name'] ?? ''));
        $serial = trim((string)($b['serial'] ?? ''));
        if ($name === '' || $serial === '') fail('Isim ve seri no zorunlu');
        try {
            $db->prepare('UPDATE printers SET name = ?, model = ?, serial = ?, ip = ? WHERE id = ?')
               ->execute([$name, $b['model'] ?? null, $serial, $b['ip'] ?? null, $id]);
        } catch (PDOException $e) {
            fail('Bu seri no baska yazicida kayitli', 409);
        }
        out(['ok' => true]);

    case 'POST sale_update':
        $b = body();
        $st = $db->prepare('SELECT id FROM sales WHERE id = ?');
        $st->execute([$id]);
        if (!$st->fetch()) fail('Satis bulunamadi', 404);
        $desc = clean_text($b['description'] ?? null, 200);
        if ($desc === null) fail('Parca adi zorunlu');
        $items = sale_items_in($b);
        $date = valid_date($b['date'] ?? null);
        $db->beginTransaction();
        $db->prepare('UPDATE sales SET date = ?, description = ?, price = ? WHERE id = ?')
           ->execute([$date, $desc, num($b['price'] ?? null), $id]);
        save_sale_items($db, $id, $date, $desc, $items);
        $db->commit();
        out(['ok' => true]);

    case 'POST event_update':
        $b = body();
        $st = $db->prepare('SELECT * FROM events WHERE id = ?');
        $st->execute([$id]);
        $ev = $st->fetch();
        if (!$ev) fail('Kayit bulunamadi', 404);
        if ($ev['kind'] === 'weigh') fail('Tarti kaydi duzenlenemez. Silip yeniden tart.');
        $link = $db->prepare('SELECT id FROM jobs WHERE event_id = ?');
        $link->execute([$id]);
        if ($link->fetch()) fail('Bu hareket bir yazici isine bagli. Yazicilar sekmesinden duzenle.');
        sale_event_guard($db, $id);
        $grams = num($b['grams'] ?? null);
        if ($grams <= 0) fail('Gram 0\'dan buyuk olmali');
        $spool = get_spool($db, (int)$ev['spool_id']);
        if ($grams > $spool['remaining_g'] - (float)$ev['grams']) fail('Kalan gramdan fazla kullanilamaz');
        $cat = $ev['kind'] === 'waste'
            ? (in_array($b['category'] ?? '', ['failed', 'purge', 'support', 'other'], true) ? $b['category'] : 'other')
            : null;
        $db->prepare('UPDATE events SET grams = ?, date = ?, category = ?, note = ? WHERE id = ?')
           ->execute([-$grams, valid_date($b['date'] ?? $ev['date']), $cat, $b['note'] ?? null, $id]);
        out(['ok' => true]);

    default:
        fail('Bilinmeyen istek', 404);
}
