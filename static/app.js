const API = 'api.php';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const fmtTL = (n, d = 2) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: d }).format(n || 0);
const fmtG = n => `${Math.round(n || 0).toLocaleString('tr-TR')} g`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const CAT = { failed: 'Başarısız baskı', purge: 'Purge', support: 'Destek', other: 'Diğer', sapma: 'Tartı sapması' };
const KIND = { print: 'Baskı', waste: 'Atık', weigh: 'Tartı' };
const SPOOL_STATUS_TR = { acik: 'Açık', kapali: 'Kapalı · paketinde', bitti: 'BİTTİ' };

// ---------- FILAMENT KATALOGU (static/catalog.js, dev/build_catalog.py uretir) ----------
const CATALOG = window.FIL_CATALOG || { profiles: {}, colors: [] };
const norm = s => String(s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
// "Bambu", "bambulab", "ELAS" gibi yazimlari katalogdaki marka adina esle.
function brandKey(b) {
  const n = norm(b).replace(/\s/g, '');
  if (n.includes('bambu')) return 'bambulab';
  if (n.includes('elas')) return 'elas3d';
  if (n.includes('porima')) return 'porima';
  if (n.includes('esun')) return 'esun';
  if (n.includes('poly')) return 'polymaker';
  return n;
}

function catalogColors(brand, product) {
  const bk = brandKey(brand);
  return CATALOG.colors.filter(c => (!bk || brandKey(c.brand) === bk) && (!product || norm(c.product) === norm(product)));
}

// Kod (etiket / RAL / AMS) tam eslesme > ad tam eslesme > ad icinde gecen.
function findColor(brand, product, q) {
  const k = norm(q);
  if (!k) return null;
  const pools = [catalogColors(brand, product), catalogColors(brand, '')];
  for (const list of pools) {
    const hit = list.find(c => norm(c.code) === k) || list.find(c => norm(c.name) === k)
      || list.find(c => norm(c.name_tr) === k) || (k.length >= 3 && list.find(c => norm(c.name).includes(k)));
    if (hit) return hit;
  }
  return null;
}

function findProfile(brand, product, material) {
  const bk = brandKey(brand);
  const all = Object.values(CATALOG.profiles);
  const same = all.filter(p => brandKey(p.brand) === bk);
  const m = norm(material);
  return same.find(p => norm(p.product) === norm(product))
    || (product && same.find(p => norm(p.product).includes(norm(product))))
    || same.find(p => norm(p.product) === m)
    || same.find(p => norm(p.filament_type) === m)
    || all.find(p => p.brand === 'Genel' && norm(p.product) === m)
    || null;
}

function settingsHtml(s, compact = false) {
  const p = findProfile(s.brand, s.product, s.material);
  if (!p) return compact ? '' : '<div class="settings muted">Baskı ayarı katalogda yok.</div>';
  const chip = (ico, label, val) => val ? `<span class="set-chip"><i>${ico}</i>${label} <b>${esc(val)}</b></span>` : '';
  const nl = p.nozzle_temperature_range_low, nh = p.nozzle_temperature_range_high;
  const nozzle = p.nozzle_temperature ? `${p.nozzle_temperature}°C${nl && nh && nl !== nh ? ` (${nl}–${nh})` : ''}` : (nl ? `${nl}–${nh}°C` : '');
  const bed = p.bed_low != null ? `${p.bed_low}–${p.bed_high}°C`
    : p.textured_plate_temp ? `${p.textured_plate_temp}°C${p.cool_plate_temp ? ` · soğuk plaka ${p.cool_plate_temp}°C` : ''}` : '';
  const fmin = p.fan_min_speed ?? 0;
  const fan = p.fan || (p.fan_max_speed != null ? (fmin === p.fan_max_speed ? `%${fmin}` : `%${fmin}–${p.fan_max_speed}`) : '');
  const chips = [
    chip('🔥', 'Nozul', nozzle), chip('▭', 'Yatak', bed), chip('❄', 'Fan', fan),
    chip('⇢', 'Maks akış', p.filament_max_volumetric_speed ? `${p.filament_max_volumetric_speed} mm³/s` : ''),
    compact ? '' : chip('☀', 'Kurutma', p.dry), compact ? '' : chip('⇡', 'Dayanım', p.heat_resistance),
  ].join('');
  const generic = p.brand === 'Genel' || brandKey(p.brand) !== brandKey(s.brand);
  const src = String(p.source || '').startsWith('http')
    ? `<a href="${esc(p.source)}" target="_blank" rel="noopener">kaynak ↗</a>` : esc(p.source || '');
  return `<div class="settings">
      <div class="settings-title">Baskı ayarı · ${esc(p.brand)} ${esc(p.product)}${generic ? ' <span class="badge low">genel değer</span>' : ''}
        ${compact ? '' : `<span class="muted">${src}</span>`}</div>
      <div class="settings-chips">${chips}</div></div>`;
}

// Form: marka / urun / renk kodu yazildikca katalogdan renk, malzeme ve ayari doldur.
function attachCatalog(form) {
  const hint = form.querySelector('.cat-hint');
  const fillLists = () => {
    const brand = form.brand?.value;
    const prods = [...new Set([...catalogColors(brand, '').map(c => c.product),
      ...Object.values(CATALOG.profiles).filter(p => brandKey(p.brand) === brandKey(brand)).map(p => p.product)])];
    $('#dl-products').innerHTML = prods.map(p => `<option value="${esc(p)}"></option>`).join('');
    $('#dl-codes').innerHTML = catalogColors(brand, form.product?.value).slice(0, 400)
      .map(c => `<option value="${esc(c.code || c.name)}">${esc(c.name)} · ${esc(c.product)}</option>`).join('');
  };
  // fill=false: form ilk acildiginda elle secilmis rengi ezme, sadece ipucunu goster.
  const apply = (fill = true) => {
    const c = findColor(form.brand?.value, form.product?.value, form.color_code?.value);
    if (c && fill) {
      if (form.product && !form.product.value) form.product.value = c.product;
      if (form.color) form.color.value = c.name;
      if (c.hex && form.color_hex) {
        form.color_hex.value = c.hex.toLowerCase();
        form.color_hex.dispatchEvent(new Event('input')); // renk kutucugu guncellensin
      }
      const mat = [...(form.material?.options || [])].find(o => norm(o.value) === norm(c.material));
      if (mat) form.material.value = mat.value;
    }
    if (hint) {
      const prof = settingsHtml({ brand: form.brand?.value, product: form.product?.value, material: form.material?.value }, true);
      hint.innerHTML = (c
        ? `<span class="cat-ok"><span class="dot" style="background:${esc(c.hex || '#888')}"></span>✓ ${esc(c.brand)} ${esc(c.product)} · ${esc(c.name)}${c.code ? ` · ${esc(c.code)}` : ''}${c.approx ? ' <span class="badge">renk yaklaşık, elle düzeltebilirsin</span>' : ''}</span>`
        : (form.color_code?.value ? '<span>Katalogda bulunamadı. Renk adını yaz ve rengi elle seç.</span>' : ''))
        + prof;
    }
  };
  ['brand', 'product'].forEach(n => form[n]?.addEventListener('input', () => { fillLists(); apply(); }));
  form.color_code?.addEventListener('input', apply);
  form.color_code?.addEventListener('change', apply);
  form.material?.addEventListener('change', apply);
  fillLists();
  apply(false);
}

const S = { spools: [], cards: [], summary: null, purchases: [], sales: [], events: [], printers: [], jobs: [] };
const lowG = () => S.summary?.low_stock_g ?? 150;

function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (bad ? ' bad' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 3000);
}

async function api(action, { method = 'GET', id, body } = {}) {
  const url = `${API}?a=${action}${id !== undefined ? `&id=${id}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && action !== 'login') {
    showLogin();
    throw new Error('Giriş gerekli');
  }
  if (!res.ok) throw new Error(data.detail || 'Hata');
  return data;
}

// Panel koprusunde giris sayfasi panelinki; giristen sonra panel buraya geri yollar.
let loginUrl = null;

function showLogin() {
  if (loginUrl) { location.replace(loginUrl); return; }
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

function showApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
}

async function refresh() {
  const [spools, summary, purchases, sales, events, printers, jobs, cards] = await Promise.all([
    api('spools'), api('summary'), api('purchases'), api('sales'), api('events'),
    api('printers'), api('jobs'), api('cards'),
  ]);
  Object.assign(S, { spools, summary, purchases, sales, events, printers, jobs, cards });
  renderAll();
}

function renderAll() {
  renderSummary();
  renderSpools();
  renderPurchases();
  renderPurchaseCards();
  renderReorder();
  renderSpoolSelects();
  renderSpoolEvents();
  renderWaste();
  renderSales();
  renderPrinters();
  renderJobs();
}

// ---------- OZET (dashboard) ----------
const STATUS_ICON = { running: '▶', finished: '✔', failed: '✖', offline: '⚠', idle: '○' };

// goto: tiklaninca gidilecek sekme. Tum dashboard parcalari tiklanabilir.
function kpiTile(label, value, goto, icon, cls = '', note = '') {
  return `<div class="kpi clickable" data-goto="${goto}" title="${label} → aç">
    <span><i class="kpi-ico">${icon}</i>${label}</span><strong class="${cls}">${value}</strong>${note ? `<small>${note}</small>` : ''}
    <em class="go">›</em></div>`;
}

function panel(title, goto, body, linkText = 'Tümü') {
  return `<section class="card dash-panel" data-c="${goto}">
    <div class="panel-head"><h3>${title}</h3><button class="link" data-goto="${goto}">${linkText} ›</button></div>
    ${body}</section>`;
}

function renderSummary() {
  const s = S.summary;
  if (!s) return;
  const printers = S.printers.map(p => `<div class="clickable" data-goto="yazici">${printerCard(p, false)}</div>`).join('')
    || '<p class="muted">Yazıcı yok. <button class="link" data-goto="yazici">Yazıcı ekle ›</button></p>';
  const running = S.printers.filter(p => p.online && p.status?.state === 'RUNNING').length;
  const online = S.printers.filter(p => p.online).length;

  $('#tab-ozet').innerHTML = `
    <section class="hero">
      <div>
        <h2>Atölye özeti</h2>
        <p class="muted"><span class="live-dot"></span>Canlı · ${online}/${S.printers.length} yazıcı bağlı · ${running} baskı sürüyor · ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p>
      </div>
      <div class="quick">
        <button data-goto="alim">+ Alım</button>
        <button data-goto="baski" class="ghost">Baskı düş</button>
        <button data-goto="satis" class="ghost">+ Satış</button>
        <button data-act="addCard" class="ghost">+ Stok kartı</button>
      </div>
    </section>

    ${lowAlert()}

    <div class="kpis">
      ${kpiTile('Kar / zarar', fmtTL(s.profit), 'satis', '₺', s.profit >= 0 ? 'good' : 'bad', 'gelir − tüketilen malzeme')}
      ${kpiTile('Gelir', fmtTL(s.revenue), 'satis', '↗', '', `${s.sales_count} satış + yazıcı işleri`)}
      ${kpiTile('Elde kalan değer', fmtTL(s.stock_value), 'makara', '◉', '', fmtG(s.remaining_g))}
      ${kpiTile('Filamentler', `${s.open_spools + s.closed_spools} adet`, 'makara', '◎', '', `${s.open_spools} açık · ${s.closed_spools} kapalı${s.low_stock.length ? ` · <span class="bad">${s.low_stock.length} azaldı</span>` : ''}`)}
      ${kpiTile('Tüketilen malzeme', fmtTL(s.consumed_cost), 'baski', '▼', '', fmtG(s.consumed_g))}
      ${kpiTile('Toplam alım', fmtTL(s.purchases_total), 'alim', '🛒')}
      ${kpiTile('Atık', fmtG(s.waste_g), 'atik', '♻', s.waste_pct > 10 ? 'bad' : '', `%${s.waste_pct.toFixed(1)} · ${fmtTL(s.waste_cost)}`)}
      ${kpiTile('Yazıcılar', `${online} / ${S.printers.length}`, 'yazici', '🖨', '', `${running} baskıda`)}
    </div>

    <h2 class="section-title">Yazıcılar · canlı</h2>
    <div class="grid">${printers}</div>

    <div class="two">
      ${panel('Açık filamentler', 'makara', `<p class="muted">Satıra tıkla: o filamente baskı düş. Sarı çizgi = ${lowG()} g.</p>${stockBars()}`)}
      ${panel(`Kapalı filamentler · ${s.closed_spools} adet`, 'makara', closedSpools())}
    </div>

    <div class="two">
      ${panel('Atık dağılımı', 'atik', wasteBars(s))}
    </div>

    <div class="three">
      ${panel('Son işler', 'yazici', recentJobs())}
      ${panel('Son hareketler', 'baski', recentEvents())}
      ${panel('Son satışlar', 'satis', recentSales())}
    </div>`;
}

// Paketindeki filamentler: marka + malzeme + renk bazinda adet, toplam gram ve deger.
function closedSpools() {
  const groups = {};
  for (const s of S.spools.filter(x => x.status === 'kapali')) {
    const k = `${s.brand}|${s.material}|${s.color}|${s.color_hex}`;
    const g = groups[k] ||= { s, count: 0, grams: 0, value: 0 };
    g.count++;
    g.grams += s.remaining_g;
    g.value += s.stock_value;
  }
  const list = Object.values(groups).sort((a, b) => b.count - a.count);
  if (!list.length) return '<p class="muted">Kapalı filament yok. Paketinde duran filamentler burada görünür.</p>';
  return `<div class="closed-grid">${list.map(g => `
    <div class="closed clickable" data-goto="makara" data-search="${esc(g.s.color)}" title="${esc(g.s.brand)} ${esc(g.s.material)} ${esc(g.s.color)}">
      ${spoolSvg({ ...g.s, pct: 100 })}
      <b class="closed-count">×${g.count}</b>
      <div class="closed-name">${esc(g.s.brand)}<br><span class="muted">${esc(g.s.material)} · ${esc(g.s.color)}</span></div>
      <div class="muted">${fmtG(g.grams)} · ${fmtTL(g.value)}</div>
    </div>`).join('')}</div>`;
}

function recentEvents() {
  const items = S.events.slice(0, 6).map(e => `<li class="clickable" data-goto="baski" data-spool="${e.spool_id}">
      <span class="dot" style="background:${esc(e.color_hex)}"></span><b>${KIND[e.kind] || e.kind}</b> ${fmtG(Math.abs(e.grams))}
      <span class="muted">${esc(e.brand)} · ${esc(e.color)} · ${esc(e.date)}</span></li>`).join('');
  return items ? `<ul class="jobs">${items}</ul>` : '<p class="muted">Hareket yok.</p>';
}

function recentSales() {
  const items = S.sales.slice(0, 6).map(x => `<li class="clickable" data-goto="satis">
      <b>${fmtTL(x.price)}</b> ${esc(x.description)}
      <span class="muted">${esc(x.date)} · kar <span class="${x.gross_profit >= 0 ? 'good' : 'bad'}">${fmtTL(x.gross_profit)}</span></span></li>`).join('');
  return items ? `<ul class="jobs">${items}</ul>` : '<p class="muted">Satış yok.</p>';
}

function stockBars() {
  const open = S.spools.filter(s => s.status === 'acik').sort((a, b) => b.remaining_g - a.remaining_g);
  if (!open.length) return '<p class="muted">Açık filament yok.</p>';
  return `<div class="hbars">${open.map(s => {
    const low = s.remaining_g <= lowG();
    const marker = (lowG() / s.net_g * 100).toFixed(1);
    return `<div class="hbar clickable" data-goto="baski" data-spool="${s.id}" title="${esc(s.brand)} · ${esc(s.color)} · ${esc(s.material)}: ${fmtG(s.remaining_g)} / ${fmtG(s.net_g)}">
      <span class="hbar-label">${esc(s.brand)} · ${esc(s.color)}</span>
      <span class="hbar-track"><i style="width:${s.pct.toFixed(1)}%;background:${esc(s.color_hex)}"></i><b class="hbar-low" style="left:${marker}%"></b></span>
      <span class="hbar-val${low ? ' bad' : ''}">${fmtG(s.remaining_g)}${low ? ' ⚠' : ''}</span>
    </div>`;
  }).join('')}</div>`;
}

function wasteBars(s) {
  const entries = Object.entries(s.waste_by_category).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '<p class="muted">Atık kaydı yok.</p>';
  const max = Math.max(...entries.map(e => e[1]), 1);
  return `<div class="hbars">${entries.map(([k, g]) => `
    <div class="hbar clickable" data-goto="atik" title="${CAT[k] || k}: ${fmtG(g)}">
      <span class="hbar-label">${CAT[k] || k}</span>
      <span class="hbar-track"><i style="width:${(g / max * 100).toFixed(1)}%;background:var(--accent)"></i></span>
      <span class="hbar-val">${fmtG(g)}</span>
    </div>`).join('')}</div>
    <p class="muted">Toplam atık %${s.waste_pct.toFixed(1)} · ${fmtTL(s.waste_cost)}</p>`;
}

function recentJobs() {
  const items = S.jobs.slice(0, 6).map(j => `<li class="clickable" data-goto="yazici">
      <span class="job-state ${esc(j.status)}">${STATUS_ICON[j.status] || '•'} ${esc(JOB_TR[j.status] || j.status)}</span>
      <b>${esc(j.printer_name)}</b> · ${esc(j.name || j.job_key)}
      <span class="muted">${esc((j.started_at || '').slice(0, 16))}</span>
    </li>`).join('');
  return items ? `<ul class="jobs">${items}</ul>` : '<p class="muted">Henüz iş yok.</p>';
}

// Dashboard canlı: 10 sn'de bir yazıcı, stok ve özet. Iş tablosu yenilenmez (girilen değerler silinmesin diye).
async function refreshLive() {
  if ($('#app').classList.contains('hidden')) return;
  try {
    const [printers, summary, spools, cards] = await Promise.all([api('printers'), api('summary'), api('spools'), api('cards')]);
    Object.assign(S, { printers, summary, spools, cards });
    renderSummary();
    renderSpools();
    renderSpoolInfo();
  } catch (e) {
    // oturum yoksa login ekranı zaten açılır
  }
}
setInterval(refreshLive, 10000);

// ---------- FILAMENT: STOK KARTLARI ----------
// Kart filamentin tanimidir. Stok (rulolar) sadece Alim ile eklenir; karttaki rulolar oradan gelir.
const cardName = c => `${c.brand} · ${c.product || c.material} · ${c.color}`;

function rollRow(s) {
  const low = s.status === 'acik' && s.remaining_g <= lowG();
  return `<li>
      <span><b>${fmtG(s.remaining_g)}</b> <span class="muted">/ ${fmtG(s.net_g)} · ${SPOOL_STATUS_TR[s.status] || s.status}${s.in_slot ? ' · AMS' : ''}</span>${low ? ' <span class="badge low">AZALDI</span>' : ''}</span>
      <span class="roll-act">
        <button class="btn-sm" data-act="pick" data-id="${s.id}">Baskı</button>
        <button class="ghost btn-sm" data-act="weigh" data-id="${s.id}">Tartı</button>
        ${s.purchase_id ? '' : `<button class="danger btn-sm" data-act="delSpool" data-id="${s.id}" title="Alıma bağlı olmayan eski rulo">Sil</button>`}
      </span></li>`;
}

// Ayrinti: tiklaninca acilir (rulolar, deger, ayarlar, dugmeler).
function cardDetail(c) {
  const canDelete = !c.roll_count && !c.finished_count && !c.purchase_count;
  return `<div class="card-detail">
      <p class="muted">${esc(c.material)}${c.color_code ? ` · kod <b>${esc(c.color_code)}</b>` : ''} · rulo ${fmtG(c.net_g)}
        ${c.open_count ? ` · ${c.open_count} açık` : ''}${c.closed_count ? ` · ${c.closed_count} kapalı` : ''}</p>
      <p class="muted">Değer ${fmtTL(c.stock_value)}${c.last_cost ? ` · son alım ${fmtTL(c.last_cost)}/rulo` : ''} · ${c.purchase_count} alım</p>
      ${c.rolls.length ? `<ul class="rolls">${c.rolls.map(rollRow).join('')}</ul>` : ''}
      <div class="row"><button data-act="buyCard" data-id="${c.id}">+ Alım (stok ekle)</button></div>
      ${settingsHtml(c)}
      <div class="row">
        <button class="ghost" data-act="editCard" data-id="${c.id}">Düzenle</button>
        ${canDelete ? `<button class="danger" data-act="delCard" data-id="${c.id}">Sil</button>` : ''}
      </div>
    </div>`;
}

// Kisa ozet: ad, rulo adedi, kalan gram. Rulolarin rengi daire olarak gorunur.
const cardLow = c => c.roll_count > 0 && c.remaining_g <= lowG();
const swatch = (c, size = 22) => `<span class="swatch-dot" style="width:${size}px;height:${size}px;background:${esc(c.color_hex)}"></span>`;

function cardTile(c) {
  const open = OPEN_CARDS.has(c.id);
  const pct = c.capacity_g > 0 ? c.remaining_g / c.capacity_g * 100 : 0;
  return `
    <article class="fcard${cardLow(c) ? ' low' : ''}${c.roll_count ? '' : ' empty'}${open ? ' open' : ''}">
      <div class="fcard-head" data-toggle-card="${c.id}" role="button" tabindex="0" aria-expanded="${open}">
        ${spoolSvg({ ...c, pct })}
        <div class="fcard-text">
          <strong class="fcard-name">${esc(c.brand)} · ${esc(c.product || c.material)}</strong>
          <span class="fcard-color">${esc(c.color)}</span>
          <span class="fcard-stock"><b>${c.roll_count}</b> rulo · <b>${fmtG(c.remaining_g)}</b>${cardLow(c) ? ' <span class="badge low">AZALDI</span>' : ''}</span>
        </div>
        <span class="chev">${open ? '▴' : '▾'}</span>
      </div>
      ${open ? cardDetail(c) : ''}
    </article>`;
}

function cardRow(c) {
  const open = OPEN_CARDS.has(c.id);
  return `<tr class="frow${cardLow(c) ? ' low' : ''}${c.roll_count ? '' : ' empty'}" data-toggle-card="${c.id}" tabindex="0" aria-expanded="${open}">
      <td class="sw">${swatch(c)}</td>
      <td><strong>${esc(c.brand)} · ${esc(c.product || c.material)}</strong><br><span class="muted">${esc(c.color)}</span></td>
      <td class="num"><b>${c.roll_count}</b> rulo</td>
      <td class="num"><b>${fmtG(c.remaining_g)}</b>${cardLow(c) ? ' <span class="badge low">AZALDI</span>' : ''}</td>
      <td class="chev">${open ? '▴' : '▾'}</td>
    </tr>${open ? `<tr class="frow-detail"><td colspan="5">${cardDetail(c)}</td></tr>` : ''}`;
}

// Ustten gorunen filament: dis flans, renkli filament halkasi (doluluk kadar), gobek.
function spoolSvg(s) {
  const outer = 56, hub = 20;
  const fillR = hub + (outer - 4 - hub) * Math.max(0, Math.min(100, s.pct)) / 100;
  const rings = [];
  for (let r = hub + 5; r < fillR; r += 5) {
    rings.push(`<circle cx="60" cy="60" r="${r.toFixed(1)}" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="1"/>`);
  }
  return `<svg class="spool-svg" viewBox="0 0 120 120" role="img" aria-label="${esc(s.color)} makara, yüzde ${Math.round(s.pct)} dolu">
    <circle cx="60" cy="60" r="${outer}" fill="#1a1f2b" stroke="#3a4255" stroke-width="2"/>
    ${s.pct > 0 ? `<circle cx="60" cy="60" r="${fillR.toFixed(1)}" fill="${esc(s.color_hex)}" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>${rings.join('')}` : ''}
    <circle cx="60" cy="60" r="${hub}" fill="#2a3142" stroke="#4a5368" stroke-width="2"/>
    <circle cx="60" cy="60" r="7" fill="#0d1017"/>
  </svg>`;
}

const OPEN_CARDS = new Set();
let cardView = 'grid';
try { cardView = localStorage.getItem('fil_card_view') === 'list' ? 'list' : 'grid'; } catch { /* tarayici izin vermezse kart */ }

function renderSpools() {
  $$('.view-toggle [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === cardView));
  const q = $('#search').value.trim().toLowerCase();
  const list = S.cards.filter(c => !q || [c.brand, c.material, c.product, c.color, c.color_code]
    .some(v => String(v ?? '').toLowerCase().includes(q)));
  $('#spoolGrid').className = cardView === 'list' ? 'flist' : 'fgrid';
  $('#spoolGrid').innerHTML = !list.length
    ? `<p class="muted">${S.cards.length ? 'Aramaya uyan stok kartı yok.' : 'Stok kartı yok. "+ Stok kartı ekle" ile tanımla, stoğu Alım ile ekle.'}</p>`
    : cardView === 'list'
      ? `<div class="table-wrap"><table class="ftable"><thead><tr><th></th><th>Filament</th><th class="num">Adet</th><th class="num">Kalan</th><th></th></tr></thead><tbody>${list.map(cardRow).join('')}</tbody></table></div>`
      : list.map(cardTile).join('');
}

// ---------- ALIM ----------
function purchasePreview() {
  const f = $('#purchaseForm');
  const isCard = f.payment_type.value === 'card';
  const qty = Math.max(1, +f.qty.value || 1);
  const net = purchaseCard()?.net_g || 0;
  const monthly = f.monthly_amount.value !== '' ? +f.monthly_amount.value : null;
  const inst = Math.max(1, +f.installments.value || 1);
  const total = isCard && monthly !== null ? monthly * inst : (+f.unit_price.value || 0) * qty;
  const perRoll = total / qty;
  const perG = net > 0 ? total / (qty * net) : 0;
  $('#cardFields').classList.toggle('hidden', !isCard);
  $('#pPreview').innerHTML = `Toplam ödenen: <strong>${fmtTL(total)}</strong> · rulo başı <strong>${fmtTL(perRoll)}</strong> · g başı <strong>${fmtTL(perG, 3)}</strong>`
    + (isCard ? ` · ${inst} taksit` : ' · nakit');
}

function renderPurchases() {
  const rows = S.purchases.map(p => {
    const perG = p.total_paid / (p.qty * p.net_g);
    const pay = p.payment_type === 'card'
      ? `${esc(p.card_name || 'Kart')} · ${p.installments} taksit${p.monthly_amount ? ` · aylık ${fmtTL(p.monthly_amount)}` : ''}`
      : 'Nakit';
    return `<tr>
      <td>${esc(p.date)}</td>
      <td><span class="dot" style="background:${esc(p.color_hex)}"></span>${esc(p.brand)} ${esc(p.material)}<br><span class="muted">${esc(p.color)} · ${p.qty} × ${fmtG(p.net_g)}</span></td>
      <td>${pay}</td>
      <td>${fmtTL(p.total_paid)}<br><span class="muted">${fmtTL(perG, 3)}/g</span></td>
      <td class="actions"><button class="ghost btn-sm" data-act="editPurchase" data-id="${p.id}">Düzenle</button><button class="danger btn-sm" data-act="delPurchase" data-id="${p.id}">Sil</button></td>
    </tr>`;
  }).join('');
  $('#purchaseList').innerHTML = S.purchases.length
    ? `<div class="table-wrap"><table><thead><tr><th>Tarih</th><th>Filament</th><th>Ödeme</th><th>Toplam</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="muted">Henüz alım yok.</p>';
}

// Alim formu: stok karti secilir, tanim ve rulo grami karttan gelir. Alim karta `adet` kadar rulo ekler.
let pendingCard = null; // yeni eklenen kart alim formunda secili gelsin

const purchaseCard = () => S.cards.find(c => String(c.id) === $('#pCard').value);

function renderPurchaseCards() {
  const sel = $('#pCard');
  const current = pendingCard ?? sel.value;
  pendingCard = null;
  sel.innerHTML = `<option value="">${S.cards.length ? '— stok kartı seç —' : 'Önce stok kartı ekle'}</option>`
    + S.cards.map(c => `<option value="${c.id}">${esc(cardName(c))}${c.color_code ? ` (${esc(c.color_code)})` : ''} · ${fmtG(c.net_g)} — stokta ${c.roll_count}</option>`).join('');
  sel.value = S.cards.some(c => String(c.id) === String(current)) ? String(current) : '';
  showPurchaseCard();
}

function showPurchaseCard() {
  const c = purchaseCard();
  $('#purchaseForm').unit_price.placeholder = c?.last_cost ? `son alım: ${fmtTL(c.last_cost)}` : '';
  $('#pCardInfo').innerHTML = c
    ? `<span class="cat-ok"><span class="dot" style="background:${esc(c.color_hex)}"></span>${esc(cardName(c))}${c.color_code ? ` · ${esc(c.color_code)}` : ''} · rulo ${fmtG(c.net_g)} · şu an stokta ${c.roll_count} rulo</span>`
      + settingsHtml(c, true)
    : '';
  purchasePreview();
}

// Yeniden siparis: stokta olmayan ya da esik altina dusen kartlar, son alim fiyatiyla.
const needsReorder = c => c.roll_count === 0 || c.remaining_g <= lowG();

function reorderText(list) {
  return 'Filament siparis listesi\n' + list.map(c =>
    `- ${cardName(c)}${c.color_code ? ` (${c.color_code})` : ''} · ${fmtG(c.net_g)}${c.last_cost ? ` · son ${fmtTL(c.last_cost)}` : ''}`).join('\n');
}

function renderReorder() {
  const list = S.cards.filter(needsReorder)
    .sort((a, b) => a.remaining_g - b.remaining_g || cardName(a).localeCompare(cardName(b), 'tr'));
  const box = $('#reorder');
  if (!list.length) {
    box.innerHTML = `<h3>Yeniden sipariş</h3><p class="muted">Eksik yok. Her filamentte ${lowG()} g'dan fazla stok var.</p>`;
    return;
  }
  const total = list.reduce((t, c) => t + (c.last_cost || 0), 0);
  box.innerHTML = `<div class="panel-head"><h3>Yeniden sipariş · ${list.length} filament</h3>
      <button type="button" class="ghost btn-sm" id="reorderCopy">Listeyi kopyala</button></div>
    <p class="muted">Stokta olmayan ya da ${lowG()} g ve altına düşenler.${total ? ` Birer rulo, son fiyatlarla yaklaşık <b>${fmtTL(total)}</b>.` : ''}</p>
    <ul class="reorder-list">${list.map(c => `<li>
      ${swatch(c, 18)}
      <span class="ro-name"><b>${esc(cardName(c))}</b>${c.color_code ? ` <span class="muted">${esc(c.color_code)}</span>` : ''}</span>
      <span class="ro-stock">${c.roll_count ? `${fmtG(c.remaining_g)} kaldı` : '<span class="badge bad">stokta yok</span>'}</span>
      <span class="muted ro-price">${c.last_cost ? `son ${fmtTL(c.last_cost)}` : ''}</span>
      <button type="button" class="btn-sm" data-act="buyCard" data-id="${c.id}">+ Alım</button>
    </li>`).join('')}</ul>`;
  $('#reorderCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(reorderText(list));
      toast('Liste kopyalandı');
    } catch {
      toast('Kopyalanamadı', true);
    }
  };
}

// ---------- BASKI / TARTI ----------
function renderSpoolSelects() {
  const opts = S.spools.map(s =>
    `<option value="${s.id}">${esc(s.brand)} · ${esc(s.color)} · ${esc(s.material)} (${fmtG(s.remaining_g)})</option>`).join('');
  const current = $('#spoolSel').value;
  $('#spoolSel').innerHTML = opts || '<option value="">Filament yok</option>';
  if (current && S.spools.some(s => String(s.id) === current)) $('#spoolSel').value = current;
  refreshSaleRows();
  renderSpoolInfo();
}

function selectedSpool() {
  return S.spools.find(s => String(s.id) === $('#spoolSel').value);
}

function renderSpoolInfo() {
  const s = selectedSpool();
  if (!s) {
    $('#spoolInfo').innerHTML = '<p class="muted">Filament seç.</p>';
    return;
  }
  $('#spoolInfo').innerHTML = `
    <div style="display:flex;gap:12px;align-items:center">
      <span class="dot" style="width:28px;height:28px;background:${esc(s.color_hex)}"></span>
      <div><strong>${esc(s.brand)} · ${esc(s.color)} · ${esc(s.material)}</strong>
      <div class="muted">Kalan ${fmtG(s.remaining_g)} / ${fmtG(s.net_g)} · ${fmtTL(s.cost_per_g, 3)}/g · değer ${fmtTL(s.stock_value)}</div></div>
    </div>`;
}

function renderSpoolEvents() {
  const id = Number($('#spoolSel').value);
  const rows = S.events.filter(e => e.spool_id === id).slice(0, 50).map(e => `<tr>
      <td>${esc(e.date)}</td>
      <td>${KIND[e.kind] || e.kind}${e.category ? ` · ${CAT[e.category] || e.category}` : ''}</td>
      <td>${fmtG(e.grams)}</td>
      <td>${esc(e.note || '')}</td>
      <td class="actions">${eventEditBtn(e)}<button class="danger btn-sm" data-act="delEvent" data-id="${e.id}">Sil</button></td>
    </tr>`).join('');
  $('#spoolEvents').innerHTML = rows
    ? `<div class="table-wrap"><table><thead><tr><th>Tarih</th><th>Tür</th><th>Gram</th><th>Not</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="muted">Bu filamentte hareket yok.</p>';
}

// ---------- ATIK ----------
function renderWaste() {
  const s = S.summary;
  const rows = S.events.filter(e => e.kind === 'waste' || e.kind === 'weigh').map(e => `<tr>
      <td>${esc(e.date)}</td>
      <td><span class="dot" style="background:${esc(e.color_hex)}"></span>${esc(e.brand)} · ${esc(e.color)}</td>
      <td>${KIND[e.kind]}${e.category ? ` · ${CAT[e.category]}` : ''}</td>
      <td>${fmtG(-e.grams)}</td>
      <td>${fmtTL(e.cost)}</td>
      <td>${esc(e.note || '')}</td>
      <td class="actions">${eventEditBtn(e)}<button class="danger btn-sm" data-act="delEvent" data-id="${e.id}">Sil</button></td>
    </tr>`).join('');
  $('#tab-atik').innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Toplam atık</span><strong>${fmtG(s.waste_g)}</strong><small>%${s.waste_pct.toFixed(1)} tüketimin</small></div>
      <div class="kpi"><span>Atık maliyeti</span><strong class="${s.waste_cost > 0 ? 'bad' : ''}">${fmtTL(s.waste_cost)}</strong></div>
    </div>
    <p class="muted">Tartı satırları pozitif gram = sapma. Eksi değer, beklenenden fazla kalan malzeme demek.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Tarih</th><th>Filament</th><th>Tür</th><th>Gram</th><th>Maliyet</th><th>Not</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="muted">Atık kaydı yok</td></tr>'}</tbody>
      </table>
    </div>`;
}

// ---------- SATIS ----------
function renderSales() {
  const itemLine = it => it.brand
    ? `<span class="dot" style="background:${esc(it.color_hex)}"></span>${esc(it.brand)} · ${esc(it.product || it.material)} · ${esc(it.color)} — <b>${fmtG(it.grams)}</b>`
    : `<span class="muted">silinmiş rulo — ${fmtG(it.grams)}</span>`;
  const rows = S.sales.map(x => {
    const items = x.items.length ? x.items.map(itemLine).join('<br>')
      : x.brand ? `<span class="dot" style="background:${esc(x.color_hex)}"></span>${esc(x.brand)} · ${esc(x.color)} — ${fmtG(x.grams)} <span class="muted">(eski kayıt, stoktan düşmedi)</span>` : '<span class="muted">—</span>';
    return `<tr>
      <td>${esc(x.date)}</td>
      <td><strong>${esc(x.description)}</strong>${fileStrip(x.files)}</td>
      <td>${items}</td>
      <td>${fmtTL(x.price)}</td>
      <td>${fmtTL(x.material_cost)}</td>
      <td class="${x.gross_profit >= 0 ? 'good' : 'bad'}">${fmtTL(x.gross_profit)}</td>
      <td class="actions"><button class="ghost btn-sm" data-act="editSale" data-id="${x.id}">Düzenle</button><button class="danger btn-sm" data-act="delSale" data-id="${x.id}">Sil</button></td>
    </tr>`;
  }).join('');
  $('#saleList').innerHTML = S.sales.length
    ? `<div class="table-wrap"><table><thead><tr><th>Tarih</th><th>Parça</th><th>Filamentler</th><th>Fiyat</th><th>Malzeme</th><th>Brüt kâr</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="muted">Henüz satış yok.</p>';
}

// Satis formu: her satir bir rulo + gram. Rulolar stok kartina gore gruplu listelenir.
function rollOptions(selected) {
  const sel = String(selected ?? '');
  const groups = S.cards.map(c => {
    const rolls = S.spools.filter(s => s.card_id === c.id && (s.status !== 'bitti' || String(s.id) === sel));
    if (!rolls.length) return '';
    return `<optgroup label="${esc(cardName(c))}${c.color_code ? ` (${esc(c.color_code)})` : ''}">${rolls.map(s =>
      `<option value="${s.id}">${esc(c.brand)} · ${esc(c.product || c.material)} · ${esc(c.color)} — ${fmtG(s.remaining_g)} kalan · ${SPOOL_STATUS_TR[s.status] || s.status}${s.in_slot ? ' · AMS' : ''} (rulo #${s.id})</option>`).join('')}</optgroup>`;
  }).join('');
  return `<option value="">— filament seç —</option>${groups}`;
}

function addSaleRow(spoolId = '', grams = '') {
  const row = document.createElement('div');
  row.className = 'sale-item';
  row.innerHTML = `<select data-f="spool">${rollOptions(spoolId)}</select>
    <input data-f="grams" type="number" min="0.1" step="0.1" placeholder="gram" value="${esc(grams)}">
    <button type="button" class="ghost btn-sm" data-rm title="Satırı kaldır">✕</button>`;
  $('select', row).value = String(spoolId);
  $('#saleItems').append(row);
  salePreview();
}

function refreshSaleRows() {
  $$('#saleItems select').forEach(sel => { const v = sel.value; sel.innerHTML = rollOptions(v); sel.value = v; });
  salePreview();
}

function saleItems() {
  return $$('#saleItems .sale-item').map(r => ({ spool_id: +$('select', r).value || 0, grams: +$('input', r).value || 0 }))
    .filter(it => it.spool_id || it.grams);
}

function salePreview() {
  const items = saleItems();
  const cost = items.reduce((t, it) => t + it.grams * (S.spools.find(s => s.id === it.spool_id)?.cost_per_g || 0), 0);
  const grams = items.reduce((t, it) => t + it.grams, 0);
  const price = +$('#saleForm').price.value || 0;
  $('#salePreview').innerHTML = `Toplam <strong>${fmtG(grams)}</strong> filament · malzeme <strong>${fmtTL(cost)}</strong> · brüt kâr <strong class="${price - cost >= 0 ? 'good' : 'bad'}">${fmtTL(price - cost)}</strong>`;
}

// ---- satis dosyalari (resim, 3MF, STL) ----
const fileUrl = (f, download = false) => `${API}?a=sale_file&id=${f.id}${download ? '&download=1' : ''}`;
const fmtSize = b => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
let uploadLimit = 0;
let newSaleFiles = [];

function fileStrip(files) {
  if (!files?.length) return '';
  const imgs = files.filter(f => f.kind === 'image');
  const models = files.filter(f => f.kind !== 'image');
  return `<div class="file-strip">${imgs.map(f =>
    `<a href="${fileUrl(f)}" target="_blank" rel="noopener" title="${esc(f.name)}"><img src="${fileUrl(f)}" alt="${esc(f.name)}" loading="lazy"></a>`).join('')}
    ${models.map(f => `<a class="file-chip" href="${fileUrl(f, true)}" title="İndir · ${fmtSize(f.size)}">⬇ ${esc(f.name)}</a>`).join('')}</div>`;
}

function renderSaleFileChips(oldFiles = null) {
  if (oldFiles) {
    $('#saleFilesOld').innerHTML = oldFiles.map(f => `<span class="file-chip">
        ${f.kind === 'image' ? `<img src="${fileUrl(f)}" alt="">` : '📦'} <a href="${fileUrl(f, true)}">${esc(f.name)}</a>
        <button type="button" class="ghost btn-sm" data-del-file="${f.id}" title="Dosyayı sil">✕</button></span>`).join('');
  }
  $('#saleFilesNew').innerHTML = newSaleFiles.map((f, i) => `<span class="file-chip new">
      ${f.type.startsWith('image/') ? '🖼' : '📦'} ${esc(f.name)} <span class="muted">${fmtSize(f.size)}</span>
      <button type="button" class="ghost btn-sm" data-rm-new="${i}" title="Çıkar">✕</button></span>`).join('');
}

// Telefon fotograflari buyuk: 1600 px'e kucultup JPEG yapar (GIF ve kucukler oldugu gibi kalir).
async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

async function uploadSaleFiles(saleId) {
  for (const f of newSaleFiles) {
    if (uploadLimit && f.size > uploadLimit) throw new Error(`${f.name} çok büyük. En fazla ${fmtSize(uploadLimit)}.`);
    const fd = new FormData();
    fd.append('files[]', f, f.name);
    const res = await fetch(`${API}?a=sale_file_upload&id=${saleId}`, {
      method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `${f.name} yüklenemedi`);
  }
  newSaleFiles = [];
}

function resetSaleForm() {
  const f = $('#saleForm');
  f.reset();
  f.sale_id.value = '';
  f.date.value = today();
  $('#saleItems').innerHTML = '';
  addSaleRow();
  newSaleFiles = [];
  $('#saleFileInput').value = '';
  renderSaleFileChips([]);
  $('#saleTitle').textContent = 'Yeni satış';
  $('#saleSubmit').textContent = 'Kaydet';
  $('#saleCancel').classList.add('hidden');
}

function loadSale(x) {
  const f = $('#saleForm');
  f.sale_id.value = x.id;
  f.date.value = x.date;
  f.description.value = x.description;
  f.price.value = x.price;
  $('#saleItems').innerHTML = '';
  x.items.forEach(it => addSaleRow(it.spool_id ?? '', it.grams));
  if (!x.items.length) addSaleRow();
  newSaleFiles = [];
  renderSaleFileChips(x.files);
  $('#saleTitle').textContent = 'Satışı düzenle';
  $('#saleSubmit').textContent = 'Güncelle';
  $('#saleCancel').classList.remove('hidden');
  switchTab('satis');
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- DUSUK STOK UYARISI ----------
function lowAlert() {
  const list = S.summary?.low_stock || [];
  if (!list.length) {
    return `<div class="alert empty"><h3>Stok normal</h3><span class="muted">${lowG()} g ve altında filament yok.</span></div>`;
  }
  const items = list.map(s => `<li class="clickable" data-goto="baski" data-spool="${s.id}"><span class="dot" style="background:${esc(s.color_hex)}"></span>${esc(s.brand)} · ${esc(s.color)} · ${esc(s.material)}: <strong>${fmtG(s.remaining_g)}</strong></li>`).join('');
  return `<div class="alert"><h3>⚠ ${list.length} filament ${lowG()} g ve altında</h3><ul>${items}</ul></div>`;
}

// ---------- YAZICILAR ----------
const STATE_TR = { RUNNING: 'Basıyor', PREPARE: 'Hazırlanıyor', PAUSE: 'Duraklatıldı', FINISH: 'Bitti', FAILED: 'Hata', IDLE: 'Boşta' };
const JOB_TR = { running: 'Basıyor', finished: 'Bitti', failed: 'Hatalı' };

function printerCard(p, withDelete = true) {
  const st = p.status || {};
  const sum = p.summary || {};
  const state = !p.online ? 'Bağlantı yok' : (STATE_TR[st.state] || st.state || 'Bilinmiyor');
  const stateIcon = !p.online ? STATUS_ICON.offline : (st.state === 'RUNNING' ? STATUS_ICON.running : st.state === 'FINISH' ? STATUS_ICON.finished : st.state === 'FAILED' ? STATUS_ICON.failed : STATUS_ICON.idle);
  return `
    <article class="spool printer${p.online ? '' : ' offline'}">
      <div class="spool-body">
        <h4>${esc(p.name)} <span class="muted">${esc(p.model || '')}</span></h4>
        <p><span class="badge ${p.online ? '' : 'bad'}">${stateIcon} ${esc(state)}</span>${st.progress != null ? ` %${Math.round(st.progress)}` : ''}${st.state === 'RUNNING' && st.remaining_min ? ` · ${st.remaining_min} dk kaldı` : ''}</p>
        <div class="bar"><i style="width:${Math.min(100, st.progress || 0)}%;background:var(--accent)"></i></div>
        <p class="muted">Nozzle ${st.nozzle ?? '-'}°C · Yatak ${st.bed ?? '-'}°C</p>
        ${slotsHtml(p, withDelete)}
        <p>${sum.total || 0} iş · ${fmtG(sum.grams)} · maliyet ${fmtTL(sum.cost)}</p>
        <p>Gelir ${fmtTL(sum.revenue)} · <span class="${(sum.profit || 0) >= 0 ? 'good' : 'bad'}">kar ${fmtTL(sum.profit)}</span></p>
        <p class="muted">Son görüldü: ${esc(p.last_seen || '-')}</p>
        ${withDelete ? `<div class="row"><button class="ghost" data-act="editPrinter" data-id="${p.id}">Düzenle</button><button class="danger" data-act="delPrinter" data-id="${p.id}">Sil</button></div>` : ''}
      </div>
    </article>`;
}

// AMS: 4 slot + harici filament yeri. Atanmis filament varsa gram/renk/tur bizim kayittan,
// yoksa AMS'in bildirdigi yuzde x filament agirligi tahmini gosterilir.
const SLOT_KEYS = ['0-0', '0-1', '0-2', '0-3', 'EXT'];

function amsHex(t) {
  const raw = String(t?.color || '').slice(0, 6);
  return /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : null;
}

function slotsHtml(p, editable) {
  const st = p.status || {};
  const ams = Object.fromEntries((st.ams || []).map(t => [t.key, t]));
  const keys = [...new Set([...SLOT_KEYS, ...Object.keys(ams)])];
  const tiles = keys.map(key => {
    const t = ams[key];
    const spool = S.spools.find(s => s.id === Number(p.slots?.[key]));
    const hex = spool?.color_hex || amsHex(t) || '#3a4255';
    const type = spool?.material || t?.type || '';
    const amsGrams = t && t.remain >= 0 && Number(t.weight) > 0 ? t.remain * Number(t.weight) / 100 : null;
    const grams = spool ? fmtG(spool.remaining_g) : amsGrams !== null ? `~${fmtG(amsGrams)}` : (t?.type ? '? g' : 'boş');
    const name = spool ? `${spool.brand} · ${spool.color}` : (t?.brand || t?.type ? `${t.brand || ''} ${t.type || ''}`.trim() : 'Atanmadı');
    const mismatch = spool && t?.type && t.type.toUpperCase() !== spool.material.toUpperCase();
    const label = key === 'EXT' ? 'Harici' : `Slot ${Number(key.split('-')[1]) + 1}${key.startsWith('0-') ? '' : ` (AMS ${Number(key[0]) + 1})`}`;
    const active = st.tray_now === key && p.online;
    const pct = spool ? spool.pct : (t?.remain >= 0 ? t.remain : 0);
    const select = editable
      ? `<select class="slot-sel" data-printer="${p.id}" data-slot="${key}" title="Bu slota filament ata">
           <option value="">— filament ata —</option>
           ${S.spools.filter(s => s.status !== 'bitti').map(s => `<option value="${s.id}"${spool?.id === s.id ? ' selected' : ''}>${esc(s.brand)} · ${esc(s.color)} · ${esc(s.material)} (${fmtG(s.remaining_g)})</option>`).join('')}
         </select>`
      : '';
    return `<div class="slot${active ? ' active' : ''}${spool && spool.remaining_g <= lowG() ? ' low' : ''}">
        <div class="slot-top"><span class="slot-label">${label}${active ? ' · ▶' : ''}</span><span class="slot-type">${esc(type)}</span></div>
        <div class="slot-color" style="background:${esc(hex)}"><i style="height:${(100 - Math.max(0, Math.min(100, pct))).toFixed(0)}%"></i></div>
        <div class="slot-g">${grams}</div>
        <div class="slot-name" title="${esc(name)}">${esc(name)}</div>
        ${mismatch ? `<div class="slot-warn">⚠ AMS: ${esc(t.type)}</div>` : ''}
        ${select}
      </div>`;
  }).join('');
  return `<div class="slots">${tiles}</div>`;
}

document.addEventListener('change', e => {
  const sel = e.target.closest('.slot-sel');
  if (!sel) return;
  run(() => api('slot_assign', {
    method: 'POST', id: Number(sel.dataset.printer),
    body: { slot: sel.dataset.slot, spool_id: sel.value || null },
  }), 'Slot güncellendi');
});

function renderPrinters() {
  $('#printerGrid').innerHTML = S.printers.length
    ? S.printers.map(p => printerCard(p)).join('')
    : '<p class="muted">Yazıcı yok. "+ Yazıcı ekle" ile ekle.</p>';
}

function renderJobs() {
  const spoolOpts = sel => '<option value="">— filament yok —</option>' + S.spools.map(s =>
    `<option value="${s.id}"${s.id === sel ? ' selected' : ''}>${esc(s.brand)} · ${esc(s.color)} (${fmtG(s.remaining_g)})</option>`).join('');
  const rows = S.jobs.map(j => `<tr>
      <td>${esc((j.started_at || '').slice(0, 16))}</td>
      <td><b>${esc(j.printer_name)}</b><br><span class="muted">${esc(j.name || j.job_key)}</span></td>
      <td>${esc(JOB_TR[j.status] || j.status)}</td>
      <td><select data-f="spool">${spoolOpts(Number(j.spool_id))}</select></td>
      <td><input data-f="grams" type="number" step="0.1" min="0" value="${j.grams ?? ''}" style="width:90px"></td>
      <td><input data-f="price" type="number" step="0.01" min="0" value="${j.price || 0}" style="width:100px"></td>
      <td>${fmtTL(j.cost)}</td>
      <td><button data-act="assign" data-id="${j.id}">Kaydet</button> <button class="danger" data-act="delJob" data-id="${j.id}">Sil</button></td>
    </tr>`).join('');
  $('#jobList').innerHTML = S.jobs.length
    ? `<div class="table-wrap"><table><thead><tr><th>Başlangıç</th><th>Yazıcı / iş</th><th>Durum</th><th>Filament</th><th>Gram</th><th>Fiyat</th><th>Maliyet</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="muted">Henüz yazıcı işi yok. Yerel bağlayıcı çalışınca gelir.</p>';
}

// ---------- EKLE / DUZENLE PENCERESI ----------
const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'Diğer'].map(m => [m, m]);
const CAT_OPTS = [['failed', 'Başarısız baskı'], ['purge', 'Purge'], ['support', 'Destek'], ['other', 'Diğer']];
const PAY_OPTS = [['cash', 'Nakit'], ['card', 'Kart']];
const spoolOpts = () => [['', '— filament yok —'], ...S.spools.map(s => [s.id, `${s.brand} · ${s.color} · ${s.material}`])];

const CARD_FIELDS = [
  { name: 'brand', label: 'Marka', required: true, list: 'brands' },
  { name: 'material', label: 'Malzeme', type: 'select', options: MATERIALS },
  { name: 'product', label: 'Ürün serisi', list: 'dl-products' },
  { name: 'color_code', label: 'Renk kodu veya adı', list: 'dl-codes' },
  { type: 'hint' },
  { name: 'color', label: 'Renk adı', required: true },
  { name: 'color_hex', label: 'Renk (elle de seçebilirsin)', type: 'color', value: '#888888' },
  { name: 'net_g', label: 'Rulo (g) — yeni alımlarda kullanılır', type: 'number', min: 1, value: 1000, required: true },
  { name: 'notes', label: 'Not' },
];
const cardOpts = () => S.cards.map(c => [c.id, `${cardName(c)}${c.color_code ? ` (${c.color_code})` : ''} · ${fmtG(c.net_g)}`]);
const PRINTER_FIELDS = [
  { name: 'name', label: 'İsim', required: true },
  { name: 'model', label: 'Model' },
  { name: 'serial', label: 'Seri no', required: true },
  { name: 'ip', label: 'IP (bilgi amaçlı)' },
];
const purchaseFields = () => [
  { name: 'date', label: 'Tarih', type: 'date', required: true },
  { name: 'card_id', label: 'Stok kartı', type: 'select', options: cardOpts() },
  { name: 'net_g', label: 'Rulo (g) — bu alımın rulolarına yazılır', type: 'number', step: '1', min: 1, required: true },
  { name: 'unit_price', label: 'Birim fiyat (₺)', type: 'number', step: '0.01', min: 0 },
  { name: 'payment_type', label: 'Ödeme', type: 'select', options: PAY_OPTS },
  { name: 'card_name', label: 'Kart' },
  { name: 'installments', label: 'Taksit sayısı', type: 'number', min: 1 },
  { name: 'monthly_amount', label: 'Aylık taksit (₺)', type: 'number', step: '0.01', min: 0 },
  { name: 'notes', label: 'Not' },
];

function openModal(title, fields, values, onSave, note = '') {
  const f = $('#modalForm');
  const field = fl => {
    if (fl.type === 'hint') return '<div class="cat-hint muted"></div>';
    const v = values?.[fl.name] ?? fl.value ?? '';
    if (fl.type === 'select') {
      const opts = fl.options.map(([ov, ol]) =>
        `<option value="${esc(ov)}"${String(ov) === String(v) ? ' selected' : ''}>${esc(ol)}</option>`).join('');
      return `<label>${esc(fl.label)} <select name="${fl.name}">${opts}</select></label>`;
    }
    const attrs = [fl.step && `step="${fl.step}"`, fl.min !== undefined && `min="${fl.min}"`, fl.required && 'required',
      fl.list && `list="${fl.list}" autocomplete="off"`]
      .filter(Boolean).join(' ');
    if (fl.type === 'color') {
      return `<label>${esc(fl.label)} <span class="color-field"><button type="button" class="swatch" aria-label="Renk seç"></button><input name="${fl.name}" value="${esc(v)}" maxlength="7" autocomplete="off" spellcheck="false"></span></label>`;
    }
    return `<label>${esc(fl.label)} <input name="${fl.name}" type="${fl.type || 'text'}" value="${esc(v)}" ${attrs}></label>`;
  };
  f.innerHTML = `<h3>${esc(title)}</h3>${note ? `<p class="muted">${esc(note)}</p>` : ''}${fields.map(field).join('')}
    <p class="err" id="modalErr"></p>
    <div class="row"><button type="submit">Kaydet</button><button type="button" class="ghost" id="modalCancel">Vazgeç</button></div>`;
  $('#modalCancel').onclick = () => $('#modal').close();
  f.onsubmit = async e => {
    e.preventDefault();
    try {
      await onSave(formBody(f));
      $('#modal').close();
      await refresh();
      toast('Kaydedildi');
    } catch (err) {
      $('#modalErr').textContent = err.message;
    }
  };
  initColorFields(f);
  if (f.color_code) attachCatalog(f);
  // Nakitte kart / taksit alanlari gizli; sadece Kart secilince gorunur.
  if (f.payment_type) {
    const payToggle = () => ['card_name', 'installments', 'monthly_amount'].forEach(n =>
      f[n]?.closest('label')?.classList.toggle('hidden', f.payment_type.value !== 'card'));
    f.payment_type.addEventListener('change', payToggle);
    payToggle();
  }
  $('#modal').showModal();
}

function eventEditBtn(e) {
  return e.kind === 'weigh' ? '' : `<button class="ghost btn-sm" data-act="editEvent" data-id="${e.id}">Düzenle</button>`;
}

function editAction(act, id) {
  switch (act) {
    case 'addCard':
      return openModal('Stok kartı ekle', CARD_FIELDS, null, async b => {
        const r = await api('card', { method: 'POST', body: b });
        pendingCard = r.id;
      }, 'Kart sadece filamentin tanımıdır. Stok, Alım ile bu karta rulo olarak eklenir.');
    case 'editCard': {
      const c = S.cards.find(x => x.id === id);
      return openModal('Stok kartını düzenle', CARD_FIELDS, c, b => api('card_update', { method: 'POST', id, body: b }),
        'Değişiklik bu karta bağlı rulo ve alımlara da yazılır. Rulo gramı sadece yeni alımlarda kullanılır.');
    }
    case 'editPurchase': {
      const p = S.purchases.find(x => x.id === id);
      return openModal('Alımı düzenle', purchaseFields(), p, b => api('purchase_update', { method: 'POST', id, body: b }),
        `Adet (${p.qty}) değişmez; yanlışsa alımı silip yeniden gir. Kart, rulo gramı ve fiyat bu alımın rulolarına da yazılır.`);
    }
    case 'addPrinter':
      return openModal('Yazıcı ekle', PRINTER_FIELDS, null, b => api('printer', { method: 'POST', body: b }));
    case 'editPrinter': {
      const p = S.printers.find(x => x.id === id);
      return openModal('Yazıcıyı düzenle', PRINTER_FIELDS, p, b => api('printer_update', { method: 'POST', id, body: b }),
        'Seri no değişirse yerel bağlayıcının config.json dosyası da güncellenmeli.');
    }
    case 'editSale':
      return loadSale(S.sales.find(v => v.id === id));
    case 'editEvent': {
      const e = S.events.find(v => v.id === id);
      const fields = [
        { name: 'grams', label: 'Gram', type: 'number', step: '0.1', min: 0.1, required: true },
        { name: 'date', label: 'Tarih', type: 'date', required: true },
        ...(e.kind === 'waste' ? [{ name: 'category', label: 'Atık türü', type: 'select', options: CAT_OPTS }] : []),
        { name: 'note', label: 'Not' },
      ];
      return openModal(`${KIND[e.kind]} kaydını düzenle`, fields, { ...e, grams: -e.grams },
        b => api('event_update', { method: 'POST', id, body: b }));
    }
  }
  return false;
}

// ---------- FORM GONDERIMI ----------
function formBody(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function run(fn, okMsg) {
  try {
    await fn();
    await refresh();
    if (okMsg) toast(okMsg);
  } catch (e) {
    if (e.message !== 'Giriş gerekli') toast(e.message, true);
  }
}

// ---------- OLAYLAR ----------
document.addEventListener('click', e => {
  const tabBtn = e.target.closest('nav [data-tab]');
  if (tabBtn) return switchTab(tabBtn.dataset.tab);

  // Filament: kart/liste gorunumu ve ayrintiyi ac/kapat
  const view = e.target.closest('.view-toggle [data-view]');
  if (view) {
    cardView = view.dataset.view;
    try { localStorage.setItem('fil_card_view', cardView); } catch { /* yoksay */ }
    return renderSpools();
  }
  const tg = e.target.closest('[data-toggle-card]');
  if (tg && !e.target.closest('button, a, select, input')) {
    const cid = +tg.dataset.toggleCard;
    if (!OPEN_CARDS.delete(cid)) OPEN_CARDS.add(cid);
    return renderSpools();
  }

  // Dashboard: [data-goto] sekmeye gider, data-spool varsa o filamentyi secer.
  const go = e.target.closest('[data-goto]');
  if (go && !e.target.closest('[data-act]')) {
    if (go.dataset.search !== undefined) {
      $('#search').value = go.dataset.search;
      renderSpools();
    }
    if (go.dataset.spool) {
      $('#spoolSel').value = go.dataset.spool;
      renderSpoolInfo();
      renderSpoolEvents();
    }
    switchTab(go.dataset.goto);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (editAction(btn.dataset.act, id) !== false) return;
  switch (btn.dataset.act) {
    case 'delSpool':
      if (!confirm('Alıma bağlı olmayan bu eski rulo ve tüm hareketleri silinsin mi?')) return;
      run(() => api('spool', { method: 'DELETE', id }), 'Rulo silindi');
      break;
    case 'delCard':
      if (!confirm('Bu stok kartı silinsin mi?')) return;
      run(() => api('card', { method: 'DELETE', id }), 'Stok kartı silindi');
      break;
    case 'buyCard':
      switchTab('alim');
      $('#pCard').value = String(id);
      showPurchaseCard();
      $('#purchaseForm').qty.focus();
      break;
    case 'pick':
      $('#spoolSel').value = String(id);
      switchTab('baski');
      renderSpoolInfo();
      renderSpoolEvents();
      break;
    case 'weigh':
      $('#spoolSel').value = String(id);
      switchTab('baski');
      renderSpoolInfo();
      renderSpoolEvents();
      $('#weighForm [name="measured_g"]').focus();
      break;
    case 'delPurchase':
      if (!confirm('Bu alım ve ona bağlı tüm filament/hareketler silinsin mi?')) return;
      run(() => api('purchase', { method: 'DELETE', id }), 'Alım silindi');
      break;
    case 'delEvent':
      if (!confirm('Bu hareket silinsin mi? Kalan gram yeniden hesaplanır.')) return;
      run(() => api('event', { method: 'DELETE', id }), 'Kayıt silindi');
      break;
    case 'delPrinter':
      if (!confirm('Yazıcı ve bağlı işleri silinsin mi? İşlere bağlı baskı hareketleri de silinir.')) return;
      run(() => api('printer', { method: 'DELETE', id }), 'Yazıcı silindi');
      break;
    case 'delJob':
      if (!confirm('Bu iş silinsin mi?')) return;
      run(() => api('job', { method: 'DELETE', id }), 'İş silindi');
      break;
    case 'assign': {
      const row = btn.closest('tr');
      const body = {
        spool_id: row.querySelector('[data-f="spool"]').value || null,
        grams: +row.querySelector('[data-f="grams"]').value || 0,
        price: +row.querySelector('[data-f="price"]').value || 0,
      };
      run(() => api('job_assign', { method: 'POST', id, body }), 'İş kaydedildi');
      break;
    }
    case 'delSale':
      if (!confirm('Satış silinsin mi?')) return;
      run(() => api('sale', { method: 'DELETE', id }), 'Satış silindi');
      break;
  }
});

function switchTab(name) {
  $$('nav [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('main .tab').forEach(t => t.classList.toggle('hidden', t.id !== `tab-${name}`));
}

$('#search').addEventListener('input', renderSpools);
$('#spoolGrid').addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-toggle-card]')) { e.preventDefault(); e.target.click(); }
});
$('#spoolSel').addEventListener('change', () => { renderSpoolInfo(); renderSpoolEvents(); });

$('#pCard').addEventListener('change', showPurchaseCard);
$('#purchaseForm').addEventListener('reset', () => setTimeout(() => { $('#pCard').value = ''; showPurchaseCard(); }));
$('#purchaseForm').addEventListener('input', purchasePreview);
$('#purchaseForm').addEventListener('change', purchasePreview);
$('#purchaseForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const b = formBody(f);
  const body = {
    date: b.date,
    card_id: +b.card_id,
    qty: +b.qty,
    unit_price: +b.unit_price,
    payment_type: b.payment_type,
    card_name: b.card_name || null,
    installments: +b.installments || 1,
    monthly_amount: b.monthly_amount !== '' ? +b.monthly_amount : null,
    notes: b.notes || null,
  };
  run(async () => {
    await api('purchase', { method: 'POST', body });
    f.reset();
    f.date.value = today();
    purchasePreview();
  }, 'Alım kaydedildi');
});

$$('#useForm input[name="kind"]').forEach(r => r.addEventListener('change', () => {
  $('#catWrap').classList.toggle('hidden', $('#useForm input[name="kind"]:checked').value !== 'waste');
}));

$('#useForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const b = formBody(f);
  const id = Number($('#spoolSel').value);
  if (!id) return toast('Filament seç', true);
  run(async () => {
    await api('spool_use', {
      method: 'POST', id,
      body: { kind: b.kind, grams: +b.grams, category: b.category, date: b.date, note: b.note || null },
    });
    f.grams.value = '';
    f.note.value = '';
  }, 'Kaydedildi');
});

$('#weighForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const b = formBody(f);
  const id = Number($('#spoolSel').value);
  if (!id) return toast('Filament seç', true);
  run(async () => {
    const res = await api('spool_weigh', {
      method: 'POST', id,
      body: { measured_g: +b.measured_g, date: b.date, note: b.note || null },
    });
    toast(`Sapma: ${res.diff_g >= 0 ? '+' : ''}${Math.round(res.diff_g)} g`);
    f.measured_g.value = '';
    f.note.value = '';
  });
});

$('#saleForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const id = +f.sale_id.value || 0;
  const body = { date: f.date.value, description: f.description.value, price: +f.price.value, items: saleItems() };
  run(async () => {
    const r = await api(id ? 'sale_update' : 'sale', { method: 'POST', id: id || undefined, body });
    const saleId = id || r.id;
    try {
      await uploadSaleFiles(saleId);
    } catch (err) {
      // satis kaydedildi ama dosya gitmedi: formu duzenleme modunda birak, tekrar denensin
      await refresh();
      loadSale(S.sales.find(v => v.id === saleId));
      throw err;
    }
    resetSaleForm();
  }, id ? 'Satış güncellendi' : 'Satış kaydedildi');
});
$('#saleAddItem').addEventListener('click', () => addSaleRow());
$('#saleFileInput').addEventListener('change', async e => {
  const picked = [...e.target.files];
  e.target.value = '';
  for (const f of picked) newSaleFiles.push(await shrinkImage(f));
  renderSaleFileChips();
});
$('#saleFilesNew').addEventListener('click', e => {
  const b = e.target.closest('[data-rm-new]');
  if (!b) return;
  newSaleFiles.splice(+b.dataset.rmNew, 1);
  renderSaleFileChips();
});
$('#saleFilesOld').addEventListener('click', e => {
  const b = e.target.closest('[data-del-file]');
  if (!b || !confirm('Bu dosya kalıcı olarak silinsin mi?')) return;
  const saleId = +$('#saleForm').sale_id.value;
  run(async () => {
    await api('sale_file', { method: 'DELETE', id: +b.dataset.delFile });
    await refresh();
    renderSaleFileChips(S.sales.find(v => v.id === saleId)?.files || []);
  }, 'Dosya silindi');
});
$('#saleCancel').addEventListener('click', resetSaleForm);
$('#saleItems').addEventListener('click', e => {
  if (!e.target.closest('[data-rm]')) return;
  e.target.closest('.sale-item').remove();
  if (!$('#saleItems .sale-item')) addSaleRow();
  salePreview();
});
$('#saleForm').addEventListener('input', salePreview);
$('#saleForm').addEventListener('change', salePreview);

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  try {
    await api('login', { method: 'POST', body: { username: $('#user').value, password: $('#pw').value } });
    $('#pw').value = '';
    await refresh();
    showApp();
  } catch (err) {
    $('#loginErr').textContent = err.message;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('logout').catch(() => {});
  showLogin();
});

// ---------- RENK SECICI (Windows renk penceresi gibi) ----------
// Ton/Doygun/Parlak Windows'taki gibi 0-239 / 0-240 / 0-240 olcegindedir.
const BASIC_COLORS = [
  '#ff8080', '#ffff80', '#80ff80', '#00ff80', '#80ffff', '#0080ff', '#ff80c0', '#ff80ff',
  '#ff0000', '#ffff00', '#80ff00', '#00ff40', '#00ffff', '#0080c0', '#8080c0', '#ff00ff',
  '#804040', '#ff8040', '#00ff00', '#008080', '#004080', '#8080ff', '#800040', '#ff0080',
  '#800000', '#ff8000', '#008000', '#008040', '#0000ff', '#0000a0', '#800080', '#8000ff',
  '#400000', '#804000', '#004000', '#004040', '#000080', '#000040', '#400040', '#400080',
  '#000000', '#808000', '#808040', '#808080', '#408080', '#c0c0c0', '#400040', '#ffffff',
];
const CUSTOM_KEY = 'fil_custom_colors';
const CP = { h: 160, s: 0, l: 0, rgb: [0, 0, 0], target: null, slot: null };

const validHex = v => {
  v = String(v || '').trim();
  if (/^[0-9a-f]{6}$/i.test(v)) v = '#' + v;
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
};
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [Math.round(h * 240) % 240, Math.round(s * 240), Math.round(l * 240)];
}

function hsl2rgb(H, S, L) {
  const h = H / 240, s = S / 240, l = L / 240;
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => {
    t = (t + 1) % 1;
    return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p);
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(Math.round);
}

function loadCustom() {
  try {
    const a = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    return Array.from({ length: 16 }, (_, i) => validHex(a[i]));
  } catch { return Array(16).fill(null); }
}
function saveCustom(a) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(a)); } catch { /* tarayici izin vermiyorsa sadece bu oturumda kalir */ }
}

// RGB'den gelince ton/doygunluk griye dusunce kaybolmasin diye eski ton korunur.
function cpSetRgb(rgb) {
  CP.rgb = rgb.map(v => clamp(Math.round(v), 0, 255));
  const [h, s, l] = rgb2hsl(CP.rgb);
  if (s) CP.h = h;
  if (l > 0 && l < 240) CP.s = s;
  CP.l = l;
  cpRender();
}
function cpSetHsl(h, s, l) {
  CP.h = clamp(Math.round(h), 0, 239); CP.s = clamp(Math.round(s), 0, 240); CP.l = clamp(Math.round(l), 0, 240);
  CP.rgb = hsl2rgb(CP.h, CP.s, CP.l);
  cpRender();
}

function cpDrawSpectrum() {
  const c = $('#cpSpec'), x = c.getContext('2d');
  const hue = x.createLinearGradient(0, 0, c.width, 0);
  for (let i = 0; i <= 6; i++) hue.addColorStop(i / 6, `hsl(${i * 60}, 100%, 50%)`);
  x.fillStyle = hue; x.fillRect(0, 0, c.width, c.height);
  const gray = x.createLinearGradient(0, 0, 0, c.height);
  gray.addColorStop(0, 'rgba(128,128,128,0)'); gray.addColorStop(1, 'rgb(128,128,128)');
  x.fillStyle = gray; x.fillRect(0, 0, c.width, c.height);
}

function cpRender() {
  const hex = rgb2hex(CP.rgb);
  const c = $('#cpLum'), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#fff'); g.addColorStop(0.5, rgb2hex(hsl2rgb(CP.h, CP.s, 120))); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  $('#cpCross').style.left = `${(CP.h / 239) * 100}%`;
  $('#cpCross').style.top = `${(1 - CP.s / 240) * 100}%`;
  $('#cpArrow').style.top = `${(1 - CP.l / 240) * 100}%`;
  $('#cpPrev').style.background = hex;
  const vals = { h: CP.h, s: CP.s, l: CP.l, r: CP.rgb[0], g: CP.rgb[1], b: CP.rgb[2] };
  $$('#colorDlg [data-k]').forEach(i => { if (i !== document.activeElement) i.value = vals[i.dataset.k]; });
  if ($('#cpHex') !== document.activeElement) $('#cpHex').value = hex;
  $$('#cpBasic button').forEach(b => b.classList.toggle('on', b.dataset.hex === hex));
}

function cpRenderCustom() {
  const list = loadCustom();
  $('#cpCustom').innerHTML = list.map((h, i) =>
    `<button type="button" data-i="${i}" class="${CP.slot === i ? 'on' : ''}"${h ? ` style="background:${h}"` : ''} aria-label="Özel renk ${i + 1}"></button>`).join('');
}

function cpDrag(el, fn) {
  el.addEventListener('pointerdown', e => {
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const at = ev => fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1));
    at(e);
    el.onpointermove = at;
    el.onpointerup = el.onpointercancel = () => { el.onpointermove = null; };
  });
}

function openColorPicker(input) {
  CP.target = input;
  CP.slot = null;
  cpSetRgb(hex2rgb(validHex(input.value) || '#888888'));
  cpRenderCustom();
  $('#colorDlg').showModal();
}

function cpOk() {
  const inp = CP.target;
  if (inp) {
    inp.value = rgb2hex(CP.rgb);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  $('#colorDlg').close();
}

function initColorPicker() {
  $('#cpBasic').innerHTML = BASIC_COLORS.map(h =>
    `<button type="button" data-hex="${h}" style="background:${h}" aria-label="${h}"></button>`).join('');
  $('#cpBasic').addEventListener('click', e => { const b = e.target.closest('button'); if (b) cpSetRgb(hex2rgb(b.dataset.hex)); });
  $('#cpBasic').addEventListener('dblclick', e => { if (e.target.closest('button')) cpOk(); });
  $('#cpCustom').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    CP.slot = +b.dataset.i;
    const h = loadCustom()[CP.slot];
    if (h) cpSetRgb(hex2rgb(h));
    cpRenderCustom();
  });
  $('#cpAddCustom').addEventListener('click', () => {
    const list = loadCustom();
    const i = CP.slot ?? Math.max(0, list.indexOf(null));
    list[i] = rgb2hex(CP.rgb);
    saveCustom(list);
    CP.slot = (i + 1) % 16;
    cpRenderCustom();
  });
  // Spektrumda tiklayinca parlaklik siyah/beyazda kaldiysa renk gorunsun diye ortaya alinir.
  cpDrag($('#cpSpec').parentElement, (x, y) =>
    cpSetHsl(x * 239, (1 - y) * 240, CP.l === 0 || CP.l === 240 ? 120 : CP.l));
  cpDrag($('#cpLum').parentElement, (x, y) => cpSetHsl(CP.h, CP.s, (1 - y) * 240));
  $$('#colorDlg [data-k]').forEach(i => i.addEventListener('input', () => {
    const v = k => +$(`#colorDlg [data-k="${k}"]`).value || 0;
    if ('hsl'.includes(i.dataset.k)) cpSetHsl(v('h'), v('s'), v('l'));
    else cpSetRgb([v('r'), v('g'), v('b')]);
  }));
  $('#cpHex').addEventListener('input', () => { const h = validHex($('#cpHex').value); if (h) cpSetRgb(hex2rgb(h)); });
  $('#colorDlg').addEventListener('close', () => { $$('#colorDlg input').forEach(i => i.blur()); });
  $('#cpOk').addEventListener('click', cpOk);
  $('#cpCancel').addEventListener('click', () => $('#colorDlg').close());
  cpDrawSpectrum();
}

// Renk alani: kutucuk pencereyi acar, yanindaki kutuya hex de yazilabilir.
function initColorFields(root) {
  $$('.color-field', root).forEach(w => {
    const inp = $('input', w), sw = $('.swatch', w);
    const sync = () => {
      const h = validHex(inp.value);
      sw.style.background = h || 'transparent';
      inp.classList.toggle('bad-input', !h);
    };
    sw.addEventListener('click', () => openColorPicker(inp));
    inp.addEventListener('input', sync);
    inp.addEventListener('change', () => { const h = validHex(inp.value); if (h) inp.value = h; sync(); });
    inp.form?.addEventListener('reset', () => setTimeout(sync));
    sync();
  });
}

// ---------- BASLANGIC ----------
(function init() {
  $$('input[type="date"]').forEach(i => { i.value = today(); });
  purchasePreview();
  initColorPicker();
  resetSaleForm();
  api('upload_limit').then(r => {
    uploadLimit = r.bytes;
    $('#uploadLimit').textContent = `· dosya başı en fazla ${fmtSize(r.bytes)}`;
  }).catch(() => {});
  // Panel koprusu aciksa kullanici adi alani gorunur; panelde oturum varsa direkt girer.
  // Giris adresi once ogrenilir ki oturum yoksa form yerine panel girisine gidilsin.
  api('auth_mode').then(m => {
    const admin = m.mode === 'admin';
    loginUrl = m.login_url || null;
    $('#user').classList.toggle('hidden', !admin);
    $('#user').required = admin;
    $('#loginHint').classList.toggle('hidden', !admin);
  }).catch(() => {})
    .then(() => refresh().then(showApp).catch(() => showLogin()));
})();
