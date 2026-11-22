// =====================================================================
//  Kantor Pine XAUUSD — Aplikasi (PWA) v3
//  Beranda = keputusan dulu: aksi, kekuatan, peluang historis, kapan batal.
// =====================================================================
import { analyze, planState, positionSize, activeSessions, marketOpen, mergeCandles, aggregate, PRIOR_WEIGHTS } from './engine.js';
import { loadMarket, loadSpot, loadServer } from './data.js';
import { buildEA, buildPine, mapSummary, makeMapImage, makeZip, EA_README, lastEAName, wib, num, hzLabel, setAsset } from './exporters.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }
const pct = v => v == null ? '–' : Math.round(v * 100) + '%';
const sgn = v => (v >= 0 ? '+' : '') + v.toFixed(2);
const COL = { green: 'var(--green)', red: 'var(--red)', gold: 'var(--gold)' };
const kCol = k => k >= 70 ? 'var(--green)' : k >= 50 ? 'var(--gold)' : 'var(--red)';

// ---------- state (per aset) ----------
const GOLD_ID = 'XAUUSD';
const mapKey = id => id === GOLD_ID ? 'kpx_map_active' : `kpx_map_${id}`;
const S = {
  settings: store.get('kpx_settings', { balance: 1000, riskPct: 1, notif: false, remap: 60 }),
  asset: (new URLSearchParams(location.search).get('aset') || '').toUpperCase().replace(/[^A-Z]/g, '') || store.get('kpx_asset', GOLD_ID), assets: store.get('kpx_assets', null),
  market: null, srv: {}, map: null, spot: null, spotAt: 0,
  history: store.get('kpx_history', []), states: {}, source: '',
};
S.map = store.get(mapKey(S.asset), null);
const cfg = id => id === GOLD_ID ? { provider: 'xaus', base: 'data/' } : { provider: 'binance', symbol: id.replace(/USD$/, 'USDT'), base: `data/aset/${id}/` };
const prof = () => S.srv?.market?.profil || (S.map?.aset?.jam ? S.map.aset : undefined);
const isGold = () => S.asset === GOLD_ID;
const dg = () => S.map?.aset?.digit ?? 2;
const px = v => Number.isFinite(+v) ? (+v).toFixed(dg()) : '-';
const pxShort = v => Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(dg());
async function loadAssets() {
  try { const r = await fetch('data/aset.json', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); S.assets = j; store.set('kpx_assets', j); } } catch {}
  renderAssetBar();
}
function renderAssetBar() {
  const list = [{ id: GOLD_ID, nama: 'Emas' }, ...((S.assets?.daftar || []).filter(a => (S.assets.aktif || []).includes(a.id)))];
  $('assetBar').innerHTML = list.map(a => `<button class="achip ${a.id === S.asset ? 'on' : ''}" onclick="kpx.pick('${a.id}')"><b>${a.id.replace(/USD$/, '')}</b><span>${a.id === GOLD_ID ? 'emas' : a.vol30 ? `vol ${Math.round(a.vol30)}%` : '24/7'}</span></button>`).join('');
}
const saveSettings = () => store.set('kpx_settings', S.settings);

// ---------- navigasi ----------
function go(v) {
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'v-' + v));
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  window.scrollTo({ top: 0 });
}
$('nav').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.v); };
window.kpx = { go };
function setNet(cls, txt) { $('netDot').className = 'dot ' + cls; $('netTxt').textContent = txt; }
function banner(msg) { const b = $('banner'); b.innerHTML = msg || ''; b.classList.toggle('show', !!msg); }

// ---------- data & analisis ----------
const ageH = iso => (Date.now() - Date.parse(iso)) / 3600e3;
const agoTxt = iso => { const h = ageH(iso); return h < 1 ? `${Math.max(1, Math.round(h * 60))} menit lalu` : h < 48 ? `${Math.round(h)} jam lalu` : `${Math.round(h / 24)} hari lalu`; };
function runMapping(m) {
  const srv = S.srv || {}, mk = srv.market || {};
  const r = analyze({ points: m?.points || [], spot: m?.spot, daily: mk.daily?.length ? mk.daily : (m?.daily || []), h1: mk.h1, m15: mk.m15,
    macro: mk.macro, calendar: mk.calendar, news: srv.news, claude: isGold() ? srv.claude : null, calib: srv.calib, kinerja: srv.kinerja, profil: mk.profil || undefined, now: new Date() });
  r.sumber_harga = m ? `${m.source} + candle server` : 'candle server GitHub (harga live tidak terjangkau)';
  S.map = r; S.states = {}; store.set(mapKey(S.asset), r);
  S.history.unshift({ aset: S.asset, time: r.basis.dibuat, price: r.basis.price, bias: r.bias, conf: r.keyakinan, aksi: r.narasi?.aksi, k: r.kekuatan_sinyal });
  S.history = S.history.slice(0, 60); store.set('kpx_history', S.history);
  return r;
}
async function refresh({ remap = false } = {}) {
  const id = S.asset, c = cfg(id);
  setNet('warn', 'Memperbarui…');
  const srvP = loadServer({ base: c.base, key: id }).then(v => { if (S.asset === id) S.srv = v; }).catch(() => {});
  let m = null;
  try { m = await loadMarket({ provider: c.provider, symbol: c.symbol }); if (S.asset !== id) return; S.market = m; S.source = m.source; S.spot = m.spot; S.spotAt = m.spotAt; }
  catch (e) { console.warn(e); }
  await srvP; if (S.asset !== id) return;
  try {
    const age = S.map ? (Date.now() - Date.parse(S.map.basis.dibuat || S.map.basis.time)) / 60000 : Infinity;
    const reopened = S.map && S.map.gap && marketOpen(new Date(), prof()) && Date.now() >= Date.parse(S.map.basis.time);
    const old = S.map && S.map.engine !== undefined && !/^3\.[1-9]/.test(String(S.map.engine));
    if (remap || reopened || old || !S.map || (S.settings.remap > 0 && age >= S.settings.remap)) runMapping(m);
    banner(m ? '' : 'Harga live tidak terjangkau — analisis memakai candle server GitHub (diperbarui tiap jam).');
    setNet(m ? (marketOpen(new Date(), prof()) ? 'on' : 'warn') : 'warn', m ? (marketOpen(new Date(), prof()) ? 'Live' : 'Pasar tutup') : 'Data server');
  } catch (e) {
    console.warn(e);
    try { const r = await (await fetch(c.base + 'latest.json', { cache: 'no-store' })).json(); if (r && r.basis) { S.map = r; banner(`Menampilkan mapping server GitHub (${wib(new Date(r.basis.dibuat || r.basis.time))} WIB).`); } }
    catch { banner(S.map ? 'Offline — menampilkan mapping terakhir yang tersimpan.' : 'Tidak bisa mengambil data pasar. Periksa koneksi internet lalu coba lagi.'); }
    setNet('off', 'Offline');
  }
  S.tried = true;
  renderAll();
}
async function spotTick() {
  if (document.hidden) return;
  const id = S.asset, c = cfg(id);
  try { const s = await loadSpot({ provider: c.provider, symbol: c.symbol }); if (S.asset !== id) return; S.spot = s.price; S.spotAt = s.at; setNet(marketOpen(new Date(), prof()) ? 'on' : 'warn', marketOpen(new Date(), prof()) ? 'Live' : 'Pasar tutup'); checkStates(); renderHome(); renderPlanLive(); }
  catch { setNet('off', 'Offline'); }
}

// ---------- status live + notifikasi ----------
function checkStates() {
  if (!S.map || !Number.isFinite(S.spot)) return;
  const t0 = Date.parse(S.map.basis.time);
  S.map.rencana.forEach((pl, i) => {
    const st = planState(pl, S.spot, Date.now(), t0), prev = S.states[i];
    if (prev && prev !== st.kode && (st.kode === 'zone' || st.kode === 'sl')) notify(`${S.asset} ${pl.tipe} (${pl.kekuatan}%)`, st.teks);
    S.states[i] = st.kode;
  });
}
async function notify(title, body) {
  toast(`${title}: ${body}`);
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  if (!S.settings.notif || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { const reg = await navigator.serviceWorker?.ready; reg ? reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'kpx-' + title }) : new Notification(title, { body }); } catch {}
}

// ---------- grafik: 12 jam terakhir + proyeksi 24 jam + zona + level ----------
function pastSeries() {
  const live = aggregate(S.market?.points || [], 15);
  return mergeCandles(S.srv?.market?.m15 || [], live).map(c => ({ t: c.t + 900, p: c.c }));
}
function chart(r, live, H = 230, opt = {}) {
  const W = 360, L = 6, R = 54, T = 10, B = 26, split = 0.32;
  const points = pastSeries();
  const p0 = r.basis.price, t0 = Date.parse(r.basis.time) / 1000;
  const lastT = points.length ? points[points.length - 1].t : t0;
  const tEnd = Math.min(t0, lastT);
  const past = points.filter(x => x.t >= tEnd - 12 * 3600 && x.t <= tEnd);
  const fut = [{ m: 0, h: p0, lo: p0, hi: p0 }, ...r.proyeksi.map(p => ({ m: p.menit, h: p.harga, lo: p.bawah, hi: p.atas }))];
  const plans = (r.rencana || []).slice(0, opt.plans ?? 2), lv = opt.levels === false ? [] : (r.level || []);
  let vals = [...past.map(x => x.p), ...fut.flatMap(f => [f.lo, f.hi])];
  plans.forEach(pl => vals.push(pl.entry_bawah, pl.entry_atas, pl.sl, pl.tp1));
  if (live && Number.isFinite(live.price)) vals.push(live.price);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * .06 || 1; lo -= pad; hi += pad;
  const X0 = L + (W - L - R) * split, Y = v => T + (hi - v) * (H - T - B) / (hi - lo);
  const Xp = t => L + (t - (tEnd - 12 * 3600)) / (12 * 3600) * (X0 - L);
  const Xf = i => X0 + i * (W - R - X0) / (fut.length - 1);
  const Xm = m => { for (let i = 1; i < fut.length; i++) if (m <= fut[i].m) return Xf(i - 1) + (m - fut[i - 1].m) / (fut[i].m - fut[i - 1].m) * (Xf(i) - Xf(i - 1)); return Xf(fut.length - 1); };
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" role="img" aria-label="Grafik harga dan proyeksi XAUUSD">`;
  lv.forEach(l => { if (l.harga < lo || l.harga > hi) return;
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(l.harga)}" y2="${Y(l.harga)}" stroke="var(--line)" stroke-width="1"/><text x="${W - R + 3}" y="${Y(l.harga) + 3}" font-size="8" fill="var(--muted)">${pxShort(l.harga)}</text>`; });
  plans.forEach((pl, i) => { const a = Math.max(pl.entry_bawah, pl.entry_atas), b = Math.min(pl.entry_bawah, pl.entry_atas), c = pl.tipe === 'SELL' ? 'var(--red)' : 'var(--green)';
    const xe = Xm(Math.min(pl.berlaku_menit || 1440, 1440)), op = i ? .1 : .2;
    s += `<rect x="${L}" y="${Y(a)}" width="${xe - L}" height="${Math.max(Y(b) - Y(a), 2)}" fill="${c}" opacity="${op}"/>`;
    if (!i) { s += `<line x1="${X0}" x2="${xe}" y1="${Y(pl.sl)}" y2="${Y(pl.sl)}" stroke="var(--red)" stroke-dasharray="4 3" stroke-width="1"/><text x="${xe - 2}" y="${Y(pl.sl) - 3}" font-size="8.5" fill="var(--red)" text-anchor="end">SL ${pxShort(pl.sl)}</text>`;
      s += `<line x1="${X0}" x2="${xe}" y1="${Y(pl.tp1)}" y2="${Y(pl.tp1)}" stroke="var(--green)" stroke-dasharray="4 3" stroke-width="1"/><text x="${xe - 2}" y="${Y(pl.tp1) - 3}" font-size="8.5" fill="var(--green)" text-anchor="end">TP1 ${pxShort(pl.tp1)}</text>`; }
    s += `<text x="${L + 3}" y="${Y(a) - 3}" font-size="9" fill="${c}" font-weight="700">${pl.tipe} ${pl.kekuatan ?? ''}${pl.kekuatan != null ? '%' : ''}</text>`; });
  s += `<polygon points="${fut.map((f, i) => `${Xf(i)},${Y(f.hi)}`).join(' ')} ${fut.map((f, i) => `${Xf(i)},${Y(f.lo)}`).reverse().join(' ')}" fill="var(--band)"/>`;
  if (past.length > 1) s += `<polyline points="${past.map(x => `${Xp(x.t).toFixed(1)},${Y(x.p).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--muted)" stroke-width="1.5"/>`;
  s += `<polyline points="${fut.map((f, i) => `${Xf(i)},${Y(f.h)}`).join(' ')}" fill="none" stroke="var(--text)" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<line x1="${X0}" x2="${X0}" y1="${T}" y2="${H - B}" stroke="var(--gold)" stroke-dasharray="2 3"/>`;
  s += `<circle cx="${X0}" cy="${Y(p0)}" r="3.5" fill="var(--gold)"/>`;
  s += `<text x="${L}" y="${H - 9}" font-size="8.5" fill="var(--muted)">-12j</text>`;
  fut.forEach((f, i) => { if (i === 0 || [60, 240, 720, 1440].includes(f.m)) s += `<text x="${Xf(i)}" y="${H - 9}" font-size="8.5" fill="${i ? 'var(--muted)' : 'var(--gold)'}" text-anchor="middle">${i ? '+' + (f.m / 60) + 'j' : (r.gap ? 'Buka' : 'Kini')}</text>`; });
  s += `<text x="${W - R + 3}" y="${Y(fut.at(-1).h) + 3}" font-size="8.5" fill="var(--text)" font-weight="700">${pxShort(fut.at(-1).h)}</text>`;
  if (live && Number.isFinite(live.price)) {
    const em = (live.at / 1000 - t0) / 60;
    if (em >= 0 && em <= 1440) { const x = Xm(em), y = Math.min(Math.max(Y(live.price), T), H - B);
      s += `<circle cx="${x}" cy="${y}" r="4.5" fill="var(--blue)" stroke="var(--panel)" stroke-width="2"/>`; }
  }
  return s + '</svg>';
}

// ---------- komponen ----------
function segbar(k) { const n = Math.round(k / 10); return `<div class="segbar">${Array.from({ length: 10 }, (_, i) => `<i style="${i < n ? `background:${kCol(k)}` : ''}"></i>`).join('')}</div>`; }
function votes(r) {
  const dir = r.agents.filter(a => ['trend', 'momentum', 'structure', 'macro', 'news', 'claude'].includes(a.id));
  const up = dir.filter(a => a.cukup && a.skor > 0.1), dn = dir.filter(a => a.cukup && a.skor < -0.1), off = dir.filter(a => !a.cukup);
  return `<div class="votes">${dir.map(a => { const c = !a.cukup ? 'off' : a.skor > 0.1 ? 'up' : a.skor < -0.1 ? 'dn' : '';
    return `<span class="vote ${c}" title="${esc(a.peran)}">${!a.cukup ? '○' : a.skor > 0.1 ? '▲' : a.skor < -0.1 ? '▼' : '–'} ${esc(a.nama)}</span>`; }).join('')}</div>
    <div class="hint" style="margin-top:6px">${up.length} melihat naik · ${dn.length} melihat turun${off.length ? ` · ${off.length} tanpa data cukup` : ''}</div>`;
}
function qualityDot(r) {
  const q = r.kualitas || {}; const bad = q.basi === 2 || q.konsisten === false, warn = q.basi === 1 || (q.agent_kurang || []).length > 2;
  return { c: bad ? 'var(--red)' : warn ? 'var(--gold)' : 'var(--green)', t: bad ? 'Data bermasalah' : warn ? 'Data sebagian' : 'Data lengkap' };
}
function heroCard(r, p) {
  const n = r.narasi || {}, main = r.rencana[0], t0 = Date.parse(r.basis.time), st = main ? planState(main, p, Date.now(), t0) : null;
  const k = main?.kekuatan, pk = main?.peluang;
  return `<div class="card hero ${n.warna || ''}">
    <div class="row between"><span class="hint">Keputusan tim sekarang</span><span class="hint">${r.gap ? 'untuk pembukaan' : 'berlaku s/d ' + (main ? wib(new Date(t0 + main.berlaku_menit * 60000)) + ' WIB' : '-')}</span></div>
    <div class="act-big ${n.warna || ''}" style="margin-top:8px">${esc(n.aksi || r.bias)}</div>
    <div class="lead">${esc(n.judul || r.ringkasan)}</div>
    ${main ? `<div class="meter">
      <div><div class="k">Kekuatan sinyal</div><div class="v" style="color:${kCol(k)}">${k}%</div><div class="s">${esc(main.kekuatan_label)} · ${main.analis_searah} analis searah</div>${segbar(k)}</div>
      <div><div class="k">Peluang TP1 duluan</div><div class="v">${pk != null ? pct(pk) : '–'}</div><div class="s">${pk != null ? `backtest ${main.peluang_sampel} sinyal serupa` : 'belum terkalibrasi'}</div>${pk != null ? segbar(pk * 100) : ''}</div>
    </div>
    <div class="grid3" style="margin-top:10px"><div>Zona ${main.tipe}<b>${num(main.entry_bawah)}–${num(main.entry_atas)}</b></div><div>Stop loss<b class="dn">${num(main.sl)}</b></div><div>TP1 · TP2<b class="up">${num(main.tp1)} · ${num(main.tp2)}</b></div></div>
    ${st ? `<div class="state ${st.kode}">${esc(st.teks)}</div>` : ''}` : ''}
    <ul class="why">${(n.kenapa || []).map(x => `<li><b class="${(n.warna === 'red') ? 'dn' : n.warna === 'green' ? 'up' : 'gold'}">✓</b><span>${esc(x[0].toUpperCase() + x.slice(1))}</span></li>`).join('')}
      ${(n.penghambat || []).map(x => `<li><b class="hint">✕</b><span class="hint">Penghambat: ${esc(x)}</span></li>`).join('')}</ul>
    ${n.batal ? `<div class="note"><b>Batal:</b> ${esc(n.batal.replace(/^Batal /, ''))} ${n.target ? `<br><b>Target:</b> ${esc(n.target)}` : ''}</div>` : ''}
    ${n.waspada ? `<div class="note warn">⚠ ${esc(n.waspada)}</div>` : ''}
    ${(r.kualitas?.basi === 2) ? `<div class="note bad">${esc(r.peringatan_list?.[0] || 'Data basi')}</div>` : ''}
    <div class="hint" style="margin-top:8px">${esc(n.keandalan || '')}</div>
  </div>`;
}
function trackCard(compact = true) {
  const c = S.srv?.calib, k = S.srv?.kinerja;
  if (!c?.rencana && !k?.d30?.tersentuh) return '';
  const R = c?.rencana?.oos || c?.rencana, L = k?.d30;
  return `<div class="sec">Rekam jejak sistem</div><div class="card">
    <div class="stat3">
      <div><b>${R ? pct(R.winrate) : '–'}</b><span>TP1 duluan (uji)</span></div>
      <div><b class="${R && R.ekspektasi_R >= 0 ? 'up' : 'dn'}">${R ? sgn(R.ekspektasi_R) + 'R' : '–'}</b><span>rata-rata/trade</span></div>
      <div><b>${c?.arah ? pct(c.arah.h4) : '–'}</b><span>arah 4 jam tepat</span></div>
    </div>
    <div class="hint" style="margin-top:8px">Backtest ${esc(c?.periode || '')} · ${R ? R.tersentuh : 0} trade di data uji yang tidak dipakai kalibrasi.${L?.tersentuh ? ` Live 30 hari: ${L.tersentuh} trade, TP1 duluan ${pct(L.winrate)}, ${sgn(L.ekspektasi_R)}R.` : ' Rekam jejak live mulai terkumpul sejak versi ini.'}</div>
    ${compact ? `<button class="btn ghost sm" style="margin-top:10px" onclick="kpx.go('more')">Lihat detail</button>` : ''}
  </div>`;
}
function eventsCard(r) {
  const ev = (r.agents.find(a => a.id === 'calendar')?.data.events || []).filter(e => new Date(e.t) > new Date(Date.now() - 45 * 60e3)).slice(0, 6);
  if (!ev.length) return '';
  return `<div class="sec">Rilis data 24 jam ke depan</div><div class="chips">${ev.map(e => `<span class="chip ${e.dampak === 'tinggi' ? 'hi' : ''}">${wib(new Date(e.t))} · ${esc(e.nama)}</span>`).join('')}</div>`;
}
function newsCard() {
  const c = S.srv?.claude && ageH(S.srv.claude.dibuat) < 24 ? S.srv.claude : null, n = S.srv?.news;
  if (!c && !n) return '';
  const cls = v => v > 0.2 ? 'up' : v < -0.2 ? 'dn' : 'gold';
  return `<div class="sec">Kabar & sentimen</div><div class="card">
    ${c ? `<div class="row between"><b>Analisis Claude</b><span class="pill ${cls(c.skor ?? 0)}">${esc(c.sentimen)}</span></div>
      <div style="font-size:13.5px;margin-top:6px">${esc(c.ringkasan)}</div>
      ${(c.poin || []).slice(0, 3).map(x => `<div class="hint" style="margin-top:4px">• ${esc(x)}</div>`).join('')}
      <div class="hint" style="margin-top:6px">${esc(c.sesi || '')} · ${agoTxt(c.dibuat)}</div>` : ''}
    ${n ? `<div class="row between" style="${c ? 'margin-top:12px;padding-top:10px;border-top:1px solid var(--line)' : ''}"><b>Berita terkini</b><span class="pill ${cls(n.skor)}">${esc(n.label)}</span></div>
      ${(n.berita || []).slice(0, 3).map(b => `<div class="list-row"><a href="${esc(b.link)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${esc(b.judul)}</a><span class="${b.skor > 0 ? 'up' : b.skor < 0 ? 'dn' : 'hint'}" style="white-space:nowrap">${b.skor > 0 ? '▲' : b.skor < 0 ? '▼' : '•'}</span></div>`).join('')}
      <div class="hint" style="margin-top:4px">Skor kata kunci (tanpa AI) · ${agoTxt(n.dibuat)}</div>` : ''}
  </div>`;
}
function gapCard(r) {
  const g = r.gap, open = Date.parse(g.buka), ms = open - Date.now();
  const sisa = ms > 0 ? `${Math.floor(ms / 3600e3)} jam ${Math.floor(ms % 3600e3 / 60e3)} menit lagi` : 'sudah buka — buat mapping baru';
  return `<div class="card">
    <div class="row between"><b>Skenario pembukaan</b><span class="pill gold">buka ${sisa}</span></div>
    <div class="grid3" style="margin-top:10px"><div>Penutupan<b>${num(g.penutupan)}</b></div><div>Range terakhir<b>${num(g.range_hari_terakhir.low)}–${num(g.range_hari_terakhir.high)}</b></div><div>Minggu ini<b class="${(g.perubahan_mingguan_pct ?? 0) >= 0 ? 'up' : 'dn'}">${g.perubahan_mingguan_pct == null ? '-' : (g.perubahan_mingguan_pct >= 0 ? '+' : '') + g.perubahan_mingguan_pct.toFixed(2) + '%'}</b></div></div>
    <div style="font-size:13.5px;margin-top:10px">Harga ${esc(g.kondisi)}. ${esc(g.kecenderungan)}</div>
    ${g.skenario.map(x => `<div class="list-row" style="display:block"><b>${esc(x.nama)}</b> <span class="hint">· ${esc(x.kondisi)}</span><div style="font-size:13px;margin-top:2px">${esc(x.aksi)}</div></div>`).join('')}
  </div>`;
}

// ---------- render: beranda ----------
function renderHome() {
  const r = S.map; const el = $('homeBody'); el.classList.remove('skel');
  if (!r) { el.innerHTML = S.tried ? `<div class="skel">Belum ada data. <button class="btn sm" onclick="kpx.refresh()">Coba lagi</button></div>` : `<div class="skel">Tim agent sedang mengumpulkan data pasar…</div>`; el.classList.add('skel'); return; }
  if (!r.narasi) { el.innerHTML = `<div class="skel">Memperbarui ke mesin v3… <button class="btn sm" onclick="kpx.remap()">Mapping baru</button></div>`; return; }
  const p = Number.isFinite(S.spot) ? S.spot : r.basis.price, d = p - r.basis.price, t0 = Date.parse(r.basis.dibuat || r.basis.time);
  const sess = activeSessions(new Date(), prof()).map(x => x.nama), q = qualityDot(r), dp = d / r.basis.price * 100;
  el.innerHTML = `
  <div class="row between" style="margin:0 2px 10px;align-items:flex-end">
    <div><div class="hint">${esc(r.aset?.nama || 'Emas')} · ${esc(S.asset)}</div><div class="big">${px(p)}</div></div>
    <div style="text-align:right"><div class="${d >= 0 ? 'up' : 'dn'}" style="font-weight:650;font-size:14px">${r.gap ? 'tutup Jumat' : `${d >= 0 ? '+' : ''}${px(d)} (${dp >= 0 ? '+' : ''}${dp.toFixed(2)}%) sejak ${wib(new Date(t0))}`}</div>
      <div class="hint">${marketOpen(new Date(), prof()) ? `${r.aset?.jam === '24/7' ? 'Buka 24/7 · ' : ''}${sess.length ? 'Sesi ' + sess.join(' + ') : 'Antar sesi'}` : 'Pasar tutup'}</div>
      <div class="hint"><span class="qdot" style="background:${q.c}"></span>${q.t}</div></div>
  </div>
  ${heroCard(r, p)}
  ${r.gap ? gapCard(r) : ''}
  <div class="sec">Peta 24 jam</div>
  <div class="card">${chart(r, { price: S.spot, at: S.spotAt || Date.now() }, 220)}
    <div class="hint" style="margin-top:6px">Garis abu = 12 jam terakhir · garis tebal = jalur proyeksi · area emas = rentang 80% · kotak = zona entry</div></div>
  <div class="sec">Suara tim analis</div><div class="card">${votes(r)}</div>
  ${eventsCard(r)}
  ${trackCard(true)}
  ${newsCard()}
  <div class="grid2" style="margin-top:14px"><button class="btn" onclick="kpx.remap()">Mapping baru</button><button class="btn ghost" onclick="kpx.shareImage()">Bagikan gambar</button></div>
  <div class="hint" style="text-align:center;margin-top:10px">Mapping ${wib(new Date(t0))} WIB · mesin v${esc(r.engine)} · bukan nasihat keuangan</div>`;
}

// ---------- render: proyeksi ----------
function renderProj() {
  const r = S.map, el = $('projBody'); el.classList.remove('skel'); if (!r || !r.narasi) return;
  const t0 = Date.parse(r.basis.time), at = m => wib(new Date(t0 + m * 60000)), p0 = r.basis.price;
  const kal = r.proyeksi.some(p => p.kalibrasi);
  el.innerHTML = `
  <div class="card">${chart(r, { price: S.spot, at: S.spotAt || Date.now() }, 280, { plans: 3 })}
    <div class="hint" style="margin-top:6px">Rentang ${kal ? '80% hasil backtest: 8 dari 10 kali harga berakhir di area ini' : 'perkiraan volatilitas (belum terkalibrasi)'}.</div></div>
  <div class="sec">Proyeksi per waktu</div>
  <div class="card" style="padding:6px 12px"><table><tr><th>Waktu</th><th>Jalur</th><th>Rentang ${kal ? '80%' : ''}</th></tr>
  ${r.proyeksi.map(p => { const d = p.harga - p0; return `<tr><td>+${hzLabel(p.menit)}<br><span class="hint">${at(p.menit)}</span></td><td class="${d >= 0 ? 'up' : 'dn'}"><b>${num(p.harga)}</b><br><small>${d >= 0 ? '+' : ''}${px(d)}</small></td><td>${num(p.bawah)} – ${num(p.atas)}</td></tr>`; }).join('')}</table></div>
  <div class="sec">Jadwal aksi 24 jam</div>
  <div class="card" style="padding:6px 12px"><table>${r.jadwal.map(j => `<tr><td style="white-space:nowrap">${at(j.menit_mulai)}–${at(j.menit_akhir)}</td><td><span class="act ${j.aksi.split(' ')[0]}">${j.aksi}</span><br><span style="font-size:12.5px">${esc(j.detail)}</span></td></tr>`).join('')}</table></div>
  <div class="sec">Level kunci</div>
  <div class="card" style="padding:6px 12px"><table>${r.level.map(l => `<tr><td class="${l.jenis === 'Resistance' ? 'dn' : l.jenis === 'Support' ? 'up' : ''}">${l.jenis}</td><td><b>${num(l.harga)}</b></td><td class="hint">${esc(l.catatan)}</td></tr>`).join('')}</table>
    <div class="hint" style="padding:6px 0">PDH/PDL & pivot memakai candle harian versi broker (berganti 17.00 New York).</div></div>
  <div class="card"><b>Invalidasi:</b> ${esc(r.invalidasi)}<br><b>Peringatan:</b> ${esc(r.peringatan)}</div>`;
}

// ---------- render: tim agent ----------
function renderTeam() {
  const r = S.map, el = $('teamBody'); el.classList.remove('skel'); if (!r || !r.narasi) return;
  const chief = r.agents.find(a => a.id === 'chief'), W = chief?.data?.bobot || PRIOR_WEIGHTS;
  const dirA = r.agents.filter(a => W[a.id] != null);
  const maxC = Math.max(0.01, ...dirA.filter(a => a.cukup).map(a => Math.abs(a.skor * W[a.id])));
  el.innerHTML = `<div class="card"><div class="row between"><b>Konsensus Rina</b><span class="pill ${r.bias === 'BULLISH' ? 'up' : r.bias === 'BEARISH' ? 'dn' : 'gold'}">${r.bias} · ${r.keyakinan}%</span></div>
    <div class="hint" style="margin:4px 0 10px">Kontribusi tiap analis = skor × bobot${S.srv?.calib?.bobot ? ' (bobot dari backtest)' : ''}. Kanan = mendorong naik, kiri = turun.</div>
    ${dirA.map(a => { const c = a.cukup ? a.skor * W[a.id] : 0, w = Math.abs(c) / maxC * 50;
      return `<div class="contrib"><span>${esc(a.nama)}</span><div class="track">${a.cukup ? `<i style="${c >= 0 ? 'left:50%' : `left:${50 - w}%`};width:${w}%;background:${c >= 0 ? 'var(--green)' : 'var(--red)'}"></i>` : ''}</div><span class="hint" style="text-align:right">${a.cukup ? (W[a.id] * 100).toFixed(0) + '%' : 'off'}</span></div>`; }).join('')}
  </div>
  <div class="hint" style="margin:14px 2px 10px">Ketuk agent untuk melihat alasannya.</div>` +
  r.agents.map(a => `<details class="card agent-card"><summary><div class="agent ${a.id === 'chief' ? 'chief' : ''}"><div class="av">${esc(a.nama[0])}</div><div>
    <div class="row between"><b>${esc(a.nama)}</b>${a.cukup === false ? '<span class="badge">tidak ikut</span>' : `<span class="hint">${Math.round(a.keyakinan * 100)}% yakin</span>`}</div>
    <div class="hint" style="margin-top:-2px">${esc(a.peran)}</div>
    <div style="font-size:13.5px;margin-top:6px">${esc(a.ringkasan)}</div>
  </div></div></summary><ul class="d">${a.detail.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('');
}

// ---------- render: rencana ----------
function planCard(pl, i, r) {
  const t0 = Date.parse(r.basis.time);
  return `<div class="card plan ${pl.tipe}">
    <div class="row between"><b class="${pl.tipe === 'SELL' ? 'dn' : 'up'}">${i === 0 ? '★ ' : ''}${pl.tipe} · ${esc(pl.prioritas)}</b><span class="hint">s/d ${wib(new Date(t0 + pl.berlaku_menit * 60000))} WIB</span></div>
    <div class="meter">
      <div><div class="k">Kekuatan</div><div class="v" style="color:${kCol(pl.kekuatan)}">${pl.kekuatan}%</div><div class="s">${esc(pl.kekuatan_label)}</div>${segbar(pl.kekuatan)}</div>
      <div><div class="k">Peluang TP1 duluan</div><div class="v">${pl.peluang != null ? pct(pl.peluang) : '–'}</div><div class="s">${pl.peluang != null ? `${pl.peluang_sampel} sampel · ${sgn(pl.ekspektasi_R)}R` : 'belum terkalibrasi'}</div></div>
    </div>
    <div class="grid3" style="margin-top:10px"><div>Entry<b>${num(pl.entry_bawah)}–${num(pl.entry_atas)}</b></div><div>Stop loss<b class="dn">${num(pl.sl)}</b></div><div>TP1 / TP2<b class="up">${num(pl.tp1)} / ${num(pl.tp2)}</b></div></div>
    <div style="font-size:13px;margin-top:10px"><b>Kenapa:</b> ${esc(pl.alasan)} · RR 1:${pl.rr} · ${pl.analis_searah} analis searah, ${pl.analis_berlawanan} berlawanan<br><b>Konfirmasi:</b> ${esc(pl.trigger)}<br><b>Manajemen:</b> ${esc(pl.manajemen)}</div>
    ${pl.rilis?.length ? `<div class="note warn">⚠ Ada rilis berdampak tinggi dalam masa berlaku: ${esc(pl.rilis.join(', '))}</div>` : ''}
    <div class="state" id="pst${i}"></div>
  </div>`;
}
function renderPlan() {
  const r = S.map, el = $('planBody'); el.classList.remove('skel'); if (!r || !r.narasi) return;
  const pls = r.rencana;
  el.innerHTML = `<div class="hint" style="margin:0 2px 10px">Diurutkan dari sinyal terkuat. ★ = rencana yang dipakai di Beranda & EA.</div>` +
  (pls.length ? pls.map((pl, i) => planCard(pl, i, r)).join('') : `<div class="card hint">Belum ada rencana entry yang layak.</div>`) + `
  <div class="sec">Kalkulator lot</div>
  <div class="card">
    <div class="grid2"><div><label class="f">Modal (USD)</label><input type="number" id="cBal" value="${S.settings.balance}" inputmode="decimal"></div>
    <div><label class="f">Risiko per transaksi (%)</label><input type="number" id="cRisk" value="${S.settings.riskPct}" step="0.1" inputmode="decimal"></div></div>
    ${pls.length ? `<label class="f">Rencana</label><select id="cPlan">${pls.map((p, i) => `<option value="${i}">${p.tipe} ${esc(p.prioritas)} (${p.kekuatan}%)</option>`).join('')}</select>` : ''}
    <div id="cOut" style="margin-top:12px;font-size:14px"></div>
    <div class="hint" style="margin-top:6px">Asumsi 1 lot = ${isGold() ? '100 oz' : `${r.aset?.kontrak ?? 1} ${esc(S.asset.replace(/USD$/, ''))}`} (umum di broker). Cek spesifikasi kontrak broker Anda — EA menghitung lot dari spesifikasi broker langsung.</div>
  </div>
  <div class="sec">Ekspor & bagikan</div>
  <div class="card">
    <div class="grid2"><button class="btn" onclick="kpx.shareImage()">Gambar ringkasan</button><button class="btn ghost" onclick="kpx.shareText()">Teks ringkasan</button></div>
    <div class="grid2" style="margin-top:8px"><button class="btn ghost" onclick="kpx.downloadEA()">EA MT5 (.zip)</button><button class="btn ghost" onclick="kpx.copyPine()">Indikator Pine</button></div>
    <div class="hint" style="margin-top:8px">EA hanya entry pada rencana dengan kekuatan ≥ 55% (bisa diubah) dan menyesuaikan selisih harga broker otomatis. Uji di akun demo dulu.</div>
  </div>`;
  const calc = () => {
    S.settings.balance = +$('cBal').value || 0; S.settings.riskPct = +$('cRisk').value || 0; saveSettings();
    const pl = pls[+($('cPlan')?.value || 0)]; if (!pl) { $('cOut').textContent = ''; return; }
    const mid = (pl.entry_bawah + pl.entry_atas) / 2, ps = positionSize({ balance: S.settings.balance, riskPct: S.settings.riskPct, entry: mid, sl: pl.sl, contract: r.aset?.kontrak ?? 100 });
    $('cOut').innerHTML = ps ? `Lot disarankan: <b>${ps.lot.toFixed(2)}</b> · risiko $${ps.riskMoney} · jarak SL ${ps.dist}` : 'Isi modal dan risiko.';
  };
  ['cBal', 'cRisk', 'cPlan'].forEach(id => $(id) && ($(id).oninput = calc)); calc();
  renderPlanLive();
}
function renderPlanLive() {
  if (!S.map) return; const t0 = Date.parse(S.map.basis.time), p = Number.isFinite(S.spot) ? S.spot : S.map.basis.price;
  S.map.rencana.forEach((pl, i) => { const el = $('pst' + i); if (!el) return; const st = planState(pl, p, Date.now(), t0); el.className = 'state ' + st.kode; el.textContent = `${px(p)} · ${st.teks}`; });
}

// ---------- render: lainnya ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderMore(); });
function renderMore() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches;
  const c = S.srv?.calib, k = S.srv?.kinerja, r = S.map, q = r?.kualitas || {}, mk = S.srv?.market;
  $('moreBody').innerHTML = `
  ${trackCard(false)}
  ${c?.kekuatan ? `<div class="sec">Kekuatan sinyal vs hasil backtest</div><div class="card" style="padding:6px 12px"><table><tr><th>Kekuatan</th><th>Trade</th><th>TP1 duluan</th><th>Rata-rata</th></tr>
    ${c.kekuatan.map(b => `<tr><td>${b.dari}–${b.sampai - 1}%</td><td>${b.n}</td><td><b>${pct(b.peluang)}</b></td><td class="${b.ekspektasi_R >= 0 ? 'up' : 'dn'}">${sgn(b.ekspektasi_R)}R</td></tr>`).join('')}</table>
    <div class="hint" style="padding:6px 0">${esc(c.catatan)}</div></div>` : ''}
  ${k?.terakhir?.length ? `<div class="sec">Trade live terakhir (dinilai otomatis)</div><div class="card">${k.terakhir.map(x => `<div class="list-row"><span>${new Date(x.t).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${x.tipe} ${esc(x.entry)}</span><span class="${x.R > 0 ? 'up' : x.R < 0 ? 'dn' : 'hint'}">${x.hasil} ${sgn(x.R)}R</span></div>`).join('')}</div>` : ''}
  ${S.assets?.peringkat?.length ? `<div class="sec">Aset 24/7 paling volatil (30 hari)</div><div class="card" style="padding:6px 12px"><table><tr><th>Aset</th><th>Volatilitas</th><th>ATR harian</th><th></th></tr>
    ${S.assets.peringkat.map(a => `<tr><td><b>${esc(a.id.replace(/USD$/, ''))}</b> <span class="hint">${esc(a.nama)}</span></td><td>${a.vol30}%</td><td>${a.atr_pct}%</td><td>${(S.assets.aktif || []).includes(a.id) ? '<span class="badge">dipantau</span>' : ''}</td></tr>`).join('')}</table>
    <div class="hint" style="padding:6px 0">${esc(S.assets.metode)}</div></div>` : ''}
  <div class="sec">Kualitas data</div>
  <div class="card">
    <div class="list-row"><span>Umur data harga</span><span class="${q.basi ? 'dn' : 'hint'}">${q.umur_menit ?? '–'} menit</span></div>
    <div class="list-row"><span>Candle H1 / M15</span><span class="hint">${q.candle_h1 ?? '–'} / ${q.candle_m15 ?? '–'}</span></div>
    <div class="list-row"><span>Titik harga live</span><span class="hint">${q.titik_live ?? 0}</span></div>
    <div class="list-row"><span>Agent tanpa data cukup</span><span class="hint">${(q.agent_kurang || []).join(', ') || 'tidak ada'}</span></div>
    <div class="list-row"><span>Kalender</span><span class="hint">${q.kalender_asli ? 'ForexFactory' : 'perkiraan pola'}</span></div>
    <div class="list-row"><span>Data server</span><span class="hint">${mk?.dibuat ? agoTxt(mk.dibuat) : 'belum dimuat'}</span></div>
    ${mk && isGold() ? `<div class="list-row"><span>Selisih futures → spot</span><span class="hint">${mk.offset} (${mk.offset_sampel} sampel)</span></div>` : ''}
    <div class="hint" style="margin-top:6px">${isGold() ? 'Harga: xaus.com (spot, live) + candle Yahoo GC=F (disesuaikan ke spot).' : 'Harga: Binance (pasangan USDT, live tiap menit), cadangan Coinbase.'} Makro: Yahoo DXY & FRED. Harga indikatif, cocokkan dengan MT5 Anda — EA menyesuaikan selisih harga otomatis.</div>
  </div>
  <div class="sec">Pengaturan</div>
  <div class="card">
    <div class="switch"><span>Notifikasi zona entry & SL</span><input type="checkbox" id="sNotif" ${S.settings.notif ? 'checked' : ''}></div>
    <div class="switch"><span>Mapping otomatis tiap</span><select id="sRemap" style="width:auto"><option value="30">30 menit</option><option value="60">1 jam</option><option value="240">4 jam</option><option value="0">Manual</option></select></div>
  </div>
  ${standalone ? '' : `<div class="sec">Install ke HP</div><div class="card">
    ${installEvt ? `<button class="btn" id="bInstall">Install aplikasi</button>` : isIOS ? `<div style="font-size:14px">Di Safari: ketuk <b>Bagikan</b> lalu <b>Tambahkan ke Layar Utama</b>.</div>` : `<div style="font-size:14px">Buka menu browser (⋮) lalu pilih <b>Install aplikasi</b>.</div>`}
  </div>`}
  <div class="sec">Riwayat mapping di HP ini</div>
  <div class="card">${S.history.length ? S.history.slice(0, 10).map(h => `<div class="list-row"><span>${new Date(h.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' })} · ${esc((h.aset || GOLD_ID).replace(/USD$/, ''))}</span><span>${esc(h.aksi || h.bias)}</span><span class="hint">${h.k != null ? `${h.k}%` : ''}</span></div>`).join('') : '<div class="hint">Belum ada riwayat.</div>'}</div>
  <div class="sec">Tentang</div>
  <div class="card" style="font-size:13.5px">Kantor Pine: tim agent analisis kuantitatif yang berjalan di perangkat Anda, tanpa akun dan tanpa API key. Bobot agent dan peluang sinyal dikalibrasi ulang tiap hari dari backtest, dan setiap mapping dinilai otomatis.<br><br><b>Disclaimer:</b> proyeksi adalah skenario probabilitas, bukan kepastian dan bukan nasihat keuangan. Hasil masa lalu tidak menjamin hasil berikutnya. Gunakan stop loss dan uji di akun demo.</div>`;
  $('sNotif').onchange = async e => {
    if (e.target.checked && 'Notification' in window && Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') { e.target.checked = false; toast('Izin notifikasi ditolak'); } }
    S.settings.notif = e.target.checked; saveSettings();
  };
  const sr = $('sRemap'); sr.value = String(S.settings.remap); sr.onchange = () => { S.settings.remap = +sr.value; saveSettings(); };
  const bi = $('bInstall'); if (bi) bi.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; renderMore(); };
}

// ---------- ekspor ----------
function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
async function shareFile(blob, name, title) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  downloadBlob(blob, name); toast('File disimpan');
}
Object.assign(window.kpx, {
  pick(id) {
    if (id === S.asset) return;
    S.asset = id; store.set('kpx_asset', id);
    S.map = store.get(mapKey(id), null); S.market = null; S.spot = null; S.spotAt = 0; S.states = {};
    const k = `kpx_srv_${id}_`; S.srv = { market: store.get(k + 'market', null), calib: store.get(k + 'calib', null), kinerja: store.get(k + 'kinerja', null), news: store.get(k + 'news', null), claude: store.get(k + 'claude', null) };
    renderAssetBar(); renderAll(); window.scrollTo({ top: 0 }); refresh();
  },
  refresh: () => refresh(),
  remap: async () => { await refresh({ remap: true }); toast('Mapping baru selesai'); },
  async shareImage() { if (!S.map) return; toast('Membuat gambar…'); const b = await makeMapImage(S.map, { past: pastSeries() }); setAsset(S.map); await shareFile(b, `mapping-${S.asset.toLowerCase()}-${Date.now()}.png`, `Mapping ${S.asset}`); },
  async shareText() { if (!S.map) return; const t = mapSummary(S.map); if (navigator.share) { try { await navigator.share({ text: t }); return; } catch (e) { if (e.name === 'AbortError') return; } } try { await navigator.clipboard.writeText(t); toast('Ringkasan disalin'); } catch { toast('Tidak bisa menyalin'); } },
  downloadEA() { if (!S.map) return; const code = buildEA(S.map); if (!code) return toast('Rencana belum lengkap untuk EA'); const name = lastEAName; downloadBlob(makeZip([{ name, text: code }, { name: 'CARA_PASANG.txt', text: EA_README }]), name.replace('.mq5', '.zip')); },
  async copyPine() { if (!S.map) return; const p = buildPine(S.map); try { await navigator.clipboard.writeText(p.code); toast('Kode Pine disalin — tempel di Pine Editor'); } catch { downloadBlob(new Blob([p.code], { type: 'text/plain' }), p.name); } },
});

function renderAll() { setAsset(S.map); renderHome(); renderProj(); renderTeam(); renderPlan(); renderMore(); checkStates(); }

// ---------- mulai ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (/^#(home|proj|team|plan|more)$/.test(location.hash)) go(location.hash.slice(1));
{ const k = `kpx_srv_${S.asset}_`; S.srv = { market: store.get(k + 'market', null), calib: store.get(k + 'calib', null), kinerja: store.get(k + 'kinerja', null), news: store.get(k + 'news', null), claude: store.get(k + 'claude', null) }; }
renderAssetBar(); loadAssets();
renderAll();
refresh();
setInterval(spotTick, 60000);
setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) spotTick(); });
