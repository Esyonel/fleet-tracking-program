# Filament Takip

3D baskı atölyesi için filament stok, alım, satış, atık, kâr/zarar ve yazıcı (Bambu Lab A2L / X2D, AMS) takip uygulaması.
PHP + SQLite, tek sayfa arayüz. Python gerektirmez (sadece evdeki yazıcı bağlayıcısı Python).

## Özellikler

- **Filament (stok kartları):** Kart, filamentin tanımıdır (marka, seri, renk kodu, renk, rulo gramı). Stok sadece **Alım** ile karta rulo olarak eklenir. Kart veya liste görünümü; ayrıntı tıklayınca açılır.
- **Alım:** Stok kartı seçilir, adet ve fiyat girilir. Nakit veya kartlı taksit. Yeniden sipariş listesi (azalan / biten filamentler).
- **Baskı / Tartı:** Baskı ve atık düşme, tartı ile kalan gramı düzeltme (fark "tartı sapması" olarak atığa sayılır).
- **Satış:** Satılan parça adı, birden çok filament + gram (rulolardan düşer), resim ve 3MF/STL dosyaları.
- **Yazıcı:** AMS slot ataması, canlı durum, yazıcı işleri (yerel bağlayıcı ile).
- **Özet:** Kâr/zarar, gelir, elde kalan değer, atık, düşük stok uyarısı.
- Yedek indirme, katalog (Bambu Lab, Porima, Elas 3D renk kodları ve baskı ayarları), Windows tarzı renk seçici, telefonda "Ana ekrana ekle".

## Başka bir bilgisayarda çalıştırma (Windows)

1. Repoyu indir (Code → Download ZIP) ve bir klasöre çıkar.
2. PHP yoksa bir kez kur: `winget install PHP.PHP.8.3`
3. `baslat.bat` dosyasına çift tıkla. Tarayıcıda `http://localhost:8080` açılır.
4. Giriş şifresi: **1234**. İlk açılışta `config.php` rastgele anahtarlarla kendiliğinden oluşur; şifreyi değiştirmek için içindeki `APP_PASSWORD` satırını düzenle.

Veriler `data/filament.db` dosyasında durur. Başka bilgisayara taşımak için sitedeki "⬇ Yedek" ile indirdiğin dosyayı `data/filament.db` olarak koyman yeterli.

## Sunucuya kurulum

1. Dosyaları sunucuda bir klasöre koy (örnek `/filament/`). PHP 8 ve `pdo_sqlite` gerekir.
2. İlk istekte `config.php` oluşur (şifre 1234). Hemen `APP_PASSWORD` değerini değiştir.
3. `data/` klasörü yazılabilir olmalı. `data/.htaccess` klasörü web'e kapatır.
4. Sitenin yönetim paneli kullanıcılarıyla giriş istenirse `ADMIN_BRIDGE`, `ADMIN_DB_FILE`, `ADMIN_COOKIE_DOMAIN` ve `ADMIN_LOGIN_URL` ayarlanır.

## Yazıcı bağlayıcısı (agent)

Yazıcılarla aynı ağdaki bilgisayarda çalışır, Bambu LAN MQTT'den durumu okuyup siteye gönderir.

```bash
pip install -r agent/requirements.txt
cp agent/config.example.json agent/config.json   # IP, seri no, erişim kodu ve token'ı doldur
python agent/agent.py
```

## Yerel geliştirme ve test

`config.local.php` (repoda yok) yerel test ayarlarını tutar; `config.php` varsa onu yükler.
Test için sahte panel kullanıcısı: `admin` / `1234` (`dev/admin_db.php`).

```bash
php -d extension_dir="<php klasoru>/ext" -c dev/php-dev.ini -S localhost:8080
python dev/test_api.py
python dev/test_migration.py <yedek.db>
```

## Notlar

- `config.php`, `config.local.php`, `agent/config.json`, `data/` içeriği ve yedekler repoya girmez (`.gitignore`).
