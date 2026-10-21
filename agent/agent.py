"""Bambu yazici yerel baglayici.

Evde, yazicilarla ayni agda calisir. Yazicilardan MQTT (LAN modu, port 8883)
ile durum okur ve siteye gonderir. Site sunucusu yazicilara dogrudan
erisemez, bu yuzden bu program evde calismali.
"""
import json
import ssl
import time
import urllib.request
from pathlib import Path

import paho.mqtt.client as mqtt

CFG = json.loads((Path(__file__).parent / "config.json").read_text(encoding="utf-8"))
SERVER = CFG["server"].rstrip("/")
TOKEN = CFG["agent_token"]
SEND_EVERY = CFG.get("send_every_s", 20)
JOB_STATES = {"RUNNING": "running", "PREPARE": "running", "PAUSE": "running",
              "FINISH": "finished", "FAILED": "failed"}

last_sent = {}  # serial -> (zaman, durum, is_anahtari)


def post(payload):
    req = urllib.request.Request(
        f"{SERVER}/api.php?a=agent_report",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Agent-Token": TOKEN},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        resp.read()


def tray_info(key, tray):
    return {
        "key": key,
        "type": tray.get("tray_type"),
        "brand": tray.get("tray_sub_brands"),
        "color": tray.get("tray_color"),
        "remain": tray.get("remain"),          # yuzde, RFID'siz makarada -1
        "weight": tray.get("tray_weight"),     # makara agirligi (g), ornek "1000"
    }


def parse_status(p):
    # AMS: unite-slot anahtari ("0-0".."0-3"), harici makara yeri: "EXT"
    ams_root = p.get("ams") or {}
    ams = []
    for unit in ams_root.get("ams", []):
        for tray in unit.get("tray", []):
            ams.append(tray_info(f"{unit.get('id', 0)}-{tray.get('id', 0)}", tray))
    if isinstance(p.get("vt_tray"), dict):
        ams.append(tray_info("EXT", p["vt_tray"]))
    try:
        n = int(ams_root.get("tray_now", 255))
    except (TypeError, ValueError):
        n = 255
    tray_now = "EXT" if n == 254 else (f"{n // 4}-{n % 4}" if n < 16 else None)
    return {
        "tray_now": tray_now,
        "state": p.get("gcode_state"),
        "progress": p.get("mc_percent"),
        "remaining_min": p.get("mc_remaining_time"),
        "nozzle": p.get("nozzle_temper"),
        "bed": p.get("bed_temper"),
        "ams": ams,
    }


def make_callbacks(printer):
    serial = printer["serial"]

    def on_connect(client, userdata, flags, reason_code, properties=None):
        if reason_code.is_failure:
            print(f"[{printer['name']}] baglanti reddedildi: {reason_code}. Erisim kodu ve LAN modunu kontrol et.")
            return
        print(f"[{printer['name']}] bagli, rapor dinleniyor")
        client.subscribe(f"device/{serial}/report")
        # Yazicidan tam durum iste (yoksa sadece degisen alanlari yollar).
        client.publish(f"device/{serial}/request",
                       json.dumps({"pushing": {"sequence_id": "0", "command": "pushall"}}))

    merged = {}  # yazici bazen sadece degisen alanlari yollar; son tam durumu tut

    def on_message(client, userdata, msg):
        data = json.loads(msg.payload)
        update = data.get("print")
        if not isinstance(update, dict):
            return
        merged.update(update)
        p = merged
        if "gcode_state" not in p:
            return
        st = parse_status(p)
        job_key = str(p.get("subtask_id") or p.get("job_id") or "")
        job = None
        if job_key and st["state"] in JOB_STATES:
            job = {
                "key": job_key,
                "name": p.get("subtask_name") or p.get("gcode_file") or "",
                "state": st["state"],
                "progress": st["progress"],
            }

        now = time.time()
        prev_time, prev_state, prev_key = last_sent.get(serial, (0, None, None))
        changed = (st["state"], job_key) != (prev_state, prev_key)
        if not changed and now - prev_time < SEND_EVERY:
            return
        last_sent[serial] = (now, st["state"], job_key)
        try:
            post({"serial": serial, "status": st, "job": job})
        except Exception as exc:  # ag hatasi programi durdurmasin
            print(f"[{printer['name']}] gonderilemedi: {exc}")

    return on_connect, on_message


def start(printer):
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"fil-{printer['serial']}")
    client.username_pw_set("bblp", printer["access_code"])
    # Yazici kendi sertifikasini kullanir (self-signed), dogrulama kapali.
    client.tls_set(cert_reqs=ssl.CERT_NONE)
    client.tls_insecure_set(True)
    on_connect, on_message = make_callbacks(printer)
    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = lambda c, u, f, rc, p=None: print(f"[{printer['name']}] baglanti koptu ({rc}), yeniden denenecek")
    client.reconnect_delay_set(min_delay=5, max_delay=60)
    # connect_async: yaziciya ulasilamazsa program cokmez, arka planda tekrar dener.
    client.connect_async(printer["ip"], 8883, keepalive=60)
    client.loop_start()
    print(f"[{printer['name']}] {printer['ip']}:8883 adresine baglaniliyor...")
    return client


def check_config():
    bad = [p["name"] for p in CFG["printers"]
           if "SERI-NO" in p["serial"] or "ERISIM" in p["access_code"] or p["ip"] in ("192.168.1.50", "192.168.1.51")]
    if bad:
        print("HATA: agent/config.json icinde ornek degerler duruyor:", ", ".join(bad))
        print("Her yazicinin ekranindan IP adresini, erisim kodunu (Access Code) ve seri numarasini yaz.")
        raise SystemExit(1)


def main():
    check_config()
    clients = [start(p) for p in CFG["printers"]]
    print(f"{len(clients)} yazici icin baglanti baslatildi. Durdurmak icin Ctrl+C.")
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        for c in clients:
            c.loop_stop()
            c.disconnect()


if __name__ == "__main__":
    main()
