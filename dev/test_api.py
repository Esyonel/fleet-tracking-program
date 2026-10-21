"""Yerel API uctan uca testi. Calistir: python dev/test_api.py
Sunucu: php -S localhost:8080 (config.local.php ile). Her calismada dev/test.db sifirlanir."""
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:8080/api.php"
PASSWORD = "1234"
AGENT = "yerel-test-agent-token-0123456789abcdef"
DB = os.path.join(os.path.dirname(__file__), "test.db")

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
fails = 0


def call(action, method="GET", id=None, body=None, headers=None, csrf=True, extra=""):
    url = f"{BASE}?a={action}" + (f"&id={id}" if id is not None else "") + extra
    h = {"Content-Type": "application/json"}
    if csrf:
        h["X-Requested-With"] = "fetch"
    h.update(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with opener.open(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def check(name, cond, info=""):
    global fails
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails += 1


def near(a, b):
    return abs(float(a) - float(b)) < 0.01


if os.path.exists(DB):
    os.remove(DB)

# --- giris ve yetki ---
s, _ = call("summary"); check("girissiz summary 401", s == 401, s)
s, _ = call("login", "POST", body={"password": "x"}, csrf=False); check("CSRF basliksiz POST 403", s == 403, s)
s, m = call("auth_mode"); check("panel koprusu modu", m.get("mode") == "admin", m)
s, _ = call("login", "POST", body={"username": "admin", "password": "yanlis"}); check("yanlis sifre 401", s == 401, s)
s, _ = call("login", "POST", body={"username": "yok", "password": PASSWORD}); check("olmayan kullanici 401", s == 401, s)
s, _ = call("login", "POST", body={"password": PASSWORD}); check("kullanici adisiz 401", s == 401, s)
s, _ = call("login", "POST", body={"username": "admin", "password": PASSWORD}); check("panel kullanicisiyla giris 200", s == 200, s)
s, m = call("auth_mode"); check("oturum kullanicisi admin", m.get("user") == "admin", m)
s, _ = call("summary"); check("girisli summary 200", s == 200, s)

# --- alimlar ---
s, r = call("purchase", "POST", body={"date": "2026-10-01", "brand": "Bambu Lab", "material": "PLA", "color": "Kirmizi",
                                      "color_hex": "#ff0000", "net_g": 1000, "qty": 2, "unit_price": 500, "payment_type": "cash",
                                      "product": "PLA Basic", "color_code": "10200"})
check("nakit alim 201, toplam 1000", s == 201 and near(r["total_paid"], 1000), r)
s, r = call("purchase", "POST", body={"date": "2026-10-02", "brand": "Esun", "material": "PETG", "color": "Siyah",
                                      "color_hex": "#111111", "net_g": 1000, "qty": 1, "unit_price": 1500, "payment_type": "card",
                                      "card_name": "Bonus", "installments": 6, "monthly_amount": 300})
check("kartli 6 taksit, toplam 1800", s == 201 and near(r["total_paid"], 1800), r)
s, r = call("purchase", "POST", body={"date": "2026-10-02", "brand": "", "material": "PLA", "color": "x",
                                      "net_g": 1000, "qty": 1, "unit_price": 1, "payment_type": "cash"})
check("eksik marka 400", s == 400, s)
s, r = call("purchase", "POST", body={"date": "2026-10-02", "brand": "X", "material": "PLA", "color": "<script>",
                                      "color_hex": "red;background:url(x)", "net_g": 1000, "qty": 1, "unit_price": 1, "payment_type": "cash"})
check("gecersiz hex kabul edilir ama temizlenir", s == 201, s)

s, spools = call("spools")
check("4 makara", s == 200 and len(spools) == 4, len(spools) if isinstance(spools, list) else spools)
red, black, bad = spools[0], spools[2], spools[3]
check("kirmizi g basi 0.5", near(red["cost_per_g"], 0.5), red["cost_per_g"])
check("siyah g basi 1.8", near(black["cost_per_g"], 1.8), black["cost_per_g"])
check("hex temizlendi", bad["color_hex"] == "#888888", bad["color_hex"])
check("urun + renk kodu makaraya yazildi", red.get("product") == "PLA Basic" and red.get("color_code") == "10200", red)
check("yeni makara kapali", red["status"] == "kapali", red["status"])
s, cards = call("cards")
check("alanlarla alim kart olusturdu (3 kart)", s == 200 and len(cards) == 3, len(cards) if isinstance(cards, list) else cards)
check("makara karta bagli", red["card_id"] in [c["id"] for c in cards], red.get("card_id"))

# --- baski, atik, tarti ---
s, _ = call("spool_use", "POST", id=red["id"], body={"kind": "print", "grams": 300}); check("baski 300g", s == 201, s)
s, _ = call("spool_use", "POST", id=red["id"], body={"kind": "waste", "grams": 50, "category": "failed"}); check("atik 50g", s == 201, s)
s, r = call("spool_weigh", "POST", id=red["id"], body={"measured_g": 600}); check("tarti sapma -50", s == 201 and near(r["diff_g"], -50), r)
s, _ = call("spool_use", "POST", id=red["id"], body={"kind": "print", "grams": 5000}); check("kalandan fazla 400", s == 400, s)
s, _ = call("spool_weigh", "POST", id=red["id"], body={"measured_g": 5000}); check("rulodan buyuk tarti 400", s == 400, s)
s, _ = call("spool_use", "POST", id=999, body={"kind": "print", "grams": 1}); check("olmayan makara 404", s == 404, s)
s, _ = call("spool_use", "POST", id=black["id"], body={"kind": "print", "grams": 880}); check("siyah 880g (kalan 120)", s == 201, s)

s, spools = call("spools")
red = next(x for x in spools if x["id"] == red["id"])
check("kirmizi kalan 600", near(red["remaining_g"], 600), red["remaining_g"])

# --- satis ---
# satilan parca: iki rulodan gram duser
s, _ = call("sale", "POST", body={"date": "2026-10-05", "description": "Anahtarlik", "price": 200,
                                  "items": [{"spool_id": red["id"], "grams": 100}, {"spool_id": black["id"], "grams": 20}]})
check("satis 201", s == 201, s)
s, sales = call("sales")
check("satis 2 satir, malzeme 86 (50 + 36)", len(sales[0]["items"]) == 2 and near(sales[0]["material_cost"], 86), sales[0])
s, spools = call("spools")
check("satis gramlari rulolardan dustu (kirmizi 500, siyah 100)",
      near(next(x for x in spools if x["id"] == red["id"])["remaining_g"], 500)
      and near(next(x for x in spools if x["id"] == black["id"])["remaining_g"], 100))
s, _ = call("sale", "POST", body={"description": "Fazla", "price": 1, "items": [{"spool_id": black["id"], "grams": 101}]})
check("kalandan fazla satis 400", s == 400, s)
s, _ = call("sale", "POST", body={"description": "Fazla", "price": 1, "items": [{"spool_id": black["id"], "grams": 60},
                                                                               {"spool_id": black["id"], "grams": 60}]})
check("ayni rulo iki satirda toplam fazla 400", s == 400, s)
s, _ = call("sale", "POST", body={"description": "", "price": 1, "items": []}); check("parca adi zorunlu 400", s == 400, s)
s, _ = call("sale", "POST", body={"description": "Satirsiz", "price": 1, "items": [{"spool_id": 0, "grams": 5}]})
check("filamentsiz gram 400", s == 400, s)
s, evs = call("events", extra=f"&spool_id={red['id']}")
se = next(e for e in evs if (e.get("note") or "").startswith("Satis:"))
s, _ = call("event_update", "POST", id=se["id"], body={"grams": 1}); check("satis hareketi duzenlenemez 400", s == 400, s)
s, _ = call("event", "DELETE", id=se["id"]); check("satis hareketi silinemez 400", s == 400, s)
s, r = call("sale", "POST", body={"description": "Gecici", "price": 10, "items": [{"spool_id": red["id"], "grams": 30}]})
s, _ = call("sale", "DELETE", id=r["id"])
s, spools = call("spools")
check("silinen satisin grami geri geldi", near(next(x for x in spools if x["id"] == red["id"])["remaining_g"], 500))

# --- yazici ve agent ---
s, _ = call("printer", "POST", body={"name": "Bambu Lab A2L", "model": "A2L", "serial": "A2L-TEST"}); check("yazici A2L", s == 201, s)
s, _ = call("printer", "POST", body={"name": "Bambu Lab X2D", "model": "X2D", "serial": "X2D-TEST"}); check("yazici X2D", s == 201, s)
s, _ = call("printer", "POST", body={"name": "Kopya", "serial": "A2L-TEST"}); check("ayni seri 409", s == 409, s)

agent_h = {"X-Agent-Token": AGENT}
status = {"state": "RUNNING", "progress": 42, "remaining_min": 30, "nozzle": 220, "bed": 60,
          "tray_now": "0-0",
          "ams": [{"key": "0-0", "type": "PLA", "brand": "Bambu PLA Basic", "color": "FF0000FF", "remain": 70, "weight": "1000"},
                  {"key": "0-1", "type": "PETG", "brand": "", "color": "1E6BFFFF", "remain": -1, "weight": "1000"},
                  {"key": "0-2", "type": "PLA", "brand": "", "color": "FFFFFFFF", "remain": 40, "weight": "1000"},
                  {"key": "EXT", "type": "TPU", "brand": "", "color": "222222FF", "remain": -1, "weight": "1000"}]}
s, _ = call("agent_report", "POST", body={"serial": "A2L-TEST", "status": status}, headers={"X-Agent-Token": "yanlis"}, csrf=False)
check("agent yanlis token 401", s == 401, s)
s, _ = call("agent_report", "POST", body={"serial": "YOK", "status": status}, headers=agent_h, csrf=False)
check("kayitsiz seri 404", s == 404, s)
s, _ = call("agent_report", "POST", body={"serial": "A2L-TEST", "status": status,
                                           "job": {"key": "111", "name": "benchy.3mf", "state": "RUNNING", "progress": 42}},
            headers=agent_h, csrf=False)
check("agent RUNNING", s == 200, s)
status["state"], status["progress"] = "FINISH", 100
s, _ = call("agent_report", "POST", body={"serial": "A2L-TEST", "status": status,
                                           "job": {"key": "111", "name": "benchy.3mf", "state": "FINISH", "progress": 100}},
            headers=agent_h, csrf=False)
check("agent FINISH", s == 200, s)

# AMS slotu: makarayi slot 0-1'e ata, aktif slot oyken yeni is otomatik o makaraya baglanmali
s, printers = call("printers")
a2l_id = next(p for p in printers if p["serial"] == "A2L-TEST")["id"]
s, _ = call("slot_assign", "POST", id=a2l_id, body={"slot": "0-1", "spool_id": red["id"]}); check("slota makara ata", s == 200, s)
s, _ = call("slot_assign", "POST", id=a2l_id, body={"slot": "9x", "spool_id": red["id"]}); check("gecersiz slot 400", s == 400, s)
s, _ = call("slot_assign", "POST", id=a2l_id, body={"slot": "EXT", "spool_id": black["id"]}); check("harici slota ata", s == 200, s)
st2 = {**status, "state": "RUNNING", "tray_now": "0-1"}
s, _ = call("agent_report", "POST", body={"serial": "A2L-TEST", "status": st2,
                                           "job": {"key": "222", "name": "kup.3mf", "state": "RUNNING", "progress": 5}},
            headers=agent_h, csrf=False)
s, jobs = call("jobs")
j222 = next(j for j in jobs if j["job_key"] == "222")
check("is aktif slotun makarasina baglandi", j222["spool_id"] == red["id"], j222.get("spool_id"))
s, printers = call("printers")
a2l = next(p for p in printers if p["serial"] == "A2L-TEST")
check("slot listesi", a2l["slots"].get("0-1") == red["id"] and a2l["slots"].get("EXT") == black["id"], a2l["slots"])
s, _ = call("slot_assign", "POST", id=a2l_id, body={"slot": "0-2", "spool_id": red["id"]})
s, printers = call("printers")
a2l = next(p for p in printers if p["serial"] == "A2L-TEST")
check("makara tek slotta durur", "0-1" not in a2l["slots"] and a2l["slots"].get("0-2") == red["id"], a2l["slots"])
s, _ = call("job", "DELETE", id=j222["id"])
call("agent_report", "POST", body={"serial": "A2L-TEST", "status": status}, headers=agent_h, csrf=False)
s, printers = call("printers")
a2l = next(p for p in printers if p["serial"] == "A2L-TEST")
check("A2L online", a2l["online"] is True, a2l.get("online"))
check("A2L durum FINISH", a2l["status"]["state"] == "FINISH", a2l["status"])
x2d = next(p for p in printers if p["serial"] == "X2D-TEST")
check("X2D offline", x2d["online"] is False, x2d.get("online"))

s, jobs = call("jobs")
check("1 is, bitti", len(jobs) == 1 and jobs[0]["status"] == "finished" and jobs[0]["ended_at"], jobs)
job = jobs[0]
s, _ = call("job_assign", "POST", id=job["id"], body={"spool_id": red["id"], "grams": 40, "price": 150})
check("ise makara ata", s == 200, s)
s, _ = call("job_assign", "POST", id=job["id"], body={"spool_id": red["id"], "grams": 60, "price": 150})
check("yeniden ata (eski hareket silinir)", s == 200, s)
s, jobs = call("jobs"); check("is maliyeti 30", near(jobs[0]["cost"], 30), jobs[0])
s, spools = call("spools")
red = next(x for x in spools if x["id"] == red["id"])
check("kirmizi kalan 440 (500-60)", near(red["remaining_g"], 440), red["remaining_g"])

s, printers = call("printers")
a2l = next(p for p in printers if p["serial"] == "A2L-TEST")
check("A2L kar 120 (150-30)", near(a2l["summary"]["profit"], 120), a2l["summary"])

# --- ozet ---
s, sm = call("summary")
check("gelir 350 (satis 200 + is 150)", near(sm["revenue"], 350), sm["revenue"])
# tuketim: kirmizi 300+50+50+60+100=560g*0.5=280, siyah (880+20)*1.8=1620 -> 1900
check("tuketilen maliyet 1900", near(sm["consumed_cost"], 1900), sm["consumed_cost"])
check("kar -1550", near(sm["profit"], 350 - 1900), sm["profit"])
check("toplam alim 2801", near(sm["purchases_total"], 2801), sm["purchases_total"])
check("atik 100g (50 atik + 50 sapma)", near(sm["waste_g"], 100), sm["waste_g"])
check("dusuk stok: siyah 100g", [x["id"] for x in sm["low_stock"]] == [black["id"]], sm["low_stock"])

# --- silme ---
s, events = call("events", extra="&kind=waste")
check("atik listesi 1", len(events) == 1, len(events))
s, _ = call("event", "DELETE", id=events[0]["id"]); check("atik sil", s == 200, s)
s, _ = call("job", "DELETE", id=job["id"]); check("is sil", s == 200, s)
s, spools = call("spools")
red = next(x for x in spools if x["id"] == red["id"])
check("silmeden sonra kirmizi 550", near(red["remaining_g"], 550), red["remaining_g"])
s, _ = call("printer", "DELETE", id=x2d["id"]); check("yazici sil", s == 200, s)
s, _ = call("bilinmeyen"); check("bilinmeyen rota 404", s == 404, s)

# --- stok karti: filament bolumunde sadece kart, stok alimla gelir ---
s, r = call("card", "POST", body={"brand": "Elegoo", "material": "PLA", "color": "Beyaz", "color_hex": "#ffffff", "net_g": 1000})
check("stok karti ekle", s == 201, r)
cid = r.get("id")
s, _ = call("card", "POST", body={"brand": "elegoo ", "material": "PLA", "color": "beyaz", "net_g": 1000})
check("ayni kart 409", s == 409, s)
s, _ = call("card", "POST", body={"brand": "E", "material": "PLA", "color": "x", "net_g": 0})
check("rulo grami 0 400", s == 400, s)
s, cards = call("cards")
c = next(x for x in cards if x["id"] == cid)
check("yeni kartin stogu yok", c["roll_count"] == 0 and near(c["remaining_g"], 0), c)
s, _ = call("spool", "POST", body={"brand": "E", "material": "PLA", "color": "x", "net_g": 1000})
check("elle rulo eklenemez 404", s == 404, s)
s, _ = call("purchase", "POST", body={"date": "2026-10-09", "card_id": 99999, "qty": 1, "unit_price": 1, "payment_type": "cash"})
check("olmayan kartla alim 404", s == 404, s)
s, r = call("purchase", "POST", body={"date": "2026-10-09", "card_id": cid, "qty": 1, "unit_price": 400, "payment_type": "cash"})
check("kartla alim 201", s == 201 and r.get("card_id") == cid, r)
new_pid = r.get("id")
s, cards = call("cards")
c = next(x for x in cards if x["id"] == cid)
check("alimdan sonra kartta 1 kapali rulo, 1000 g", c["roll_count"] == 1 and c["closed_count"] == 1
      and near(c["remaining_g"], 1000) and c["purchase_count"] == 1, c)
new_id = c["rolls"][0]["id"]
s, _ = call("spool_weigh", "POST", id=new_id, body={"measured_g": 400})
s, spools = call("spools")
w = next(x for x in spools if x["id"] == new_id)
check("tartidan sonra kalan 400", near(w["remaining_g"], 400), w["remaining_g"])
s, _ = call("card_update", "POST", id=cid, body={"brand": "Elegoo", "material": "PETG", "color": "Krem", "color_hex": "#eeddcc",
                                                 "net_g": 1000, "product": "PETG Pro"})
check("kart duzenle", s == 200, s)
s, spools = call("spools")
w = next(x for x in spools if x["id"] == new_id)
check("kart duzenlemesi ruloya yazildi, 0.4/g", w["material"] == "PETG" and w["color"] == "Krem" and w["product"] == "PETG Pro"
      and near(w["cost_per_g"], 0.4), w)
s, purchases = call("purchases")
check("kart duzenlemesi alima yazildi", next(p for p in purchases if p["id"] == new_pid)["color"] == "Krem")
s, _ = call("card_update", "POST", id=cid, body={"brand": "Bambu Lab", "material": "PLA", "color": "Kirmizi", "net_g": 1000,
                                                 "product": "PLA Basic", "color_code": "10200"})
check("baska kartla ayni tanim 409", s == 409, s)
s, _ = call("card", "DELETE", id=cid); check("bagli kart silinemez 409", s == 409, s)
s, _ = call("spool", "DELETE", id=new_id); check("alima bagli rulo tek basina silinemez 409", s == 409, s)

s, purchases = call("purchases")
card_p = next(p for p in purchases if p["payment_type"] == "card")
s, r = call("purchase_update", "POST", id=card_p["id"], body={**card_p, "monthly_amount": 350, "installments": 6})
check("alim duzenle toplam 2100", s == 200 and near(r["total_paid"], 2100), r)
s, spools = call("spools")
blk = next(x for x in spools if x["purchase_id"] == card_p["id"])
check("bagli makara maliyeti 2100", near(blk["cost_total"], 2100), blk["cost_total"])
s, r = call("purchase_update", "POST", id=card_p["id"], body={**card_p, "monthly_amount": 350, "installments": 6, "net_g": 900})
check("alimda rulo grami 900 yapildi", s == 200, r)
s, spools = call("spools")
blk = next(x for x in spools if x["purchase_id"] == card_p["id"])
check("rulo grami 900, kalan 0 (900-880-20)", near(blk["net_g"], 900) and near(blk["remaining_g"], 0), blk)
s, _ = call("purchase_update", "POST", id=card_p["id"], body={**card_p, "monthly_amount": 350, "installments": 6, "net_g": 800})
check("rulo grami kullanilandan (900) kucuk 400", s == 400, s)

s, printers = call("printers")
a2l = next(p for p in printers if p["serial"] == "A2L-TEST")
s, _ = call("printer_update", "POST", id=a2l["id"], body={"name": "A2L Atolye", "model": "A2L", "serial": "A2L-TEST", "ip": "192.168.1.5"})
check("yazici duzenle", s == 200, s)
s, _ = call("printer", "POST", body={"name": "X2D", "serial": "X2D-2"})
s, printers = call("printers")
x2 = next(p for p in printers if p["serial"] == "X2D-2")
s, _ = call("printer_update", "POST", id=x2["id"], body={"name": "X2D", "serial": "A2L-TEST"})
check("yazici seri cakismasi 409", s == 409, s)

s, sales = call("sales")
s, _ = call("sale_update", "POST", id=sales[0]["id"], body={**sales[0], "price": 250})
s, sales = call("sales")
check("satis duzenle 250, satirlar korundu", near(sales[0]["price"], 250) and len(sales[0]["items"]) == 2, sales[0])
s, _ = call("sale_update", "POST", id=sales[0]["id"], body={**sales[0], "items": [{"spool_id": red["id"], "grams": 50}]})
s, sales = call("sales")
s, spools = call("spools")
check("satis duzenle: tek satir 50g, kirmizi 600",
      len(sales[0]["items"]) == 1 and near(next(x for x in spools if x["id"] == red["id"])["remaining_g"], 600), sales[0])

s, _ = call("spool_use", "POST", id=new_id, body={"kind": "print", "grams": 50})
s, evs = call("events", extra=f"&spool_id={new_id}")
pe = next(e for e in evs if e["kind"] == "print")
s, _ = call("event_update", "POST", id=pe["id"], body={"grams": 80, "date": "2026-10-10", "note": "duzeltildi"})
check("hareket duzenle", s == 200, s)
s, spools = call("spools")
w = next(x for x in spools if x["id"] == new_id)
check("duzenleme sonrasi kalan 320", near(w["remaining_g"], 320), w["remaining_g"])
we = next(e for e in evs if e["kind"] == "weigh")
s, _ = call("event_update", "POST", id=we["id"], body={"grams": 1})
check("tarti duzenlenemez 400", s == 400, s)
s, _ = call("event_update", "POST", id=pe["id"], body={"grams": 99999})
check("hareket kalandan fazla 400", s == 400, s)

s, _ = call("purchase", "DELETE", id=new_pid); check("alim sil", s == 200, s)
s, spools = call("spools"); check("alimin rulosu silindi", all(x["id"] != new_id for x in spools), len(spools))
s, _ = call("card", "DELETE", id=cid); check("bos kart sil", s == 200, s)
s, _ = call("card", "DELETE", id=cid); check("tekrar sil 404", s == 404, s)

# --- satis dosyalari (resim, 3MF) ---
import base64, io, uuid, zipfile


def upload(sale_id, files):
    b = uuid.uuid4().hex
    body = b""
    for name, data in files:
        body += (f"--{b}\r\nContent-Disposition: form-data; name=\"files[]\"; filename=\"{name}\"\r\n"
                 f"Content-Type: application/octet-stream\r\n\r\n").encode() + data + b"\r\n"
    body += f"--{b}--\r\n".encode()
    req = urllib.request.Request(f"{BASE}?a=sale_file_upload&id={sale_id}", data=body, method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={b}", "X-Requested-With": "fetch"})
    try:
        with opener.open(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
zbuf = io.BytesIO()
with zipfile.ZipFile(zbuf, "w") as z:
    z.writestr("3D/3dmodel.model", "<model/>")
s, r = call("sale", "POST", body={"description": "Dosyali parca", "price": 10, "items": []})
fsid = r["id"]
s, r = upload(fsid, [("urun.png", PNG), ("parca.3mf", zbuf.getvalue())])
check("resim + 3mf yukle 201", s == 201 and len(r.get("ids", [])) == 2, r)
s, _ = upload(fsid, [("virus.exe", b"MZ")]); check("izinsiz uzanti 400", s == 400, s)
s, _ = upload(fsid, [("sahte.png", b"not an image")]); check("sahte resim 400", s == 400, s)
s, _ = upload(fsid, [("sahte.3mf", b"not a zip")]); check("sahte 3mf 400", s == 400, s)
s, _ = upload(99999, [("urun.png", PNG)]); check("olmayan satisa yukleme 404", s == 404, s)
s, sales = call("sales")
fs = next(x for x in sales if x["id"] == fsid)["files"]
check("satista 2 dosya", len(fs) == 2 and {f["kind"] for f in fs} == {"image", "model"}, fs)
img = next(f for f in fs if f["kind"] == "image")
with opener.open(urllib.request.Request(f"{BASE}?a=sale_file&id={img['id']}")) as r:
    check("resim indirilir (inline, image/png)", r.read() == PNG and r.headers["Content-Type"] == "image/png"
          and r.headers["Content-Disposition"].startswith("inline"), dict(r.headers))
mdl = next(f for f in fs if f["kind"] == "model")
with opener.open(urllib.request.Request(f"{BASE}?a=sale_file&id={mdl['id']}")) as r:
    check("3mf ek olarak indirilir", r.read() == zbuf.getvalue() and r.headers["Content-Disposition"].startswith("attachment"))
updir = os.path.join(os.path.dirname(__file__), "uploads", "sales")
check("dosyalar diskte", len(os.listdir(updir)) >= 2, os.listdir(updir))
s, _ = call("sale_file", "DELETE", id=img["id"]); check("dosya sil", s == 200, s)
s, _ = call("sale", "DELETE", id=fsid); check("dosyali satis sil", s == 200, s)
check("satis silinince dosyalar diskten silindi", len(os.listdir(updir)) == 0, os.listdir(updir))
s, r = call("upload_limit"); check("yukleme siniri", s == 200 and r["bytes"] > 0, r)

# --- yedek indirme ---
with opener.open(urllib.request.Request(f"{BASE}?a=backup")) as r:
    raw = r.read()
    disp = r.headers.get("Content-Disposition", "")
check("yedek SQLite dosyasi", raw.startswith(b"SQLite format 3") and "filament-yedek-" in disp, disp)

# --- cikis ---
call("logout")
jar.clear()
s, _ = call("summary"); check("cikis sonrasi 401", s == 401, s)
s, _ = call("backup"); check("girissiz yedek 401", s == 401, s)

print(f"\n{'HEPSI GECTI' if fails == 0 else str(fails) + ' HATA'}")
sys.exit(1 if fails else 0)
