"""Filament uygulamasini sunucuya yukler (FTPS). Sadece asagidaki dosyalar gider.
config.local.php, dev/, agent/, data/*.db ASLA yuklenmez.
Kullanim: FTP_HOST=... FTP_USER=... FTP_REMOTE=/klasor FTP_PASS=... python dev/upload.py"""
import ftplib
import os
import sys
from pathlib import Path

# Sunucu bilgileri ortam degiskeninden gelir; repoda site bilgisi tutulmaz.
HOST = os.environ.get("FTP_HOST") or sys.exit("FTP_HOST ortam degiskeni gerekli")
USER = os.environ.get("FTP_USER") or sys.exit("FTP_USER ortam degiskeni gerekli")
REMOTE = os.environ.get("FTP_REMOTE") or sys.exit("FTP_REMOTE ortam degiskeni gerekli (ornek /httpdocs/filament)")
FILES = [".htaccess", ".user.ini", "index.html", "api.php", "config.php", "manifest.webmanifest",
         "static/app.js", "static/style.css", "static/catalog.js", "static/icon.svg",
         "static/icon-180.png", "static/icon-192.png", "static/icon-512.png", "data/.htaccess"]

root = Path(__file__).resolve().parent.parent
pw = os.environ.get("FTP_PASS") or sys.exit("FTP_PASS ortam degiskeni gerekli")
f = ftplib.FTP_TLS(HOST, timeout=30)
f.login(USER, pw)
f.prot_p()
for rel in FILES:
    with open(root / rel, "rb") as fh:
        f.storbinary(f"STOR {REMOTE}/{rel}", fh)
    print("yuklendi", rel)
f.quit()
