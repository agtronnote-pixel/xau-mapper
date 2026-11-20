// =====================================================================
//  Kantor Pine XAUUSD — Aplikasi (PWA)
// =====================================================================
import { analyze, planState, positionSize, activeSessions, marketOpen, HZ } from './engine.js';
import { loadMarket, loadSpot } from './data.js';
import { buildEA, buildPine, mapSummary, makeMapImage, makeZip, EA_README, lastEAName, wib, num, hzLabel } from './exporters.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }

// ---------- state ----------
const S = {
  settings: store.get('kpx_settings', { balance: 1000, riskPct: 1, notif: false, remap: 60 }),
  market: null, map: store.get('kpx_map_active', null), spot: null, spotAt: 0,
  history: store.get('kpx_history', []), states: {}, source: '', planIdx: 0, projTab: 'chart',
};
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
async function fetchMarket() {
  const m = await loadMarket();
  S.market = m; S.source = m.source; S.spot = m.spot; S.spotAt = m.spotAt;
  store.set('kpx_market', { points: m.points.slice(-600), daily: [], spot: m.spot, spotAt: m.spotAt, source: m.source, state: m.state });
  return m;
}
function runMapping(m) {
  const r = analyze({ points: m.points, daily: m.daily, spot: m.spot, now: new Date() });
  r.sumber_harga = `${m.source}${m.state && m.state.status ? ' · ' + m.state.status : ''}`;
  S.map = r; S.states = {}; store.set('kpx_map_active', r);
  S.history.unshift({ time: r.basis.time, price: r.basis.price, bias: r.bias, conf: r.keyakinan, proyeksi: r.proyeksi.map(p => ({ m: p.menit, h: p.harga })), plans: r.rencana.map(p => `${p.tipe} ${num(p.entry_bawah)}–${num(p.entry_atas)}`) });
  S.history = S.history.slice(0, 60); store.set('kpx_history', S.history);
  return r;
}
async function refresh({ remap = false } = {}) {
  setNet('warn', 'Memperbarui…');
  try {
    const m = await fetchMarket();
    const age = S.map ? (Date.now() - Date.parse(S.map.basis.time)) / 60000 : Infinity;
    if (remap || !S.map || (S.settings.remap > 0 && age >= S.settings.remap)) runMapping(m);
    banner(m.state && m.state.status === 'stale' ? 'Data sumber sedang tertunda (stale). Pasar mungkin tutup atau sumber terlambat.' : '');
    setNet(marketOpen(new Date()) ? 'on' : 'warn', marketOpen(new Date()) ? 'Live' : 'Pasar tutup');
  } catch (e) {
    console.warn(e);
    try {
      const r = await (await fetch('data/latest.json', { cache: 'no-store' })).json();
      if (r && r.basis) { S.map = r; banner(`Sumber harga tidak terjangkau. Menampilkan mapping server GitHub (${wib(new Date(r.basis.time))} WIB).`); }
    } catch { banner(S.map ? 'Offline — menampilkan mapping terakhir yang tersimpan.' : 'Tidak bisa mengambil data pasar. Periksa koneksi internet lalu coba lagi.'); }
    if (!S.market) { const c = store.get('kpx_market', null); if (c) S.market = c; }
    setNet('off', 'Offline');
  }
  S.tried = true;
  renderAll();
}
async function spotTick() {
  if (document.hidden) return;
  try { const s = await loadSpot(); S.spot = s.price; S.spotAt = s.at; setNet(marketOpen(new Date()) ? 'on' : 'warn', marketOpen(new Date()) ? 'Live' : 'Pasar tutup'); checkStates(); renderHome(); renderPlanLive(); }
  catch { setNet('off', 'Offline'); }
}

// ---------- status live + notifikasi ----------
function checkStates() {
  if (!S.map || !Number.isFinite(S.spot)) return;
  const t0 = Date.parse(S.map.basis.time);
  S.map.rencana.forEach((pl, i) => {
    const st = planState(pl, S.spot, Date.now(), t0), prev = S.states[i];
    if (prev && prev !== st.kode && (st.kode === 'zone' || st.kode === 'sl')) notify(`${pl.tipe} ${pl.prioritas}`, st.teks);
    S.states[i] = st.kode;
  });
}
async function notify(title, body) {
  toast(`${title}: ${body}`);
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  if (!S.settings.notif || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { const reg = await navigator.serviceWorker?.ready; reg ? reg.showNotification('XAUUSD · ' + title, { body, icon: 'icons/icon-192.png', tag: 'kpx-' + title }) : new Notification('XAUUSD · ' + title, { body }); } catch {}
}

// ---------- grafik ----------
function chart(r, points, live, H = 230) {
  const W = 360, L = 6, R = 54, T = 10, B = 26, split = 0.3;
  const p0 = r.basis.price, t0 = Date.parse(r.basis.time) / 1000;
  const past = (points || []).filter(x => x.t >= t0 - 12 * 3600 && x.t <= t0);
  const fut = [{ m: 0, h: p0, lo: p0, hi: p0 }, ...r.proyeksi.map(p => ({ m: p.menit, h: p.harga, lo: p.bawah, hi: p.atas }))];
  const plans = r.rencana || [], lv = (r.level || []);
  let vals = [...past.map(x => x.p), ...fut.flatMap(f => [f.lo, f.hi])];
  plans.forEach(pl => vals.push(pl.entry_bawah, pl.entry_atas));
  if (live && Number.isFinite(live.price)) vals.push(live.price);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  lv.forEach(l => { if (l.harga > lo - (hi - lo) * .3 && l.harga < hi + (hi - lo) * .3) { lo = Math.min(lo, l.harga); hi = Math.max(hi, l.harga); } });
  const pad = (hi - lo) * .08 || 1; lo -= pad; hi += pad;
  const X0 = L + (W - L - R) * split, Y = v => T + (hi - v) * (H - T - B) / (hi - lo);
  const Xp = t => L + (t - (t0 - 12 * 3600)) / (12 * 3600) * (X0 - L);
  const Xf = i => X0 + i * (W - R - X0) / (fut.length - 1);
  const Xm = m => { for (let i = 1; i < fut.length; i++) if (m <= fut[i].m) return Xf(i - 1) + (m - fut[i - 1].m) / (fut[i].m - fut[i - 1].m) * (Xf(i) - Xf(i - 1)); return Xf(fut.length - 1); };
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" role="img" aria-label="Grafik proyeksi XAUUSD">`;
  plans.forEach(pl => { const a = Math.max(pl.entry_bawah, pl.entry_atas), b = Math.min(pl.entry_bawah, pl.entry_atas), c = pl.tipe === 'SELL' ? 'var(--red)' : 'var(--green)';
    const xe = Xm(Math.min(pl.berlaku_menit || 1440, 1440));
    s += `<rect x="${X0}" y="${Y(a)}" width="${xe - X0}" height="${Math.max(Y(b) - Y(a), 2)}" fill="${c}" opacity=".14"/><text x="${X0 + 3}" y="${Y(a) - 3}" font-size="8.5" fill="${c}" font-weight="600">${pl.tipe}</text>`; });
  lv.forEach(l => { if (l.harga < lo || l.harga > hi) return; const c = l.jenis === 'Resistance' ? 'var(--red)' : l.jenis === 'Support' ? 'var(--green)' : 'var(--muted)';
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(l.harga)}" y2="${Y(l.harga)}" stroke="${c}" stroke-dasharray="3 3" stroke-width=".8" opacity=".7"/><text x="${W - R + 3}" y="${Y(l.harga) + 3}" font-size="8.5" fill="${c}">${l.harga.toFixed(2)}</text>`; });
  s += `<polygon points="${fut.map((f, i) => `${Xf(i)},${Y(f.hi)}`).join(' ')} ${fut.map((f, i) => `${Xf(i)},${Y(f.lo)}`).reverse().join(' ')}" fill="var(--band)"/>`;
  if (past.length > 1) s += `<polyline points="${past.map(x => `${Xp(x.t).toFixed(1)},${Y(x.p).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--muted)" stroke-width="1.4"/>`;
  s += `<polyline points="${fut.map((f, i) => `${Xf(i)},${Y(f.h)}`).join(' ')}" fill="none" stroke="var(--text)" stroke-width="1.8" stroke-linejoin="round"/>`;
  s += `<line x1="${X0}" x2="${X0}" y1="${T}" y2="${H - B}" stroke="var(--gold)" stroke-dasharray="2 3"/>`;
  fut.forEach((f, i) => { s += `<circle cx="${Xf(i)}" cy="${Y(f.h)}" r="${i ? 2.2 : 3.5}" fill="${i ? 'var(--text)' : 'var(--gold)'}"/>`; });
  [[-12, '-12j'], [-6, '-6j']].forEach(([h, t]) => { s += `<text x="${Xp(t0 + h * 3600)}" y="${H - 9}" font-size="8.5" fill="var(--muted)" text-anchor="${h === -12 ? 'start' : 'middle'}">${t}</text>`; });
  fut.forEach((f, i) => { if (i === 0 || [60, 240, 720, 1440].includes(f.m)) s += `<text x="${Xf(i)}" y="${H - 9}" font-size="8.5" fill="${i ? 'var(--muted)' : 'var(--gold)'}" text-anchor="middle">${i ? '+' + (f.m / 60) + 'j' : 'Mapping'}</text>`; });
  s += `<text x="${W - R + 3}" y="${Y(p0) + 3}" font-size="8.5" fill="var(--gold)" font-weight="700">${p0.toFixed(2)}</text>`;
  if (live && Number.isFinite(live.price)) {
    const em = (live.at / 1000 - t0) / 60;
    if (em >= 0 && em <= 1440) { const x = Xm(em), y = Math.min(Math.max(Y(live.price), T), H - B);
      s += `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" stroke="var(--blue)" stroke-dasharray="2 3" stroke-width=".8"/><circle cx="${x}" cy="${y}" r="4.5" fill="var(--blue)" stroke="var(--panel)" stroke-width="2"/>`; }
  }
  return s + '</svg>';
}

// ---------- render: beranda ----------
function biasText(b) { return b === 'BULLISH' ? '▲ BULLISH' : b === 'BEARISH' ? '▼ BEARISH' : '— SIDEWAYS'; }
function biasCls(b) { return b === 'BULLISH' ? 'up' : b === 'BEARISH' ? 'dn' : 'gold'; }
function renderHome() {
  const r = S.map; const el = $('homeBody'); el.classList.remove('skel');
  if (!r) { el.innerHTML = S.tried ? `<div class="skel">Belum ada data. <button class="btn sm" onclick="kpx.refresh()">Coba lagi</button></div>` : `<div class="skel">Tim agent sedang mengumpulkan data pasar…</div>`; el.classList.add('skel'); return; }
  const p = Number.isFinite(S.spot) ? S.spot : r.basis.price, d = p - r.basis.price, t0 = Date.parse(r.basis.time);
  const sess = activeSessions(new Date()).map(x => x.nama);
  const main = r.rencana[0], st = main ? planState(main, p, Date.now(), t0) : null;
  const ev = (r.agents.find(a => a.id === 'calendar')?.data.events || []).filter(e => new Date(e.t) > new Date()).slice(0, 2);
  el.innerHTML = `
  <div class="card">
    <div class="row between"><span class="hint">XAUUSD · spot</span><span class="hint">${S.spotAt ? 'diperbarui ' + wib(new Date(S.spotAt)) + ' WIB' : ''}</span></div>
    <div class="row between" style="margin-top:4px"><div class="big">${p.toFixed(2)}</div><span class="pill ${biasCls(r.bias)}">${biasText(r.bias)}</span></div>
    <div class="row between" style="margin-top:2px"><span class="${d >= 0 ? 'up' : 'dn'}" style="font-size:13px;font-weight:600">${d >= 0 ? '+' : ''}${d.toFixed(2)} sejak mapping ${wib(new Date(t0))}</span><span class="hint">${marketOpen(new Date()) ? (sess.length ? 'Sesi ' + sess.join(' + ') : 'Antar sesi') : 'Pasar tutup'}</span></div>
    <div class="gauge"><i style="left:${((r.skor + 1) / 2 * 100).toFixed(1)}%"></i></div>
    <div class="row between hint"><span>Jual</span><span>Konsensus ${r.skor >= 0 ? '+' : ''}${r.skor.toFixed(2)} · keyakinan ${r.keyakinan}%</span><span>Beli</span></div>
  </div>
  <div class="card"><div style="font-size:14px">${esc(r.ringkasan)}</div>
    <div style="margin-top:12px">${chart(r, S.market?.points, { price: p, at: S.spotAt || Date.now() }, 200)}</div>
    <div class="hint" style="margin-top:4px">Abu-abu = harga 12 jam terakhir · hitam = proyeksi · titik biru = harga kini</div></div>
  ${main ? `<div class="sec">Rencana utama</div>
  <div class="card plan ${main.tipe}">
    <div class="row between"><b class="${main.tipe === 'SELL' ? 'dn' : 'up'}">${main.tipe} · ${esc(main.prioritas)}</b><span class="hint">RR 1:${main.rr}</span></div>
    <div class="grid3" style="margin-top:10px"><div>Entry<b>${num(main.entry_bawah)}–${num(main.entry_atas)}</b></div><div>Stop loss<b class="dn">${num(main.sl)}</b></div><div>TP1 / TP2<b class="up">${num(main.tp1)} / ${num(main.tp2)}</b></div></div>
    <div class="state ${st.kode}">${esc(st.teks)}</div>
  </div>` : `<div class="card hint">Belum ada rencana entry yang layak. Tim menyarankan menunggu.</div>`}
  ${ev.length ? `<div class="sec">Rilis data berikutnya</div><div class="card">${ev.map(e => `<div class="list-row"><span>${esc(e.nama)}</span><span class="hint">${wib(new Date(e.t))} WIB</span></div>`).join('')}<div class="hint" style="margin-top:6px">Perkiraan pola rutin — cek kalender ekonomi resmi.</div></div>` : ''}
  <div class="grid2" style="margin-top:4px"><button class="btn" onclick="kpx.remap()">Mapping baru</button><button class="btn ghost" onclick="kpx.shareImage()">Bagikan gambar</button></div>
  <div class="hint" style="text-align:center;margin-top:10px">Mapping ${wib(new Date(t0))} WIB · sumber ${esc(r.sumber_harga || S.source || '-')}</div>`;
}

// ---------- render: proyeksi ----------
function renderProj() {
  const r = S.map, el = $('projBody'); el.classList.remove('skel'); if (!r) return;
  const t0 = Date.parse(r.basis.time), at = m => wib(new Date(t0 + m * 60000)), p0 = r.basis.price;
  el.innerHTML = `
  <div class="card">${chart(r, S.market?.points, { price: S.spot, at: S.spotAt || Date.now() }, 260)}
    <div class="hint" style="margin-top:6px">Area emas = rentang kemungkinan · hijau/merah = zona entry · garis putus = level kunci</div></div>
  <div class="sec">Proyeksi per waktu</div>
  <div class="card" style="padding:6px 12px"><table><tr><th>Waktu</th><th>Proyeksi</th><th>Rentang</th></tr>
  ${r.proyeksi.map(p => { const d = p.harga - p0; return `<tr><td>+${hzLabel(p.menit)}<br><span class="hint">${at(p.menit)}</span></td><td class="${d >= 0 ? 'up' : 'dn'}"><b>${num(p.harga)}</b><br><small>${d >= 0 ? '+' : ''}${d.toFixed(2)}</small></td><td>${num(p.bawah)} – ${num(p.atas)}</td></tr>`; }).join('')}</table></div>
  <div class="sec">Jadwal aksi 24 jam</div>
  <div class="card" style="padding:6px 12px"><table>${r.jadwal.map(j => `<tr><td style="white-space:nowrap">${at(j.menit_mulai)}–${at(j.menit_akhir)}</td><td><span class="act ${j.aksi.split(' ')[0]}">${j.aksi}</span><br><span style="font-size:12.5px">${esc(j.detail)}</span></td></tr>`).join('')}</table></div>
  <div class="sec">Level kunci</div>
  <div class="card" style="padding:6px 12px"><table>${r.level.map(l => `<tr><td class="${l.jenis === 'Resistance' ? 'dn' : l.jenis === 'Support' ? 'up' : ''}">${l.jenis}</td><td><b>${num(l.harga)}</b></td><td class="hint">${esc(l.catatan)}</td></tr>`).join('')}</table></div>
  <div class="card"><b>Invalidasi:</b> ${esc(r.invalidasi)}<br><b>Peringatan:</b> ${esc(r.peringatan)}</div>`;
}

// ---------- render: tim agent ----------
function renderTeam() {
  const r = S.map, el = $('teamBody'); el.classList.remove('skel'); if (!r) return;
  const dir = new Set(['chief', 'trend', 'momentum', 'structure']);
  el.innerHTML = `<div class="hint" style="margin:0 2px 10px">${r.agents.length} agent bekerja otomatis di perangkat Anda. Ketuk agent untuk melihat alasannya.</div>` +
  r.agents.map(a => `<details class="card agent-card"><summary><div class="agent ${a.id === 'chief' ? 'chief' : ''}"><div class="av">${esc(a.nama[0])}</div><div>
    <div class="row between"><b>${esc(a.nama)}</b><span class="hint">${Math.round(a.keyakinan * 100)}% yakin</span></div>
    <div class="hint" style="margin-top:-2px">${esc(a.peran)}</div>
    <div style="font-size:13.5px;margin-top:6px">${esc(a.ringkasan)}</div>
    ${dir.has(a.id) ? `<div class="bar" style="margin-top:8px"><i style="left:${a.skor >= 0 ? 50 : 50 + a.skor * 50}%;width:${Math.abs(a.skor) * 50}%;background:${a.skor >= 0 ? 'var(--green)' : 'var(--red)'}"></i></div>` : ''}
  </div></div></summary><ul class="d">${a.detail.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('');
}

// ---------- render: rencana ----------
function renderPlan() {
  const r = S.map, el = $('planBody'); el.classList.remove('skel'); if (!r) return;
  const pls = r.rencana;
  el.innerHTML = (pls.length ? pls.map((pl, i) => `
  <div class="card plan ${pl.tipe}">
    <div class="row between"><b class="${pl.tipe === 'SELL' ? 'dn' : 'up'}">${pl.tipe} · ${esc(pl.prioritas)}</b><span class="hint">berlaku s/d ${wib(new Date(Date.parse(r.basis.time) + pl.berlaku_menit * 60000))} WIB</span></div>
    <div class="grid3" style="margin-top:10px"><div>Entry<b>${num(pl.entry_bawah)}–${num(pl.entry_atas)}</b></div><div>Stop loss<b class="dn">${num(pl.sl)}</b></div><div>TP1 / TP2<b class="up">${num(pl.tp1)} / ${num(pl.tp2)}</b></div></div>
    <div style="font-size:13px;margin-top:10px"><b>Alasan:</b> ${esc(pl.alasan)}<br><b>Konfirmasi:</b> ${esc(pl.trigger)}<br><b>Manajemen:</b> ${esc(pl.manajemen)}</div>
    <div class="state" id="pst${i}"></div>
  </div>`).join('') : `<div class="card hint">Belum ada rencana entry yang layak.</div>`) + `
  <div class="sec">Kalkulator lot</div>
  <div class="card">
    <div class="grid2"><div><label class="f">Modal (USD)</label><input type="number" id="cBal" value="${S.settings.balance}" inputmode="decimal"></div>
    <div><label class="f">Risiko per transaksi (%)</label><input type="number" id="cRisk" value="${S.settings.riskPct}" step="0.1" inputmode="decimal"></div></div>
    ${pls.length ? `<label class="f">Rencana</label><select id="cPlan">${pls.map((p, i) => `<option value="${i}">${p.tipe} ${esc(p.prioritas)}</option>`).join('')}</select>` : ''}
    <div id="cOut" style="margin-top:12px;font-size:14px"></div>
    <div class="hint" style="margin-top:6px">Asumsi 1 lot = 100 oz (standar broker umum). Cek spesifikasi kontrak broker Anda.</div>
  </div>
  <div class="sec">Ekspor & bagikan</div>
  <div class="card">
    <div class="grid2"><button class="btn" onclick="kpx.shareImage()">Gambar ringkasan</button><button class="btn ghost" onclick="kpx.shareText()">Teks ringkasan</button></div>
    <div class="grid2" style="margin-top:8px"><button class="btn ghost" onclick="kpx.downloadEA()">EA MT5 (.zip)</button><button class="btn ghost" onclick="kpx.copyPine()">Indikator Pine</button></div>
    <div class="hint" style="margin-top:8px">EA berlaku 24 jam sesuai mapping. Uji di akun demo dulu. Indikator Pine: tempel di Pine Editor TradingView.</div>
  </div>`;
  const calc = () => {
    S.settings.balance = +$('cBal').value || 0; S.settings.riskPct = +$('cRisk').value || 0; saveSettings();
    const pl = pls[+($('cPlan')?.value || 0)]; if (!pl) { $('cOut').textContent = ''; return; }
    const mid = (pl.entry_bawah + pl.entry_atas) / 2, ps = positionSize({ balance: S.settings.balance, riskPct: S.settings.riskPct, entry: mid, sl: pl.sl });
    $('cOut').innerHTML = ps ? `Lot disarankan: <b>${ps.lot.toFixed(2)}</b> · risiko $${ps.riskMoney} · jarak SL ${ps.dist}` : 'Isi modal dan risiko.';
  };
  ['cBal', 'cRisk', 'cPlan'].forEach(id => $(id) && ($(id).oninput = calc)); calc();
  renderPlanLive();
}
function renderPlanLive() {
  if (!S.map) return; const t0 = Date.parse(S.map.basis.time), p = Number.isFinite(S.spot) ? S.spot : S.map.basis.price;
  S.map.rencana.forEach((pl, i) => { const el = $('pst' + i); if (!el) return; const st = planState(pl, p, Date.now(), t0); el.className = 'state ' + st.kode; el.textContent = `${p.toFixed(2)} · ${st.teks}`; });
}

// ---------- render: lainnya ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderMore(); });
function accuracy() {
  const pts = S.market?.points || []; if (!pts.length) return null;
  let hit = 0, n = 0;
  for (const h of S.history) {
    const t0 = Date.parse(h.time) / 1000;
    for (const pr of h.proyeksi.filter(x => [60, 240].includes(x.m))) {
      const target = t0 + pr.m * 60, near = pts.reduce((b, x) => Math.abs(x.t - target) < Math.abs(b.t - target) ? x : b, pts[0]);
      if (Math.abs(near.t - target) > 600 || target > Date.now() / 1000) continue;
      const pd = Math.sign(pr.h - h.price), ad = Math.sign(near.p - h.price); if (!pd || !ad) continue;
      n++; if (pd === ad) hit++;
    }
  }
  return n ? { pct: Math.round(hit / n * 100), n } : null;
}
function renderMore() {
  const acc = accuracy(), isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches;
  $('moreBody').innerHTML = `
  <div class="sec" style="margin-top:4px">Pengaturan</div>
  <div class="card">
    <div class="switch"><span>Notifikasi zona entry & SL</span><input type="checkbox" id="sNotif" ${S.settings.notif ? 'checked' : ''}></div>
    <div class="switch"><span>Mapping otomatis tiap</span><select id="sRemap" style="width:auto"><option value="30">30 menit</option><option value="60">1 jam</option><option value="240">4 jam</option><option value="0">Manual</option></select></div>
    <div class="hint" style="margin-top:6px">Harga diperbarui tiap ±1 menit selama aplikasi terbuka. Notifikasi muncul saat aplikasi terbuka atau di latar belakang singkat.</div>
  </div>
  ${standalone ? '' : `<div class="sec">Install ke HP</div><div class="card">
    ${installEvt ? `<button class="btn" id="bInstall">Install aplikasi</button>` : isIOS ? `<div style="font-size:14px">Di Safari: ketuk tombol <b>Bagikan</b> lalu <b>Tambahkan ke Layar Utama</b>.</div>` : `<div style="font-size:14px">Buka menu browser (⋮) lalu pilih <b>Install aplikasi</b> / <b>Tambahkan ke layar utama</b>.</div>`}
  </div>`}
  <div class="sec">Riwayat mapping</div>
  <div class="card">${acc ? `<div style="font-size:14px;margin-bottom:6px">Ketepatan arah proyeksi 1–4 jam: <b>${acc.pct}%</b> <span class="hint">(${acc.n} sampel)</span></div>` : ''}
    ${S.history.length ? S.history.slice(0, 12).map(h => `<div class="list-row"><span>${new Date(h.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' })}</span><span class="${biasCls(h.bias)}">${h.bias}</span><span class="hint">${num(h.price)} · ${h.conf}%</span></div>`).join('') : '<div class="hint">Belum ada riwayat.</div>'}
  </div>
  <div class="sec">Sumber data</div>
  <div class="card"><div class="list-row"><span>Harga XAU/USD</span><span class="hint">${esc(S.source || 'xaus.com')}</span></div>
    <div class="list-row"><span>Titik intraday</span><span class="hint">${S.market?.points?.length || 0} (tiap 5 menit)</span></div>
    <div class="list-row"><span>Mesin analisis</span><span class="hint">v${esc(S.map?.engine || '-')} · di perangkat</span></div>
    <div class="hint" style="margin-top:6px">Harga indikatif mid-market, bukan kuotasi broker. Selalu cocokkan dengan harga MT5 Anda.</div></div>
  <div class="sec">Tentang</div>
  <div class="card" style="font-size:13.5px">Kantor Pine XAUUSD adalah tim agent analisis kuantitatif yang berjalan sepenuhnya di perangkat Anda, tanpa akun dan tanpa API key. Kode sumber dikelola di GitHub.<br><br><b>Disclaimer:</b> semua proyeksi adalah skenario probabilitas, bukan kepastian dan bukan nasihat keuangan. Trading emas berisiko tinggi; gunakan stop loss dan uji di akun demo.</div>`;
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
  refresh: () => refresh(),
  remap: async () => { await refresh({ remap: true }); toast('Mapping baru selesai'); },
  async shareImage() { if (!S.map) return; toast('Membuat gambar…'); const b = await makeMapImage(S.map); await shareFile(b, `mapping-xauusd-${Date.now()}.png`, 'Mapping XAUUSD'); },
  async shareText() { if (!S.map) return; const t = mapSummary(S.map); if (navigator.share) { try { await navigator.share({ text: t }); return; } catch (e) { if (e.name === 'AbortError') return; } } try { await navigator.clipboard.writeText(t); toast('Ringkasan disalin'); } catch { toast('Tidak bisa menyalin'); } },
  downloadEA() { if (!S.map) return; const code = buildEA(S.map); if (!code) return toast('Rencana belum lengkap untuk EA'); const name = lastEAName; downloadBlob(makeZip([{ name, text: code }, { name: 'CARA_PASANG.txt', text: EA_README }]), name.replace('.mq5', '.zip')); },
  async copyPine() { if (!S.map) return; const p = buildPine(S.map); try { await navigator.clipboard.writeText(p.code); toast('Kode Pine disalin — tempel di Pine Editor'); } catch { downloadBlob(new Blob([p.code], { type: 'text/plain' }), p.name); } },
});

function renderAll() { renderHome(); renderProj(); renderTeam(); renderPlan(); renderMore(); checkStates(); }

// ---------- mulai ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
renderAll();
refresh();
setInterval(spotTick, 60000);
setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) spotTick(); });
