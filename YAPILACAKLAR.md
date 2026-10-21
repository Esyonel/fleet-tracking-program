# Filament Takip - Yapılacaklar

## Mevcut durum

- [x] PHP + SQLite backend (`api.php`)
- [x] Ortak şifre girişi (`config.php`)
- [x] Makara, alım, kart/taksit, g başı maliyet
- [x] Baskı düşme, atık kaydı, tartı ile senkron (sapma kaydı)
- [x] Satış, kar/zarar, elde kalan stok değeri
- [x] Sunucuya yüklendi

## Engeller (önce bunlar)

- [ ] `config.php` içinde `APP_PASSWORD` ve `SECRET_KEY` gerçek değerle değiştirilecek (şu an API 503 veriyor)
- [ ] Hostingte PDO SQLite açık mı kontrol et
- [ ] FTP şifresi değiştirilecek (sohbette açıkta kaldı)

## Kullanıcının istediği eklemeler

- [ ] Makara QR etiketi: telefonla okut, makara sayfası aç, baskı düş
- [x] Azalan makara uyarısı: 150 g ve altı, Özet sekmesinde liste, makara kartında AZALDI rozeti (`LOW_STOCK_G` ile değişir)
- [ ] Yeniden sipariş listesi
- [ ] Taksit takvimi: bu ay ödenecek taksit tutarı
- [ ] Marka/malzeme bazında g başı fiyat karşılaştırması
- [ ] `.3mf` / `.gcode` yükleyip baskı gramını otomatik okuma
- [ ] Aylık kar ve atık grafiği
- [ ] CSV dışa aktarma
- [ ] Veritabanı yedeği indirme (tek tık)
- [ ] Makara fotoğrafı
- [~] Bambu canlı durum: kod yazıldı (`agent/agent.py`, iki yazıcı, MQTT LAN). Gerçek yazıcıda test edilmedi. Sunucuya yüklenmedi.
- [ ] Yazıcı işlerine gram otomatik: `.3mf` / slicer tahmini (şu an gram elle girilir)

## Diğer öneriler

### Güvenlik
- [ ] Giriş denemesi sınırı (brute force koruması)
- [ ] Kullanıcı bazlı giriş: sen ve oğlun ayrı hesap, işlemi kimin yaptığı görünsün
- [ ] Oturum süresi ve çıkış otomatik

### Stok ve üretim
- [ ] Makara ömrü tahmini: ortalama tüketime göre kaç gün kaldığı
- [ ] Yazıcı bazlı kayıt: hangi makara hangi yazıcıda
- [ ] Baskı geçmişi: dosya adı, süre, sonuç (başarılı / hatalı)
- [ ] Malzeme başına kurutma ve nem notu
- [ ] Malzeme başına yazıcı ayar notları (sıcaklık, hız)
- [ ] Tartı için bağlı terazi entegrasyonu (USB / Bluetooth)
- [ ] Stok sayımı ekranı (fiziksel kontrol, farkları kaydet)

### Firma ve maliyet
- [ ] Tedarikçi / firma kayıtları (fiyat ve teslim geçmişi)
- [ ] Fatura veya fiş yükleme (alım kaydına bağlı)
- [ ] Gider kayıtları: elektrik, bakım, nozzle, yatak. Net kara dahil et
- [ ] Döviz alımı için kur alanı
- [ ] KDV hesabı

### Satış
- [ ] Müşteri ve sipariş takibi
- [ ] Satış ürün kataloğu: ürün başına gram ve fiyat, otomatik maliyet
- [ ] Dönem filtresi: ay / yıl bazlı kar ve atık

### Arayüz
- [ ] Ana ekrana eklenebilir mobil uygulama (PWA)
- [ ] Açık / koyu tema seçimi
- [ ] Filtre ve arama her tabloda

### Bakım
- [ ] Yazıcı bakım kayıtları: nozzle değişimi, yağlama, kalibrasyon
- [ ] Bakım hatırlatıcı

### Yedek ve altyapı
- [ ] Otomatik günlük yedek (sunucuda)
- [ ] Hata kayıtları (log)
