"""Filament katalogu uretir: static/catalog.js
Kaynak: Bambu Studio acik kaynak profilleri (github.com/bambulab/BambuStudio, resources/profiles/BBL/filament)
 - filaments_color_codes.json: Bambu Lab renk kodlari (etiketteki 5 haneli kod, AMS kodu, renk adi, hex)
 - "<Marka Urun> @base.json": nozul / yatak sicakligi, fan, akis (inherits zinciri cozulur)
Calistir: python dev/build_catalog.py   (internet gerekir; sonucu siteye yuklemek yeterli)"""
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

RAW = "https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/filament/"
TREE = "https://api.github.com/repos/bambulab/BambuStudio/git/trees/master?recursive=1"
OUT = Path(__file__).resolve().parent.parent / "static" / "catalog.js"

# Profil adindaki ilk kelime -> (marka, urun on eki)
BRANDS = {
    "Bambu": ("Bambu Lab", ""), "Generic": ("Genel", ""), "PolyLite": ("Polymaker", "PolyLite "),
    "PolyTerra": ("Polymaker", "PolyTerra "), "Fiberon": ("Polymaker", "Fiberon "), "SUNLU": ("SUNLU", ""),
    "eSUN": ("eSUN", ""), "Overture": ("Overture", ""),
}
FIELDS = ["filament_type", "nozzle_temperature", "nozzle_temperature_initial_layer",
          "nozzle_temperature_range_low", "nozzle_temperature_range_high",
          "cool_plate_temp", "eng_plate_temp", "hot_plate_temp", "textured_plate_temp", "supertack_plate_temp",
          "fan_min_speed", "fan_max_speed", "filament_max_volumetric_speed", "filament_density",
          "chamber_temperatures", "temperature_vitrification"]


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "filament-takip"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


cache = {}


def profile(name):
    """Profili inherits zinciriyle birlestir (alt profil ust profili ezer)."""
    if name not in cache:
        cache[name] = get_json(RAW + urllib.parse.quote(name + ".json"))
    p = cache[name]
    parent = p.get("inherits")
    merged = profile(parent) if parent else {}
    return {**merged, **p}


def first(v):
    v = v[0] if isinstance(v, list) and v else v
    try:
        f = float(v)
        return int(f) if f.is_integer() else round(f, 2)
    except (TypeError, ValueError):
        return None


# ---------------- Turk markalari: Porima ve Elas 3D (kendi sitelerinden) ----------------
# Renk degeri sitede yok: RAL kodundan ya da Turkce renk adindan YAKLASIK hex (arayuzde "yaklasik" yazar).
RAL = {"1023": "#F7B500", "1036": "#705335", "2009": "#F54021", "3004": "#75151E", "3020": "#CC0605",
       "4003": "#DE4C8A", "4005": "#6C4675", "5003": "#1D3361", "5015": "#2271B3", "6018": "#57A639",
       "6029": "#20603D", "7015": "#434B4D", "7046": "#82898F", "8007": "#59351F", "9003": "#F4F4F4",
       "9005": "#0A0A0A"}
TR_COLORS = {
    "siyah": "#111111", "beyaz": "#F4F4F4", "kırmızı": "#C8102E", "mavi": "#1E5BC6", "lacivert": "#1B2A4A",
    "yeşil": "#2E9E4F", "sarı": "#F7C600", "turuncu": "#F57C00", "mor": "#6A3D9A", "pembe": "#F06292",
    "gri": "#8A8D91", "gümüş": "#B8BCC2", "altın": "#C9A227", "bakır": "#B87333", "kahverengi": "#6D4C41",
    "kahve": "#6D4C41", "bej": "#D8C3A5", "ten": "#E8C4A0", "naturel": "#EDE6D6", "doğal": "#EDE6D6",
    "şeffaf": "#DDE7EE", "transparan": "#DDE7EE", "antrasit": "#3A3F44", "bordo": "#7B1E2B",
    "turkuaz": "#1FB5AD", "fuşya": "#D6268C", "magenta": "#C2187A", "violet": "#7F4FC9", "krem": "#F3E5C0",
    "fil dişi": "#F2EAD3", "fildişi": "#F2EAD3", "fıstık": "#93C572", "haki": "#7A7D4F", "somon": "#F08A6C",
    "sakura": "#F6C1CC", "latte": "#C8A27C", "mocha": "#7B5B47", "chocolate": "#4E342E", "matcha": "#9DBF6B",
    "pastel sarı": "#F8E6A0", "pastel mavi": "#AFCBEA", "pastel pembe": "#F4C2D0", "pastel yeşil": "#B9DFC0",
    "pastel mor": "#CDB4DB", "açık mavi": "#5DADEC", "açık yeşil": "#7ED957", "koyu yeşil": "#1E5631",
    "koyu mavi": "#123A73", "buz mavi": "#BFE3F2", "gece mavi": "#1A2340", "neon sarı": "#E8F000",
    "neon turuncu": "#FF6A00", "neon yeşil": "#39FF14", "su yeşili": "#7FD8BE", "toz pembe": "#F2B8C6",
    "bebek mavisi": "#A7C7E7", "şarap kırmızı": "#6B0F1A", "yakut kırmızı": "#9B111E", "safir mavi": "#0F52BA",
    "zümrüt yeşil": "#046307", "sedefli mavi": "#4F7CAC", "inci beyaz": "#EFEDE6", "gümüş gri": "#A9ADB3",
    "kil": "#B66A50", "beton": "#8D8D8A", "mercan": "#FF7F50", "tuğla": "#9C4A35", "granit": "#6E6E6E",
    "old but gold": "#B08D57", "pine wood": "#C49A6C", "walnut": "#5C4033", "dark wood": "#4A3426",
    "wood": "#A0764A", "nebula": "#3B2F63", "neptün": "#1F3A93", "galaksi yeşil": "#1E4D2B",
    "lila": "#C8A2C8", "eflatun": "#9B59B6", "olive": "#708238", "zeytin": "#708238", "camel": "#C19A6B",
}


def tr_lower(s):
    return s.replace("I", "ı").replace("İ", "i").lower()


def color_hex(name):
    """RAL kodu varsa onu, yoksa adda gecen en uzun Turkce renk kelimesini kullan."""
    m = re.search(r"RAL\s?(\d{4})", name, re.I)
    if m and m.group(1) in RAL:
        return RAL[m.group(1)]
    low = tr_lower(name)
    for key in sorted(TR_COLORS, key=len, reverse=True):
        if key in low:
            return TR_COLORS[key]
    return None


def fetch_raw(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (filament-takip katalog)"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def to_text(h):
    h = re.sub(r"<script.*?</script>|<style.*?</style>", " ", h, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", h))
    return re.sub(r"\n\s*\n+", "\n", re.sub(r"[ \t]+", " ", t))


def fetch_text(url):
    return to_text(fetch_raw(url))


def rng(pattern, txt):
    # Deger ayni satirda ya da bir sonraki satirda olabilir ("Yazdirma Sicakligi\n210-240 C").
    m = re.search(pattern + r"[^0-9]{0,25}?(\d{1,3})\s*[-–‑]\s*(\d{1,3})", txt, re.I)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(pattern + r"[^0-9]{0,25}?(\d{1,3})", txt, re.I)
    return (int(m.group(1)), int(m.group(1))) if m else (None, None)


def spec_profile(brand, product, material, txt, url):
    nl, nh = rng(r"(?:Yazd[ıi]rma|Nozzle|Nozul) s[ıi]cakl[ıi][ğg][ıi]", txt)
    bl, bh = rng(r"Tabla s[ıi]cakl[ıi][ğg][ıi]", txt)
    fan = re.search(r"(?:So[ğg]utma )?Fan[^%]{0,25}%\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?", txt, re.I)
    dry = re.search(r"Kurutma[:\s]+(\d[^\n]{2,40}|Gerekirse[^\n]{0,30}|[İI]htiya[çc][^\n]{0,30})", txt, re.I)
    heat = re.search(r"(?:S[ıi]cakl[ıi]k Dayan[ıi]m[ıi]|Camla[şs]ma S[ıi]cakl[ıi][ğg][ıi])[:\s]+(\d[^\n]{0,15})", txt, re.I)
    speed = re.search(r"Bask[ıi] h[ıi]z[ıi][:\s]+([^\n]{2,30})", txt, re.I)
    return {
        "brand": brand, "product": product, "filament_type": material,
        "nozzle_temperature": round((nl + nh) / 2 / 5) * 5 if nl else None,
        "nozzle_temperature_range_low": nl, "nozzle_temperature_range_high": nh,
        "bed_low": bl, "bed_high": bh,
        "fan": (f"%{fan.group(1)}" + (f"-{fan.group(2)}" if fan.group(2) else "")) if fan else None,
        "dry": dry.group(1).strip() if dry else None,
        "heat_resistance": heat.group(1).strip() if heat else None,
        "speed": speed.group(1).strip() if speed else None,
        "source": url,
    }


def material_of(title):
    t = title.upper().replace("PET-G", "PETG")
    for m in ["PC/ABS", "ABS/CF", "PLA/CF", "PETG", "PLA", "ABS", "ASA", "TPU", "PA", "HIPS", "PVA", "FLEX"]:
        if m in t:
            return "TPU" if m == "FLEX" else m
    return "Diğer"


def porima():
    profiles, colors = {}, []
    prods = []
    for page in (1, 2, 3, 4):
        batch = get_json(f"https://porima3d.com/products.json?limit=250&page={page}").get("products", [])
        prods += batch
        if not batch:
            break
    for p in prods:
        if "Filament" not in (p.get("product_type") or "") or not p["title"].lower().startswith("porima"):
            continue
        product = re.sub(r"^Porima\s+|\s+Filament(i)?$", "", p["title"]).strip()
        material = material_of(product)
        url = f"https://porima3d.com/products/{p['handle']}"
        try:
            prof = spec_profile("Porima", product, material, fetch_text(url), url)
            profiles[f"Porima|{product}"] = prof
            print("porima", product, prof["nozzle_temperature_range_low"], prof["nozzle_temperature_range_high"])
        except Exception as e:
            print("porima HATA", product, e)
        names = next((o["values"] for o in p.get("options", []) if o["name"].lower().startswith("renk")), [])
        for name in names:
            ral = re.search(r"RAL\s?(\d{4})", name, re.I)
            colors.append({"brand": "Porima", "product": product, "material": material,
                           "code": f"RAL{ral.group(1)}" if ral else "", "ams": "",
                           "name": name, "hex": color_hex(name), "approx": True})
        time.sleep(0.3)
    return profiles, colors


def elas():
    profiles, colors = {}, []
    sm = urllib.request.urlopen(urllib.request.Request("https://elas3d.com/products.xml", headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read().decode()
    urls = [u for u in re.findall(r"<loc>([^<]+)</loc>", sm) if re.search(r"pla|pet-?g|abs|asa|tpu|filament|renk-gecisi", u, re.I)]
    for url in urls:
        try:
            raw = fetch_raw(url)
        except Exception as e:
            print("elas HATA", url, e)
            continue
        txt = to_text(raw)
        og = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"', raw)
        title = html.unescape(og.group(1)).strip() if og else ""
        if not title:
            continue
        up = tr_lower(title).upper().replace("PET-G", "PETG").replace("İ", "I")
        line = re.search(r"(PLA PRO|PLA POWER|PLA PREMIUM|PLA PLUS|PLA\+|SILK|HS ABS|PETG PLUS|PETG|ASA|ABS|TPU|PLA)", up)
        product = line.group(1) if line else "Diğer"
        if "RENK GE" in up and product == "Diğer":
            product = "PLA PLUS"
        material = material_of(product)
        sku = re.search(r'"sku"\s*:\s*"([^"]+)"', raw) or re.search(r"\b(ELAS[A-Z0-9]{6,})\b", txt)
        # Renk adi: basliktan marka, seri, cap, agirlik, "filament", "makarali/makarasiz" atilir.
        name = re.sub(r"(?i)\belas\b|\b3d\b|1[.,]75\s*mm|\b\d+\s*kg\b|\bfilament(i|ler)?\b|\bmakaral[ıi]\b|\bmakaras[ıi]z\b"
                      r"|\bhigh speed\b|\bpet-?g\b|\bpla\b|\bpro\b|\bplus\b|\bpower\b|\bpremium\b|\bhs\b|\babs\b|\basa\b|\btpu\b|\|.*$",
                      " ", title)
        name = re.sub(r"\s+", " ", name).strip(" -+|") or title
        prof = spec_profile("Elas 3D", product, material, txt, url)
        key = f"Elas 3D|{product}"
        if prof["nozzle_temperature_range_low"] and key not in profiles:
            profiles[key] = prof
        colors.append({"brand": "Elas 3D", "product": product, "material": material,
                       "code": sku.group(1) if sku else "", "ams": "", "name": name,
                       "hex": color_hex(name), "approx": True,
                       "nozzle": [prof["nozzle_temperature_range_low"], prof["nozzle_temperature_range_high"]]})
        print("elas", product, "|", name, "|", sku.group(1) if sku else "-")
        time.sleep(0.3)
    return profiles, colors


def main():
    tree = get_json(TREE)["tree"]
    bases = sorted(p["path"].rsplit("/", 1)[1][:-5] for p in tree
                   if p["path"].startswith("resources/profiles/BBL/filament/")
                   and p["path"].count("/") == 4 and p["path"].endswith(" @base.json"))
    profiles = {}
    for base in bases:
        name = base.replace(" @base", "")
        head, _, rest = name.partition(" ")
        if head not in BRANDS:
            continue
        brand, prefix = BRANDS[head]
        product = prefix + rest
        p = profile(base)
        vals = {f: first(p.get(f)) for f in FIELDS}
        vals["filament_type"] = (p.get("filament_type") or [""])[0] if isinstance(p.get("filament_type"), list) else p.get("filament_type")
        if vals["nozzle_temperature"] is None:
            continue  # profil bos (degerler alt profillerde), atla
        profiles[f"{brand}|{product}"] = {"brand": brand, "product": product, **vals,
                                          "source": "Bambu Studio profili"}
        print("profil", brand, "|", product)

    codes = get_json(RAW + "filaments_color_codes.json")["data"]
    colors = []
    for c in codes:
        hexes = [h[:7] for h in c.get("fila_color", []) if re.match(r"^#[0-9A-Fa-f]{6}", h)]
        if not hexes:
            continue
        product = c["fila_type"]
        colors.append({
            "brand": "Bambu Lab", "product": product,
            "material": (profiles.get(f"Bambu Lab|{product}") or {}).get("filament_type") or product.split(" ")[0],
            "code": c.get("fila_color_code", ""), "ams": c.get("color_code", ""),
            "name": (c.get("fila_color_name") or {}).get("en", ""),
            "name_tr": (c.get("fila_color_name") or {}).get("tr", ""),
            "hex": hexes[0], "hexes": hexes if len(hexes) > 1 else None,
        })
    for fn in (porima, elas):
        try:
            p2, c2 = fn()
            profiles.update(p2)
            colors.extend(c2)
        except Exception as e:  # bir marka sitesi cokerse digerleri yine uretilsin
            print(fn.__name__, "ATLANDI:", e)
    data = {"source": "Bambu Studio profilleri (github.com/bambulab/BambuStudio), porima3d.com, elas3d.com",
            "profiles": profiles, "colors": colors}
    OUT.write_text("// Otomatik uretildi: dev/build_catalog.py. Elle duzenleme.\nwindow.FIL_CATALOG = "
                   + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"{len(profiles)} profil, {len(colors)} renk -> {OUT}")


if __name__ == "__main__":
    main()
