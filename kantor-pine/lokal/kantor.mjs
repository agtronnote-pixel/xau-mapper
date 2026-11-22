// =====================================================================
//  Kantor Pine — Kantor LOKAL (real-time) untuk MT5
//  Jalan terus di PC: tiap 1-5 detik mengambil harga live, menjalankan tim agent
//  (mesin yang sama dengan aplikasi & server), lalu menulis sinyal ke
//  MQL5\Files\KPX\<ASET>.sig. EA KPX_Bot membaca file itu tiap 0,25 detik dan
//  langsung eksekusi — tanpa compile, tanpa menunggu jadwal server.
//  Server GitHub tetap mengerjakan yang berat (kalibrasi harian, berita, candle H1/M15).
//  Konfigurasi: KPX_Tools\KPX_Agent.config (baris 1 alamat aplikasi, baris 2 daftar aset).
// =====================================================================
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, appendFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));            // ...\KPX_Tools\kantor\lokal
const ROOT = join(HERE, '..');                                     // ...\KPX_Tools\kantor
const TOOLS = join(ROOT, '..');                                    // ...\MQL5\Experts\KPX_Tools
const EXPERTS = join(TOOLS, '..');
const OUT = join(EXPERTS, '..', 'Files', 'KPX');                   // ...\MQL5\Files\KPX
const LOG = join(EXPERTS, 'KPX_Kantor_status.txt');
const CODE = ['lokal/kantor.mjs', 'app/engine.js', 'app/data.js', 'app/exporters.js'];   // diperbarui otomatis
mkdirSync(OUT, { recursive: true });

const log = m => { const s = `${new Date().toISOString().replace('T', ' ').slice(0, 19)}  ${m}`; console.log(s); try { if (existsSync(LOG) && statSync(LOG).size > 2e6) writeFileSync(LOG, ''); appendFileSync(LOG, s + '\n'); } catch {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = s => createHash('sha1').update(s).digest('hex').slice(0, 12);

function readConfig() {
  const c = readFileSync(join(TOOLS, 'KPX_Agent.config'), 'utf8').split(/\r?\n/);
  let app = c[0].trim().replace(/\/+$/, ''); if (!/kantor-pine\/app$/.test(app)) app += '/kantor-pine/app';
  const aset = (c[1] || '').split(',').map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9]+$/.test(s));
  return { app, site: app.replace(/\/kantor-pine\/app$/, ''), aset: aset.length ? aset : ['XAUUSD'] };
}
let C = readConfig();
const bust = u => u + (u.includes('?') ? '&' : '?') + 't=' + Date.now();          // lewati cache GitHub Pages
const fNoCache = (u, o) => fetch(bust(u), { ...o, signal: AbortSignal.timeout(15000) });
const fLive = (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(8000) });

// ---------- mesin: dimuat dari salinan lokal, diperbarui otomatis dari server ----------
let E = null;
async function loadEngine() {
  const v = hash(CODE.map(p => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } }).join(''));
  const imp = p => import(pathToFileURL(join(ROOT, p)).href + '?v=' + v);
  const [eng, dat, exp] = await Promise.all([imp('app/engine.js'), imp('app/data.js'), imp('app/exporters.js')]);
  E = { analyze: eng.analyze, PROVIDERS: dat.PROVIDERS, expandMarket: dat.expandMarket, SERVER_FILES: dat.SERVER_FILES, eaPlans: exp.eaPlans, version: eng.ENGINE_VERSION || '' };
}
async function selfUpdate() {
  let changed = [];
  for (const p of CODE) {
    try {
      const r = await fNoCache(`${C.site}/kantor-pine/${p}`); if (!r.ok) continue;
      const body = await r.text(); if (body.length < 200) continue;
      const f = join(ROOT, p); let old = ''; try { old = readFileSync(f, 'utf8'); } catch {}
      if (body !== old) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, body); changed.push(p); }
    } catch {}
  }
  // EA KPX_Bot ikut diperbarui; KPX_AutoCompile meng-compile, MT5 memuat ulang sendiri
  try {
    const r = await fNoCache(`${C.site}/kantor-pine/mt5/KPX_Bot.mq5`);
    if (r.ok) { const body = await r.text(), f = join(EXPERTS, 'KPX_Bot.mq5'); let old = ''; try { old = readFileSync(f, 'utf8'); } catch {}
      if (body.includes('OnTick') && body !== old) { writeFileSync(f, body); log('EA KPX_Bot diperbarui'); } }
  } catch {}
  if (changed.length) { log('Kode Kantor diperbarui: ' + changed.join(', ') + ' — mulai ulang'); process.exit(0); }   // peluncur menjalankan ulang
}

// ---------- data per aset ----------
let ASET = null;        // data/aset.json (provider live tiap aset)
const KNOWN = { USA100: { provider: 'server' }, SNP500: { provider: 'server' }, GBPUSD: { provider: 'kraken', symbol: 'GBPUSD' }, XMRUSD: { provider: 'htx', symbol: 'xmrusdt' } };
function cfg(id) {
  if (id === 'XAUUSD') return { provider: 'xaus', base: `${C.app}/data/`, every: 15000 };
  const live = (ASET?.daftar || []).find(a => a.id === id)?.live || KNOWN[id] || {};
  const provider = live.provider || 'binance';
  return { provider, symbol: live.symbol || id.replace(/USD$/, 'USDT'), fallback: id === 'XMRUSD' ? 'XMRUSD' : undefined, base: `${C.app}/data/aset/${id}/`,
    every: { binance: 1000, htx: 2000, kraken: 3000, server: 60000 }[provider] ?? 5000 };
}
async function loadServer(base) {
  const out = {};
  await Promise.all(Object.entries(E.SERVER_FILES).map(async ([k, n]) => { try { const r = await fNoCache(base + n); out[k] = r.ok ? await r.json() : null; } catch { out[k] = null; } }));
  out.market = E.expandMarket(out.market);
  return out;
}
async function spotOf(c) {
  const P = E.PROVIDERS[c.provider];
  try { return (await P.spot(fLive, c.symbol)).price; }
  catch (e) { if (c.fallback) return (await E.PROVIDERS.kraken.spot(fLive, c.fallback)).price; throw e; }
}
async function intraOf(c) {
  const P = E.PROVIDERS[c.provider];
  try { return (c.provider === 'xaus' ? await P.intraday(fLive, 48) : await P.intraday(fLive, c.symbol)).points; }
  catch (e) { if (c.fallback) return (await E.PROVIDERS.kraken.intraday(fLive, c.fallback)).points; throw e; }
}

// ---------- tulis sinyal untuk EA ----------
const num = (v, d) => (+v).toFixed(d);
function signalText(id, r, spot, live) {
  const d = Number.isInteger(r.aset?.digit) ? r.aset.digit : 2, now = Math.floor(Date.now() / 1000), t0 = Date.parse(r.basis.time) / 1000;
  const kelas = r.aset?.kelas || (id === 'XAUUSD' ? 'emas' : 'kripto'), atr = +r.statistik?.atrH1 || 0;
  const L = ['KPX1', `t=${now}`, `aset=${id}`, `kelas=${kelas}`, `digit=${d}`, `ref=${num(spot, d)}`, `reft=${live ? now : Math.floor(Date.parse(r.basis.data_time || r.basis.time) / 1000)}`, `atr=${num(atr, d)}`,
    `edge=${r.keunggulan && r.keunggulan.ada === false ? 0 : 1}`, `mode=${r.mode}`, `aksi=${r.narasi?.aksi || ''}`];
  for (const p of E.eaPlans(r)) {
    const lo = Math.min(+p.entry_bawah, +p.entry_atas), hi = Math.max(+p.entry_bawah, +p.entry_atas);
    const exp = now + 60 * (Number.isFinite(+p.berlaku_menit) ? Math.min(+p.berlaku_menit, 1440) : 1440);
    const pel = p.peluang != null && p.peluang_sampel >= 30 ? Math.round(+p.peluang * 100) : -1;
    const pid = `${p.tipe[0]}${num(lo, d)}`;   // identitas sinyal: arah + batas zona — zona sama = sinyal sama
    L.push(`plan=${p.tipe === 'BUY' ? 0 : 1};${num(lo, d)};${num(hi, d)};${num(p.sl, d)};${num(p.tp1, d)};${num(p.tp2, d)};${exp};${String(p.tipe + ' ' + (p.prioritas || '')).replace(/[;\r\n]/g, ' ').trim()};${Math.round(+p.kekuatan || 50)};${pel};${pid}`);
  }
  for (const j of r.jadwal || []) if (/^NO/i.test(String(j.aksi || '')) && +j.menit_akhir > +j.menit_mulai) L.push(`nt=${Math.round(t0 + 60 * j.menit_mulai)};${Math.round(t0 + 60 * j.menit_akhir)}`);
  return L.join('\r\n') + '\r\n';
}
function writeAtomic(f, text) {
  const tmp = f + '.tmp'; writeFileSync(tmp, text, 'latin1');
  for (let i = 0; i < 5; i++) { try { renameSync(tmp, f); return true; } catch { /* EA sedang membaca, coba lagi */ } }
  return false;
}

// ---------- loop per aset ----------
const state = {};
async function runAsset(id) {
  const s = state[id] = { srv: null, srvAt: 0, pts: [], ptsAt: 0, lastSig: '', fails: 0, n: 0 };
  while (C.aset.includes(id)) {
    const c = cfg(id), t = Date.now();
    try {
      if (!s.srv || t - s.srvAt > 5 * 60e3) { const v = await loadServer(c.base); if (v.market?.h1?.length) { s.srv = v; s.srvAt = t; } }
      if (!s.srv) throw new Error('data server belum ada');
      let spot = null;
      if (c.provider !== 'server') {
        if (t - s.ptsAt > 60e3) { try { s.pts = await intraOf(c); s.ptsAt = t; } catch {} }
        spot = await spotOf(c);
      }
      const mk = s.srv.market, now = new Date();
      const points = spot != null ? [...s.pts.filter(p => p.t < now / 1000 - 30), { t: Math.floor(now / 1000), p: spot }] : s.pts;
      const r = E.analyze({ points, spot: spot ?? undefined, daily: mk.daily, h1: mk.h1, m15: mk.m15, macro: mk.macro, calendar: mk.calendar,
        news: s.srv.news, claude: id === 'XAUUSD' ? s.srv.claude : null, calib: s.srv.calib, kinerja: s.srv.kinerja, profil: mk.profil || undefined, now });
      const px = spot ?? r.basis.price;
      const txt = signalText(id, r, spot != null ? spot : (r.basis.data_price ?? r.basis.price), spot != null);
      writeAtomic(join(OUT, `${id}.sig`), txt);   // ditulis tiap putaran: stempel t= = bukti Kantor hidup
      const core = txt.split('\r\n').filter(l => /^(plan|aksi|edge)=/.test(l)).join('|');
      if (core !== s.lastSig) { log(`[${id}] ${r.narasi?.aksi} harga ${px} — ${E.eaPlans(r).map(p => `${p.tipe} ${p.entry_bawah}-${p.entry_atas} k${p.kekuatan}`).join(' | ') || 'tanpa rencana'}`); s.lastSig = core; }
      s.fails = 0; s.n++;
    } catch (e) {
      if (++s.fails === 1 || s.fails % 30 === 0) log(`[${id}] gagal (${s.fails}x): ${e.message}`);
    }
    await sleep(Math.max(250, c.every - (Date.now() - t)) * (s.fails > 5 ? 3 : 1));
  }
}

// ---------- utama ----------
const lock = join(OUT, 'kantor.lock');
// satu Kantor per MT5: salinan kedua menunggu sebagai cadangan sampai yang aktif berhenti
for (;;) { let busy = false; try { const l = JSON.parse(readFileSync(lock, 'utf8')); busy = Date.now() - l.t < 20e3 && l.pid !== process.pid; } catch {} if (!busy) break; await sleep(10e3); }
setInterval(() => { try { writeFileSync(lock, JSON.stringify({ pid: process.pid, t: Date.now() })); } catch {} }, 5000);
writeFileSync(lock, JSON.stringify({ pid: process.pid, t: Date.now() }));

await selfUpdate();
await loadEngine();
try { ASET = await (await fNoCache(`${C.app}/data/aset.json`)).json(); } catch {}
log(`Kantor lokal aktif — aset: ${C.aset.join(', ')} — sinyal ke ${OUT}`);
const running = new Set();
const startAll = () => { for (const id of C.aset) if (!running.has(id)) { running.add(id); runAsset(id).finally(() => running.delete(id)); } };
startAll();
setInterval(() => { try { const n = readConfig(); if (n.aset.join() !== C.aset.join()) log('Daftar aset diperbarui: ' + n.aset.join(', ')); C = n; startAll(); } catch {} }, 30e3);
setInterval(async () => { try { ASET = await (await fNoCache(`${C.app}/data/aset.json`)).json(); } catch {} }, 30 * 60e3);
setInterval(selfUpdate, 10 * 60e3);
