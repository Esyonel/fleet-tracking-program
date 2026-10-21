"""Stok karti gocmesi testi: canli veritabaninin kopyasiyla calisir, hicbir verinin kaybolmadigini kontrol eder.
Calistir: python dev/test_migration.py sunucu-yedek/db/<yedek>.db
Sunucu: php -S localhost:8080 (config.local.php ile, DB_FILE = dev/test.db). dev/test.db uzerine yazilir."""
import glob
import http.cookiejar
import json
import os
import shutil
import sqlite3
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:8080/api.php"
PASSWORD = "1234"
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
fails = 0


def call(action, method="GET", body=None):
    req = urllib.request.Request(f"{BASE}?a={action}", data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", "X-Requested-With": "fetch"}, method=method)
    try:
        with opener.open(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def check(name, cond, info=""):
    global fails
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    fails += 0 if cond else 1


def near(a, b):
    return abs(float(a) - float(b)) < 0.01


SRC = sys.argv[1]
DB = os.path.join(os.path.dirname(__file__), "test.db")

src = sqlite3.connect(SRC)
src.row_factory = sqlite3.Row
before = {r["id"]: dict(r) for r in src.execute("SELECT * FROM spools")}
delta = {r[0]: r[1] for r in src.execute("SELECT spool_id, SUM(grams) FROM events GROUP BY spool_id")}
counts = {t: src.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
          for t in ["purchases", "spools", "events", "sales", "printers", "jobs", "printer_slots"]}
paid = src.execute("SELECT COALESCE(SUM(total_paid), 0) FROM purchases").fetchone()[0]
slots = sorted(tuple(r) for r in src.execute("SELECT printer_id, slot, spool_id FROM printer_slots"))
src.close()

for f in glob.glob(os.path.join(os.path.dirname(__file__), "filament-yedek-*.db")):
    os.remove(f)
shutil.copy(SRC, DB)

s, _ = call("login", "POST", body={"username": "admin", "password": PASSWORD}); check("giris", s == 200, s)
s, spools = call("spools"); check("rulolar okunur (gocme calisti)", s == 200, spools)
check("yedek dosyasi olustu", len(glob.glob(os.path.join(os.path.dirname(__file__), "filament-yedek-*.db"))) == 1)
check(f"rulo sayisi ayni ({counts['spools']})", len(spools) == counts["spools"], len(spools))
check("her rulonun karti var", all(x["card_id"] for x in spools), [x["id"] for x in spools if not x["card_id"]])
for x in spools:
    b = before[x["id"]]
    exp = b["net_g"] + (delta.get(x["id"]) or 0)
    ok = (near(x["remaining_g"], exp) and near(x["cost_total"], b["cost_total"]) and x["purchase_id"] == b["purchase_id"]
          and x["brand"] == b["brand"] and x["color"] == b["color"])
    check(f"rulo {x['id']} degismedi", ok, (x["remaining_g"], exp, x["cost_total"], b["cost_total"]))

s, purchases = call("purchases")
check(f"alim sayisi ayni ({counts['purchases']})", len(purchases) == counts["purchases"], len(purchases))
check("her alimin karti var", all(p["card_id"] for p in purchases), [p["id"] for p in purchases if not p["card_id"]])
check("toplam odenen ayni", near(sum(p["total_paid"] for p in purchases), paid))

s, cards = call("cards")
check("kartlar olustu", s == 200 and len(cards) > 0, cards)
rolls = sorted(r["id"] for c in cards for r in c["rolls"]) + []
active = sorted(x["id"] for x in spools if x["status"] != "bitti")
check("kartlardaki rulolar = bitmemis rulolar", rolls == active, (rolls, active))
check("kart kalan toplami = rulo kalan toplami",
      near(sum(c["remaining_g"] for c in cards), sum(max(x["remaining_g"], 0) for x in spools if x["status"] != "bitti")))

con = sqlite3.connect(DB)
for t, n in counts.items():
    check(f"{t} sayisi ayni ({n})", con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] == n)
check("AMS slotlari ayni", sorted(tuple(r) for r in con.execute("SELECT printer_id, slot, spool_id FROM printer_slots")) == slots)
con.close()

s, _ = call("spools")
check("ikinci istekte yeni yedek alinmaz",
      len(glob.glob(os.path.join(os.path.dirname(__file__), "filament-yedek-*.db"))) == 1)
for f in glob.glob(os.path.join(os.path.dirname(__file__), "filament-yedek-*.db")):
    os.remove(f)
print("\nKart listesi:")
for c in cards:
    print(f"  #{c['id']:>2} {c['brand']} · {c['product'] or c['material']} · {c['color']} · {c['roll_count']} rulo, "
          f"{round(c['remaining_g'])} g, {c['purchase_count']} alim")
print(f"\n{'HEPSI GECTI' if fails == 0 else str(fails) + ' HATA'}")
sys.exit(1 if fails else 0)
