<?php
// SADECE YEREL TEST: sitenin config/db.php dosyasinin yerine gecer.
// Sahte panel kullanicisi: admin / 1234
$pdo = new PDO('sqlite:' . __DIR__ . '/admin_test.db', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, role TEXT)');
if (!$pdo->query("SELECT 1 FROM users WHERE username = 'admin'")->fetch()) {
    $pdo->prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
        ->execute(['admin', password_hash('1234', PASSWORD_DEFAULT), 'admin']);
}
