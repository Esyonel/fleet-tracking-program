<?php
// Ornek ayar dosyasi. config.php yoksa api.php ilk istekte bundan olusturur (sifre 1234, rastgele anahtarlar).
// config.php repoya girmez.
// Yerel gelistirme: config.local.php varsa onu kullan (sunucuya yuklenmez).
if (is_file(__DIR__ . '/config.local.php')) {
    require __DIR__ . '/config.local.php';
    return;
}
define('APP_PASSWORD', 'degistir-bunu');          // panel koprusu kapaliyken kullanilan ortak sifre
// true: giris, ayni sunucudaki sitenin yonetim paneli kullanicilariyla yapilir (ADMIN_DB_FILE gerekir).
// false: giris sadece APP_PASSWORD ile.
define('ADMIN_BRIDGE', false);
define('ADMIN_DB_FILE', dirname(__DIR__) . '/config/db.php');
define('ADMIN_COOKIE_DOMAIN', '.ornek-site.com');
define('ADMIN_LOGIN_URL', '/panel-giris.php?next=/filament/'); // girissizken buraya gider, giristen sonra geri doner
define('LOGIN_LIMIT', 0);                        // 15 dk'da izin verilen yanlis deneme, 0 = sinir yok
define('SECRET_KEY', 'degistir-uzun-rastgele-metin-64-karakter'); // oturum imzasi
define('SECURE_COOKIE', true);                    // siteniz https ise true kalsin
define('DB_FILE', __DIR__ . '/data/filament.db');
define('LOW_STOCK_G', 150);                       // bu gram ve altinda uyari
define('AGENT_TOKEN', 'degistir-agent-token');    // yerel baglayici (agent) icin
