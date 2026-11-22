// =====================================================================
//  Kantor Pine XAUUSD — Mesin Analisis Multi-Agent (v3)
//  Murni JavaScript, tanpa dependensi, tanpa API key.
//  Berjalan di browser (aplikasi PWA) dan di Node (GitHub Actions).
//
//  Masukan data (semua opsional kecuali salah satu sumber harga):
//   points  : titik harga spot tiap 5 menit {t detik, p} (live, xaus.com)
//   h1, m15 : candle OHLC asli {t detik awal candle, o,h,l,c} dari server (sudah basis spot)
//   daily   : candle harian {d, c, h, l} (untuk trend harian)
//   macro   : {dxy:[{d,c}], ry:[{d,v}]}  (DXY & yield riil 10 tahun)
//   calendar: [{t ISO, nama, dampak:'tinggi'|'sedang'}]
//   news    : hasil agent Kabar (berita.json), claude: analisis-claude.json
//   calib   : kalibrasi.json hasil backtest (bobot, peluang, rentang proyeksi)
// =====================================================================

export const ENGINE_VERSION = '3.1.0';
export const HZ = [5, 15, 30, 60, 120, 240, 480, 720, 1440];

// ---------- util ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const last = a => a[a.length - 1];
const round2 = v => Math.round(v * 100) / 100;
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
export const fmtWIB = d => new Date(d).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB';
// ---------- profil instrumen ----------
// Emas: tutup akhir pekan, harian broker 17:00 NY. Kripto: buka 24/7, harian 00:00 UTC.
export const GOLD = { id: 'XAUUSD', nama: 'Emas', kelas: 'emas', jam: 'emas', digit: 2, langkah: 25, kontrak: 100, harianUTC: false };
const nice = v => { const m = 10 ** Math.floor(Math.log10(v)), r = v / m; return (r >= 5 ? 5 : r >= 2.5 ? 2.5 : r >= 2 ? 2 : 1) * m; };
export function cryptoProfile(id, nama, harga) {
  const digit = harga >= 100 ? 2 : harga >= 10 ? 3 : harga >= 1 ? 4 : harga >= 0.1 ? 5 : 6;
  return { id, nama, kelas: 'kripto', jam: '24/7', digit, langkah: +nice(harga * 0.01).toPrecision(2), kontrak: 1, harianUTC: true };
}
let P = GOLD;   // profil aktif selama satu panggilan analyze (sinkron)
const rp = v => { const f = 10 ** P.digit; return Math.round(v * f) / f; };
const jamWIB = d => new Date(d).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

// ---------- indikator ----------
export function ema(values, n) {
  const out = []; const k = 2 / (n + 1); let prev;
  values.forEach((v, i) => { prev = i === 0 ? v : v * k + prev * (1 - k); out.push(prev); });
  return out;
}
export function rsi(closes, n = 14) {
  if (closes.length < n + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; d > 0 ? g += d : l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
export function atr(candles, n = 14) {
  if (candles.length < 2) return null;
  const tr = candles.slice(1).map((c, i) => Math.max(c.h - c.l, Math.abs(c.h - candles[i].c), Math.abs(c.l - candles[i].c)));
  return mean(tr.slice(-n));
}
export function macd(closes, f = 12, s = 26, sig = 9) {
  if (closes.length < s + sig) return null;
  const a = ema(closes, f), b = ema(closes, s), m = a.map((x, i) => x - b[i]), sg = ema(m, sig);
  return { macd: last(m), signal: last(sg), hist: last(m) - last(sg), histPrev: m[m.length - 2] - sg[sg.length - 2] };
}
export function bollinger(closes, n = 20, k = 2) {
  if (closes.length < n) return null;
  const w = closes.slice(-n), m = mean(w), sd = std(w);
  return { mid: m, up: m + k * sd, lo: m - k * sd, width: (4 * sd) / m };
}
export function slope(values, n = 20) {
  const w = values.slice(-n); const N = w.length; if (N < 3) return 0;
  const xm = (N - 1) / 2, ym = mean(w); let num = 0, den = 0;
  w.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; });
  return num / den;
}
// Agregasi titik harga {t (detik), p} menjadi candle OHLC berdurasi `minutes`.
export function aggregate(points, minutes) {
  const size = minutes * 60, out = [];
  for (const pt of points) {
    const b = Math.floor(pt.t / size) * size; const c = last(out);
    if (!c || c.t !== b) out.push({ t: b, o: pt.p, h: pt.p, l: pt.p, c: pt.p, n: 1 });
    else { c.h = Math.max(c.h, pt.p); c.l = Math.min(c.l, pt.p); c.c = pt.p; c.n++; }
  }
  return out;
}
// Gabung candle server (OHLC asli) dengan candle dari titik live. Untuk waktu yang sama,
// candle live hanya memperluas high/low dan memperbarui close (open & wick asli dipertahankan).
export function mergeCandles(server, live) {
  const m = new Map();
  (server || []).forEach(c => { if ([c.t, c.o, c.h, c.l, c.c].every(Number.isFinite)) m.set(c.t, { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c }); });
  (live || []).forEach(c => {
    const s = m.get(c.t);
    if (s) { s.h = Math.max(s.h, c.h); s.l = Math.min(s.l, c.l); s.c = c.c; }
    else m.set(c.t, { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c });
  });
  return [...m.values()].sort((a, b) => a.t - b.t);
}
export function swings(candles, k = 2) {
  const highs = [], lows = [];
  for (let i = k; i < candles.length - k; i++) {
    const w = candles.slice(i - k, i + k + 1);
    if (candles[i].h === Math.max(...w.map(c => c.h))) highs.push({ i, p: candles[i].h, t: candles[i].t });
    if (candles[i].l === Math.min(...w.map(c => c.l))) lows.push({ i, p: candles[i].l, t: candles[i].t });
  }
  return { highs, lows };
}

// ---------- sesi pasar (jam lokal bursa, otomatis mengikuti DST) ----------
const SESSIONS = [
  { id: 'asia', nama: 'Asia', tz: 'Asia/Tokyo', h1: 9, h2: 18, vol: 0.7 },
  { id: 'london', nama: 'London', tz: 'Europe/London', h1: 8, h2: 17, vol: 1.15 },
  { id: 'ny', nama: 'New York', tz: 'America/New_York', h1: 8, h2: 17, vol: 1.3 },
];
const fmtCache = new Map();
function fmt(tz) {
  if (!fmtCache.has(tz)) fmtCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', weekday: 'short', day: 'numeric', hourCycle: 'h23' }));
  return fmtCache.get(tz);
}
function localParts(date, tz) {
  const p = fmt(tz).formatToParts(date);
  const g = t => (p.find(x => x.type === t) || {}).value;
  return { h: +g('hour'), m: +g('minute'), wd: g('weekday'), d: +g('day') };
}
// Emas spot tutup dari Jumat 17:00 sampai Minggu 18:00 waktu New York.
export function marketOpen(date, prof = GOLD) {
  if (prof.jam === '24/7') return true;
  const { h, wd } = localParts(date, 'America/New_York');
  if (wd === 'Sat') return false;
  if (wd === 'Fri' && h >= 17) return false;
  if (wd === 'Sun' && h < 18) return false;
  return true;
}
const WEEKEND = { id: 'weekend', nama: 'Akhir pekan', vol: 0.6 };
export function activeSessions(date, prof = GOLD) {
  if (!marketOpen(date, prof)) return [];
  if (prof.jam === '24/7' && !marketOpen(date, GOLD)) return [WEEKEND];   // kripto akhir pekan: likuiditas tipis
  return SESSIONS.filter(s => { const { h } = localParts(date, s.tz); return h >= s.h1 && h < s.h2; });
}
export function sessionOf(date, prof = GOLD) {
  const a = activeSessions(date, prof).map(s => s.id);
  if (a.includes('weekend')) return 'akhir-pekan';
  if (!a.length) return marketOpen(date, prof) ? 'sepi' : 'tutup';
  if (a.includes('london') && a.includes('ny')) return 'overlap';
  return a.includes('ny') ? 'ny' : a.includes('london') ? 'london' : 'asia';
}
// Waktu buka pasar berikutnya (resolusi 1 menit). Bila pasar sedang buka, kembalikan `date`.
export function nextOpen(date, prof = GOLD) {
  if (marketOpen(date, prof)) return date;
  let t = Math.ceil(date.getTime() / 60000) * 60000;
  for (let i = 0; i < 4 * 24 * 60; i++, t += 60000) if (marketOpen(new Date(t), prof)) return new Date(t);
  return date;
}
export function volFactor(date, prof = GOLD) {
  const a = activeSessions(date, prof);
  if (!marketOpen(date, prof)) return 0;
  if (!a.length) return 0.55;
  const f = Math.max(...a.map(s => s.vol));
  return a.length > 1 ? f + 0.25 : f;
}
export { SESSIONS };
// pembungkus dengan profil aktif (dipakai di dalam mesin)
const isOpen = d => marketOpen(d, P), sessNow = d => activeSessions(d, P), sessOf = d => sessionOf(d, P), vf = d => volFactor(d, P), nOpen = d => nextOpen(d, P);
const dayKeyOf = t => P.harianUTC ? new Date(t * 1000).toISOString().slice(0, 10) : nyDayKey(t);

// ---------- candle harian versi broker (berganti 17:00 New York) ----------
const nyKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const nyKeyCache = new Map();
export function nyDayKey(tSec) {
  const h = Math.floor(tSec / 3600);
  if (!nyKeyCache.has(h)) { nyKeyCache.set(h, nyKeyFmt.format(new Date((h * 3600 + 7 * 3600) * 1000))); if (nyKeyCache.size > 50000) nyKeyCache.clear(); }
  return nyKeyCache.get(h);
}
export function nyDaily(h1, keyFn = nyDayKey) {
  const out = [];
  for (const c of h1) {
    const k = keyFn(c.t), d = last(out);
    if (!d || d.d !== k) out.push({ d: k, o: c.o, h: c.h, l: c.l, c: c.c, n: 1 });
    else { d.h = Math.max(d.h, c.h); d.l = Math.min(d.l, c.l); d.c = c.c; d.n++; }
  }
  return out;
}

// ---------- kalender: rilis rutin AS (cadangan bila kalender asli tidak tersedia) ----------
export function routineEvents(from, hours = 24) {
  const out = [];
  for (let m = 0; m <= hours * 60; m += 30) {
    const d = new Date(from.getTime() + m * 60000);
    const ny = localParts(d, 'America/New_York');
    if (ny.m !== 30 || ny.h !== 8) continue;
    if (ny.wd === 'Thu') out.push({ t: d, nama: 'Klaim Pengangguran AS (mingguan)', dampak: 'sedang', perkiraan: true });
    if (ny.wd === 'Fri' && ny.d <= 7) out.push({ t: d, nama: 'Non-Farm Payrolls (NFP)', dampak: 'tinggi', perkiraan: true });
  }
  return out;
}
function eventsAhead(ctx, from, hours = 24) {
  const t0 = from.getTime(), t1 = t0 + hours * 3600e3;
  const cal = (ctx.calendar || []).map(e => ({ ...e, t: new Date(e.t) })).filter(e => Number.isFinite(e.t.getTime()));
  const covered = cal.length && cal.some(e => e.t.getTime() >= t1 - 7 * 86400e3) && cal.some(e => e.t.getTime() <= t0 + 86400e3);
  const src = covered ? cal : routineEvents(from, hours);
  return { list: src.filter(e => e.t.getTime() >= t0 - 45 * 60e3 && e.t.getTime() <= t1).sort((a, b) => a.t - b.t), asli: !!covered };
}

// ---------- AGENTS ----------
// Agent arah mengembalikan skor -1..1 (+ = naik), keyakinan 0..1, dan `cukup`:
// agent yang datanya kurang dikeluarkan dari konsensus (bukan dihitung sebagai netral).
const kurang = (id, nama, peran, alasan) => ({ id, nama, peran, skor: 0, keyakinan: 0, cukup: false, ringkasan: `Data belum cukup — ${alasan}`, detail: [`Tidak ikut konsensus: ${alasan}`] });

function agentTrend(ctx) {
  const { h1, dailyCloses } = ctx;
  if (h1.length < 60) return kurang('trend', 'Arka', 'Analis Trend', `baru ${h1.length} candle H1 (butuh 60)`);
  const c = h1.map(x => x.c);
  const e20 = last(ema(c, 20)), e50 = last(ema(c, 50)), sl = slope(c, 24) / ctx.atrH;
  const de20 = dailyCloses.length > 20 ? last(ema(dailyCloses, 20)) : null, de50 = dailyCloses.length > 50 ? last(ema(dailyCloses, 50)) : null;
  let s = 0; const d = [];
  if (e20 > e50) { s += 0.35; d.push('EMA20 H1 di atas EMA50 (trend naik jangka pendek)'); } else { s -= 0.35; d.push('EMA20 H1 di bawah EMA50 (trend turun jangka pendek)'); }
  s += clamp(sl * 1.5, -0.35, 0.35); d.push(`Kemiringan harga 24 jam: ${sl >= 0 ? '+' : ''}${sl.toFixed(2)} ATR/jam`);
  if (de20 && de50) { if (de20 > de50) { s += 0.3; d.push('Trend harian naik (EMA20 > EMA50 D1)'); } else { s -= 0.3; d.push('Trend harian turun (EMA20 < EMA50 D1)'); } }
  s = clamp(s, -1, 1);
  return { id: 'trend', nama: 'Arka', peran: 'Analis Trend', skor: s, keyakinan: 0.5 + Math.abs(s) * 0.4, cukup: true,
    ringkasan: s > 0.25 ? 'Trend dominan NAIK' : s < -0.25 ? 'Trend dominan TURUN' : 'Trend datar / transisi', detail: d,
    alasan: s > 0.25 ? 'trend H1 & harian naik' : s < -0.25 ? 'trend H1 & harian turun' : 'trend belum jelas' };
}
function agentMomentum(ctx) {
  const c15 = ctx.m15.map(x => x.c), c60 = ctx.h1.map(x => x.c);
  const r15 = rsi(c15), r60 = rsi(c60), m = macd(c60); let s = 0; const d = [];
  if (r60 == null) return kurang('momentum', 'Mira', 'Analis Momentum', 'candle H1 kurang dari 15');
  s += clamp((r60 - 50) / 40, -0.45, 0.45); d.push(`RSI H1 ${r60.toFixed(1)}`);
  if (r15 != null) { s += clamp((r15 - 50) / 60, -0.25, 0.25); d.push(`RSI M15 ${r15.toFixed(1)}`); } else d.push('RSI M15 belum tersedia');
  if (m) { const up = m.hist > m.histPrev; s += m.hist > 0 ? 0.15 : -0.15; s += up ? 0.1 : -0.1; d.push(`MACD H1 histogram ${m.hist > 0 ? 'positif' : 'negatif'}, ${up ? 'menguat' : 'melemah'}`); }
  else d.push('MACD H1 belum tersedia (butuh 35 candle)');
  let catatan = '';
  if (r60 > 72) { catatan = 'Jenuh beli — rawan koreksi'; s -= 0.15; } else if (r60 < 28) { catatan = 'Jenuh jual — rawan pantulan'; s += 0.15; }
  if (catatan) d.push(catatan);
  s = clamp(s, -1, 1);
  const lengkap = r15 != null && !!m;
  return { id: 'momentum', nama: 'Mira', peran: 'Analis Momentum', skor: s, keyakinan: (0.45 + Math.abs(s) * 0.4) * (lengkap ? 1 : 0.7), cukup: true,
    ringkasan: catatan || (s > 0.2 ? 'Momentum beli menguat' : s < -0.2 ? 'Momentum jual menguat' : 'Momentum netral'), detail: d, data: { r15, r60 },
    alasan: s > 0.2 ? `momentum beli (RSI H1 ${r60.toFixed(0)})` : s < -0.2 ? `momentum jual (RSI H1 ${r60.toFixed(0)})` : 'momentum netral',
    hambatan: r60 > 72 ? { arah: 1, teks: `RSI H1 ${r60.toFixed(0)} jenuh beli — rawan koreksi` } : r60 < 28 ? { arah: -1, teks: `RSI H1 ${r60.toFixed(0)} jenuh jual — rawan pantulan` } : null };
}
function agentStructure(ctx) {
  const { highs, lows } = swings(ctx.h1, 2); const d = []; let s = 0; const p = ctx.price;
  if (highs.length < 2 || lows.length < 2) return kurang('structure', 'Sena', 'Analis Struktur (SMC)', `swing H1 belum terbentuk (${highs.length} high, ${lows.length} low)`);
  const hh = highs.slice(-2), ll = lows.slice(-2);
  const up = hh[1].p > hh[0].p && ll[1].p > ll[0].p, dn = hh[1].p < hh[0].p && ll[1].p < ll[0].p;
  if (up) { s += 0.45; d.push('Higher high & higher low (struktur naik)'); }
  else if (dn) { s -= 0.45; d.push('Lower high & lower low (struktur turun)'); }
  else d.push('Struktur campuran (range)');
  const lastH = last(highs), lastL = last(lows);
  if (p > lastH.p) { s += 0.35; d.push(`Break of Structure naik di atas ${lastH.p.toFixed(P.digit)}`); }
  if (p < lastL.p) { s -= 0.35; d.push(`Break of Structure turun di bawah ${lastL.p.toFixed(P.digit)}`); }
  d.push(`Swing high terakhir ${lastH.p.toFixed(P.digit)} · swing low terakhir ${lastL.p.toFixed(P.digit)}`);
  s = clamp(s, -1, 1);
  return { id: 'structure', nama: 'Sena', peran: 'Analis Struktur (SMC)', skor: s, keyakinan: 0.5 + Math.abs(s) * 0.35, cukup: true,
    ringkasan: s > 0.3 ? 'Struktur bullish' : s < -0.3 ? 'Struktur bearish' : 'Struktur range', detail: d, data: { highs: highs.slice(-3), lows: lows.slice(-3) },
    alasan: up ? 'struktur higher high/higher low' : dn ? 'struktur lower high/lower low' : 'struktur range' };
}
// Makro: dolar AS (DXY) dan yield riil 10 tahun AS — dua penggerak utama emas (korelasi negatif).
function agentMacro(ctx) {
  const mc = ctx.macro || {}, day = ctx.dayKey;
  const dxy = (mc.dxy || []).filter(x => Number.isFinite(x.c) && x.d < day).map(x => x.c);
  const ry = (mc.ry || []).filter(x => Number.isFinite(x.v) && x.d < day).map(x => x.v);
  if (dxy.length < 30 || ry.length < 30) return kurang('macro', 'Ravi', 'Analis Makro (DXY & Yield)', 'data DXY / yield riil belum tersedia');
  const ch = (a, n) => a.slice(n).map((v, i) => v - a[i]);
  const dx5 = (last(dxy) / dxy[dxy.length - 6] - 1) * 100, dxSd = std(ch(dxy.slice(-65), 5).map((v, i) => v / dxy.slice(-65)[i] * 100)) || 0.5;
  const ry5 = (last(ry) - ry[ry.length - 6]) * 100, rySd = std(ch(ry.slice(-65), 5)) * 100 || 8;
  const zd = dx5 / dxSd, zr = ry5 / rySd;
  const s = clamp(-0.55 * Math.tanh(zd / 1.5) - 0.45 * Math.tanh(zr / 1.5), -1, 1);
  const d = [`DXY ${last(dxy).toFixed(2)} (${dx5 >= 0 ? '+' : ''}${dx5.toFixed(2)}% dalam 5 hari)`, `Yield riil 10 thn ${last(ry).toFixed(2)}% (${ry5 >= 0 ? '+' : ''}${ry5.toFixed(0)} bp dalam 5 hari)`,
    'Dolar & yield riil naik biasanya menekan emas, dan sebaliknya.'];
  return { id: 'macro', nama: 'Ravi', peran: 'Analis Makro (DXY & Yield)', skor: s, keyakinan: 0.45 + Math.abs(s) * 0.3, cukup: true,
    ringkasan: s > 0.2 ? 'Dolar/yield melemah — mendukung emas' : s < -0.2 ? 'Dolar/yield menguat — menekan emas' : 'Makro netral', detail: d,
    data: { dxy: last(dxy), dx5, ry: last(ry), ry5 }, alasan: s > 0.2 ? 'dolar & yield riil melemah' : s < -0.2 ? 'dolar & yield riil menguat' : 'makro netral' };
}
const ageH = (iso, now) => (now - Date.parse(iso)) / 3600e3;
function agentNews(ctx) {
  const n = ctx.news;
  if (!n || !n.dibuat) return kurang('news', 'Kabar', 'Sentimen Berita (RSS)', 'berita belum dimuat');
  const age = ageH(n.dibuat, ctx.nowMs);
  if (age > 6 || age < -1) return kurang('news', 'Kabar', 'Sentimen Berita (RSS)', `berita terakhir ${Math.round(age)} jam lalu (maks 6 jam)`);
  if ((n.bermakna || 0) < 3) return kurang('news', 'Kabar', 'Sentimen Berita (RSS)', 'kurang dari 3 berita bermakna');
  const s = clamp(n.skor || 0, -1, 1);
  return { id: 'news', nama: 'Kabar', peran: 'Sentimen Berita (RSS)', skor: s, keyakinan: Math.min(0.6, 0.2 + n.bermakna * 0.04), cukup: true,
    ringkasan: `${n.label} · ${n.bermakna} berita bermakna`, detail: [...(n.berita || []).slice(0, 5).map(b => `${b.skor > 0 ? '▲' : b.skor < 0 ? '▼' : '•'} ${b.judul} (${b.sumber})`), 'Skor kata kunci dari judul berita (tanpa AI). Bobot kecil & belum terkalibrasi.'],
    alasan: s > 0.15 ? 'berita cenderung positif untuk emas' : s < -0.15 ? 'berita cenderung negatif untuk emas' : 'berita netral' };
}
function agentClaude(ctx) {
  const c = ctx.claude;
  if (!c || !c.dibuat) return kurang('claude', 'Clara', 'Analis Berita (Claude)', 'analisis belum tersedia');
  const age = ageH(c.dibuat, ctx.nowMs);
  if (age > 14 || age < -1) return kurang('claude', 'Clara', 'Analis Berita (Claude)', `analisis terakhir ${Math.round(age)} jam lalu (maks 14 jam)`);
  const s = clamp(+c.skor || 0, -1, 1);
  return { id: 'claude', nama: 'Clara', peran: 'Analis Berita (Claude)', skor: s, keyakinan: 0.65, cukup: true,
    ringkasan: `${c.sentimen} · ${c.ringkasan}`, detail: [...(c.poin || []), ...(c.risiko || []).map(r => '⚠ ' + r), 'Bobot kecil & belum terkalibrasi (riwayat belum cukup).'],
    alasan: s > 0.15 ? 'analisis berita Claude bullish' : s < -0.15 ? 'analisis berita Claude bearish' : 'analisis berita Claude netral' };
}
function agentVolatility(ctx) {
  const b = bollinger(ctx.h1.map(x => x.c)); const d = [];
  const ratio = ctx.atrH / (ctx.atrD / Math.sqrt(24));
  d.push(`ATR H1 ≈ ${ctx.atrH.toFixed(P.digit)} | ATR harian ≈ ${ctx.atrD.toFixed(P.digit)}`);
  let rezim = 'normal';
  if (b) { d.push(`Lebar Bollinger H1 ${(b.width * 100).toFixed(2)}%`); if (b.width < 0.004) rezim = 'squeeze'; }
  if (ratio > 1.4) rezim = 'ekspansi';
  const ringkas = rezim === 'squeeze' ? 'Volatilitas menyempit — siaga breakout' : rezim === 'ekspansi' ? 'Volatilitas tinggi — perlebar SL, kecilkan lot' : 'Volatilitas normal';
  return { id: 'volatility', nama: 'Vega', peran: 'Analis Volatilitas', skor: 0, keyakinan: rezim === 'ekspansi' ? 0.4 : 0.7, ringkasan: ringkas, detail: d,
    data: { rezim, rangeHarian: ctx.atrD, ratio } };
}
function agentSession(ctx) {
  const a = sessNow(ctx.now), open = isOpen(ctx.now), d = [];
  const names = a.map(s => s.nama);
  if (!open) d.push(`Pasar ${P.nama} TUTUP, buka lagi ${fmtWIB(ctx.anchor)}`);
  else if (P.jam === '24/7') d.push('Pasar buka 24 jam, 7 hari');
  else d.push(names.length ? `Sesi aktif: ${names.join(' + ')}` : 'Di antara sesi (likuiditas rendah)');
  const f = vf(ctx.now); d.push(`Faktor volatilitas sesi: ${f.toFixed(2)}×`);
  const ss = ctx.calib?.sesi; if (ss) Object.entries(ss).forEach(([k, v]) => v.n >= 10 && d.push(`Backtest sesi ${k}: TP1 duluan ${Math.round(v.peluang * 100)}% (${v.n} rencana)`));
  return { id: 'session', nama: 'Tara', peran: 'Analis Sesi', skor: 0, keyakinan: open ? (f >= 1 ? 0.8 : 0.55) : 0.2,
    ringkasan: !open ? 'Pasar tutup' : names.length ? `Sesi ${names.join(' + ')} berjalan` : 'Sesi sepi', detail: d, data: { open, names, factor: f } };
}
function agentCalendar(ctx) {
  const { list: ev, asli } = eventsAhead(ctx, ctx.now, 24), d = [];
  ev.forEach(e => d.push(`${jamWIB(e.t)} WIB · ${e.nama} (${e.dampak})`));
  if (!ev.length) d.push('Tidak ada rilis data AS penting dalam 24 jam ke depan');
  d.push(asli ? 'Sumber: kalender ekonomi ForexFactory (diperbarui tiap jam).' : 'Kalender asli belum tersedia — memakai perkiraan pola rutin. Cek kalender ekonomi resmi.');
  const high = ev.some(e => e.dampak === 'tinggi');
  return { id: 'calendar', nama: 'Nadi', peran: 'Kalender Ekonomi', skor: 0, keyakinan: high ? 0.4 : 0.75,
    ringkasan: high ? `Ada rilis berdampak tinggi: ${ev.filter(e => e.dampak === 'tinggi').map(e => `${e.nama} ${jamWIB(e.t)}`).slice(0, 2).join(', ')}` : ev.length ? 'Ada rilis data AS berdampak sedang' : 'Kalender relatif sepi',
    detail: d, data: { events: ev, asli } };
}

// Validator lama: arah harian model trend (dipertahankan untuk perbandingan).
export function validateDaily(dailyCloses) {
  if (dailyCloses.length < 80) return null;
  let hit = 0, n = 0;
  for (let i = 60; i < dailyCloses.length - 1; i++) {
    const w = dailyCloses.slice(0, i + 1);
    const e20 = last(ema(w, 20)), e50 = last(ema(w, 50)), r = rsi(w) ?? 50, sl = slope(w, 10);
    const score = (e20 > e50 ? 1 : -1) + (sl > 0 ? 1 : -1) + (r > 50 ? 0.5 : -0.5);
    const pred = score > 0 ? 1 : -1, real = Math.sign(dailyCloses[i + 1] - dailyCloses[i]);
    if (real === 0) continue; n++; if (pred === real) hit++;
  }
  return n ? { akurasi: hit / n, sampel: n } : null;
}
// Validator: melaporkan hasil backtest sistem ini sendiri + kinerja mapping live.
function agentValidator(ctx) {
  const c = ctx.calib, k = ctx.kinerja, d = [];
  if (c?.rencana) {
    const R = c.rencana, o = R.oos || R;
    d.push(`Backtest ${c.periode || ''}: ${R.tersentuh} rencana tersentuh, TP1 lebih dulu dari SL ${Math.round(R.winrate * 100)}%, rata-rata ${R.ekspektasi_R >= 0 ? '+' : ''}${R.ekspektasi_R.toFixed(2)}R per trade`);
    if (R.oos) d.push(`Uji di luar sampel (data yang tidak dipakai kalibrasi): TP1 duluan ${Math.round(o.winrate * 100)}% dari ${o.tersentuh}, ${o.ekspektasi_R >= 0 ? '+' : ''}${o.ekspektasi_R.toFixed(2)}R`);
    if (c.arah) d.push(`Ketepatan arah bias 4 jam: ${Math.round(c.arah.h4 * 100)}% (${c.arah.n} sampel)`);
  } else d.push('Kalibrasi backtest belum tersedia di perangkat ini.');
  if (k?.d30?.tersentuh) d.push(`Mapping live 30 hari: ${k.d30.tersentuh} rencana tersentuh, TP1 duluan ${Math.round(k.d30.winrate * 100)}%, ${k.d30.ekspektasi_R >= 0 ? '+' : ''}${k.d30.ekspektasi_R.toFixed(2)}R`);
  d.push('Di atas 50% TP1 duluan dengan RR ≥ 1 dan rata-rata R positif = sistem punya keunggulan.');
  const R = c?.rencana?.oos || c?.rencana, edge = R ? R.ekspektasi_R : null;
  return { id: 'validator', nama: 'Lukas', peran: 'Validator (Backtest & Live)', skor: 0, keyakinan: R ? clamp(0.5 + edge, 0.3, 0.85) : 0.4,
    ringkasan: R ? `Backtest: TP1 duluan ${Math.round(R.winrate * 100)}% · ${edge >= 0 ? '+' : ''}${edge.toFixed(2)}R/trade` : 'Belum tervalidasi', detail: d, data: { arah: c?.arah || null } };
}

// ---------- level kunci ----------
function keyLevels(ctx) {
  const L = [], p = ctx.price, tol = ctx.atrH * 0.25;
  const add = (harga, jenis, catatan) => { if (!Number.isFinite(harga)) return; if (L.some(x => Math.abs(x.harga - harga) < tol)) return; L.push({ harga: rp(harga), jenis, catatan }); };
  const pd = ctx.prevDay;
  if (pd) {
    const P = (pd.h + pd.l + pd.c) / 3;
    add(pd.h, 'Resistance', 'High kemarin (PDH)'); add(pd.l, 'Support', 'Low kemarin (PDL)');
    add(P, 'Pivot', 'Pivot harian'); add(2 * P - pd.l, 'Resistance', 'R1 harian'); add(2 * P - pd.h, 'Support', 'S1 harian');
  }
  const { highs, lows } = swings(ctx.h1, 2);
  highs.slice(-4).forEach(h => add(h.p, h.p > p ? 'Resistance' : 'Support', 'Swing high H1'));
  lows.slice(-4).forEach(l => add(l.p, l.p < p ? 'Support' : 'Resistance', 'Swing low H1'));
  const step = P.langkah; const r = Math.round(p / step) * step;
  [r - step, r, r + step].forEach(x => add(x, x > p ? 'Resistance' : 'Support', 'Angka bulat'));
  L.forEach(l => { if (l.jenis !== 'Pivot') l.jenis = l.harga > p ? 'Resistance' : 'Support'; });
  return L.filter(l => Math.abs(l.harga - p) < ctx.atrD * 1.6).sort((a, b) => b.harga - a.harga);
}

// ---------- proyeksi ----------
// Bila tersedia kalibrasi: drift = k_h × skor × ATR dan rentang 80% dari residu backtest.
// Tanpa kalibrasi: heuristik (varians kumulatif per sesi, drift melemah seiring waktu).
function project(ctx, S) {
  const out = []; const p0 = ctx.price, cp = ctx.calib?.proyeksi;
  const dt = 5 / 60; let varSum = 0, drift = 0, t = 0;
  for (const m of HZ) {
    while (t < m) {
      t += 5; const h = t / 60;
      const f = clamp(vf(new Date(ctx.now.getTime() + t * 60000)), 0.15, 1.6);
      varSum += (ctx.atrH * f) ** 2 * dt;
      drift += S * 0.35 * ctx.atrH * f * dt / (1 + h / 8);
    }
    let mid = drift, half = Math.max(0.9 * Math.sqrt(varSum), ctx.atrH * 0.15), kal = false;
    const c = cp && cp[m];
    if (c && c.n >= 60 && Number.isFinite(c.k) && Number.isFinite(c.q80)) { mid = c.k * S * ctx.atrH; half = Math.max(c.q80 * ctx.atrH, ctx.atrH * 0.15); kal = true; }
    out.push({ menit: m, harga: rp(p0 + mid), bawah: rp(p0 + mid - half), atas: rp(p0 + mid + half), kalibrasi: kal });
  }
  for (let i = 1; i < out.length; i++) {   // rentang tidak boleh menyempit seiring waktu
    const pw = out[i - 1].atas - out[i - 1].bawah, w = out[i].atas - out[i].bawah;
    if (w < pw) { const mid = (out[i].atas + out[i].bawah) / 2; out[i].bawah = rp(mid - pw / 2); out[i].atas = rp(mid + pw / 2); }
  }
  return out;
}

// ---------- rencana entry ----------
function buildPlans(ctx, S, levels) {
  const p = ctx.price, a = ctx.atrH, plans = [];
  const sup = levels.filter(l => l.harga < p - a * 0.2).sort((x, y) => y.harga - x.harga);
  const res = levels.filter(l => l.harga > p + a * 0.2).sort((x, y) => x.harga - y.harga);
  const mk = (tipe, level, prioritas, why) => {
    const buy = tipe === 'BUY', w = a * 0.2;
    const eb = rp(level - w), ea = rp(level + w), mid = (eb + ea) / 2;
    const sl = rp(buy ? eb - a * 0.9 : ea + a * 0.9);
    const risk = Math.abs(mid - sl);
    const dir = buy ? 1 : -1, dist = x => (x - mid) * dir;
    const targets = (buy ? res : sup).map(l => l.harga).filter(x => dist(x) >= risk).sort((x, y) => dist(x) - dist(y));
    const t1 = targets.find(x => dist(x) <= risk * 2) ?? mid + dir * risk * 1.5;
    const t2 = targets.find(x => dist(x) > dist(t1) + risk * 0.5) ?? mid + dir * Math.max(risk * 3, dist(t1) + risk);
    const tp1 = rp(t1), tp2 = rp(t2);
    return { tipe, prioritas, entry_bawah: eb, entry_atas: ea, sl, tp1, tp2, rr: round2(Math.abs(tp1 - mid) / risk),
      trigger: buy ? 'Candle M15 menyentuh zona lalu close kembali di atasnya (rejection bullish), RSI M15 > 40' : 'Candle M15 menyentuh zona lalu close kembali di bawahnya (rejection bearish), RSI M15 < 60',
      manajemen: 'Tutup 50% di TP1 lalu geser SL ke titik impas; sisanya ke TP2. Batal bila candle H1 close melewati SL.',
      alasan: why, berlaku_menit: 480 };
  };
  if (S >= 0.15) {
    if (sup[0]) plans.push(mk('BUY', sup[0].harga, 'Utama', `Pullback ke ${sup[0].catatan} searah trend naik`));
    if (res[0]) plans.push(mk('SELL', res[0].harga, 'Alternatif', `Reaksi turun di ${res[0].catatan} bila trend gagal`));
  } else if (S <= -0.15) {
    if (res[0]) plans.push(mk('SELL', res[0].harga, 'Utama', `Pullback ke ${res[0].catatan} searah trend turun`));
    if (sup[0]) plans.push(mk('BUY', sup[0].harga, 'Alternatif', `Pantulan di ${sup[0].catatan} bila trend gagal`));
  } else {
    if (sup[0]) plans.push(mk('BUY', sup[0].harga, 'Range', `Beli di batas bawah range (${sup[0].catatan})`));
    if (res[0]) plans.push(mk('SELL', res[0].harga, 'Range', `Jual di batas atas range (${res[0].catatan})`));
  }
  return plans.filter(pl => pl.rr >= 1);
}

// ---------- kekuatan sinyal per rencana (0–100%) ----------
// Keselarasan arah rencana dengan konsensus + jumlah analis searah + RR, dipotong oleh
// risiko berita/volatilitas/gap/kualitas data. `peluang` = tingkat TP1-sebelum-SL historis
// untuk rentang kekuatan yang sama (dari backtest), bila kalibrasi tersedia.
export function strengthLabel(k) { return k >= 70 ? 'Kuat' : k >= 50 ? 'Sedang' : 'Lemah'; }
export const DIR_AGENTS = ['trend', 'momentum', 'structure', 'macro', 'news', 'claude'];
const VOTERS = ['trend', 'momentum', 'structure', 'macro'];
export function rawStrength(pl, S, by, f) {
  const dir = pl.tipe === 'SELL' ? -1 : 1;
  const act = VOTERS.filter(id => by[id]?.cukup && Math.abs(by[id].skor) > 0.1);
  const pro = act.filter(id => Math.sign(by[id].skor) === dir).length, con = act.filter(id => Math.sign(by[id].skor) === -dir).length;
  let k = 50 + S * dir * 35 + (pro - con) * 4 + (Math.min(pl.rr, 3) - 1) * 4;
  k *= f;
  return { kekuatan: Math.round(clamp(k, 5, 95)), analis_searah: pro, analis_berlawanan: con };
}
export function peluangFrom(calib, k) {
  const b = (calib?.kekuatan || []).find(x => k >= x.dari && k < x.sampai);
  return b && b.n >= 15 ? { peluang: b.peluang, sampel: b.n, ekspektasi_R: b.ekspektasi_R } : null;
}

// ---------- jadwal aksi 24 jam ----------
function schedule(ctx, events) {
  const blocks = []; let cur = null; const ss = ctx.calib?.sesi || {};
  const note = id => { const v = ss[id]; return v && v.n >= 10 ? ` · backtest TP1 duluan ${Math.round(v.peluang * 100)}%` : ''; };
  for (let m = 0; m < 1440; m += 30) {
    const d = new Date(ctx.now.getTime() + m * 60000);
    let aksi, detail;
    const near = events.find(e => Math.abs(e.t - d) <= 45 * 60000 && e.dampak === 'tinggi');
    if (!isOpen(d)) { aksi = 'NO TRADE'; detail = 'Pasar tutup'; }
    else if (!isOpen(new Date(d.getTime() - 60 * 60000))) { aksi = 'NO TRADE'; detail = 'Pembukaan pasar: spread melebar & gap awal, tunggu stabil'; }
    else if (near) { aksi = 'NO TRADE'; detail = `Sekitar rilis ${near.nama} (${jamWIB(near.t)} WIB)`; }
    else {
      const s = sessOf(d), ny = localParts(d, 'America/New_York');
      if (s === 'overlap' && ny.h < 10) { aksi = 'ENTRY'; detail = 'Pembukaan New York: gerakan terbesar hari ini — entry hanya dengan konfirmasi candle' + note('overlap'); }
      else if (s === 'overlap') { aksi = 'HOLD'; detail = 'Overlap London–NY: kelola posisi, geser SL bila TP1 tercapai' + note('overlap'); }
      else if (s === 'london') { aksi = 'ENTRY'; detail = 'Sesi London: entry bila zona tersentuh + konfirmasi' + note('london'); }
      else if (s === 'ny') { aksi = 'TAKE PROFIT'; detail = 'Akhir sesi NY: amankan profit, kurangi posisi' + note('ny'); }
      else if (s === 'akhir-pekan') { aksi = (ss['akhir-pekan'] && ss['akhir-pekan'].n >= 20 && ss['akhir-pekan'].peluang >= 0.55) ? 'ENTRY' : 'WAIT'; detail = 'Akhir pekan: likuiditas tipis, gerakan bisa liar — kecilkan lot' + note('akhir-pekan'); }
      else if (s === 'asia') { aksi = (ss.asia && ss.asia.n >= 20 && ss.asia.peluang >= 0.55) ? 'ENTRY' : 'WAIT'; detail = 'Sesi Asia: gerakan relatif kecil, pantau level' + note('asia'); }
      else { aksi = 'WAIT'; detail = 'Likuiditas rendah'; }
    }
    if (cur && cur.aksi === aksi && cur.detail === detail) cur.menit_akhir = m + 30;
    else { cur = { menit_mulai: m, menit_akhir: m + 30, aksi, detail }; blocks.push(cur); }
  }
  return blocks;
}

// ---------- analisis gap pembukaan (mode akhir pekan) ----------
function gapAnalysis(ctx, S, anchor) {
  const c = ctx.price, a = ctx.atrH, lastT = ctx.lastDataT;
  const day = ctx.h1.filter(x => x.t >= lastT - 24 * 3600);
  const hi = Math.max(...day.map(x => x.h)), lo = Math.min(...day.map(x => x.l)), loc = hi > lo ? (c - lo) / (hi - lo) : 0.5;
  const dc = ctx.dailyCloses, wk = dc.length > 6 ? (c - dc[dc.length - 6]) / dc[dc.length - 6] * 100 : null;
  const up = rp(c + a * 0.5), dn = rp(c - a * 0.5);
  const kondisiClose = loc < 0.25 ? 'ditutup dekat LOW harian (tekanan jual kuat sampai akhir)' : loc > 0.75 ? 'ditutup dekat HIGH harian (tekanan beli kuat sampai akhir)' : 'ditutup di tengah range harian';
  const lean = S < -0.15 && loc < 0.3 ? 'Risiko lanjutan turun saat pembukaan lebih besar, tapi setelah penurunan tajam waspadai pantulan short-covering.'
    : S > 0.15 && loc > 0.7 ? 'Risiko lanjutan naik saat pembukaan lebih besar, waspadai aksi ambil untung.'
    : 'Tidak ada kecenderungan gap yang jelas dari data teknikal.';
  return {
    penutupan: rp(c), waktu_tutup: new Date(lastT * 1000).toISOString(), buka: anchor.toISOString(),
    range_hari_terakhir: { high: rp(hi), low: rp(lo), posisi_close: round2(loc) },
    perubahan_mingguan_pct: wk == null ? null : round2(wk), ambang_atas: up, ambang_bawah: dn,
    kondisi: kondisiClose, kecenderungan: lean,
    skenario: [
      { nama: 'Gap naik', kondisi: `Harga buka di atas ${up}`, aksi: `Jangan kejar. Bila harga kembali turun di bawah ${up} di sesi Asia → peluang SELL menutup gap ke ${rp(c)}. Bila bertahan di atas → tunggu pullback ke harga pembukaan untuk BUY.` },
      { nama: 'Tanpa gap / gap kecil', kondisi: `Harga buka di ${dn}–${up}`, aksi: 'Ikuti rencana utama setelah 60 menit pertama.' },
      { nama: 'Gap turun', kondisi: `Harga buka di bawah ${dn}`, aksi: `Jangan kejar. Bila harga kembali naik di atas ${dn} di sesi Asia → peluang BUY menutup gap ke ${rp(c)}. Bila bertahan di bawah → tunggu pullback ke harga pembukaan untuk SELL.` },
    ],
    catatan: 'Berita akhir pekan tidak terbaca oleh mesin teknikal. Cek kabar geopolitik & pernyataan bank sentral sebelum pasar buka. Spread biasanya melebar di menit-menit awal.',
  };
}

// ---------- KONSENSUS (Rina, Chief Strategist) ----------
export const PRIOR_WEIGHTS = { trend: 0.28, momentum: 0.2, structure: 0.3, macro: 0.12, news: 0.05, claude: 0.05 };
export function analyze({ points = [], daily = [], spot, now = new Date(), h1: h1In, m15: m15In, macro, calendar, news, claude, calib, kinerja, profil } = {}) {
  P = profil || GOLD;
  const nowD = new Date(now), nowMs = nowD.getTime(), nowS = nowMs / 1000;
  const pts = (points || []).filter(x => Number.isFinite(x.p) && Number.isFinite(x.t) && x.t <= nowS + 60).sort((a, b) => a.t - b.t);
  const cut = arr => (arr || []).filter(c => c.t <= nowS);
  const sH1 = cut(h1In), sM15 = cut(m15In);
  const h1 = mergeCandles(sH1, aggregate(pts, 60)).slice(-400);
  const m15 = mergeCandles(sM15, aggregate(pts, 15)).slice(-300);
  if (h1.length < 3 || (pts.length < 24 && h1.length < 24)) throw new Error('Data harga belum cukup untuk analisis.');
  // waktu data terakhir: titik live, atau akhir candle server (candle server dianggap selesai)
  const lastDataT = Math.min(nowS, Math.max(pts.length ? last(pts).t : 0, sM15.length ? last(sM15).t + 900 : 0, sH1.length ? last(sH1).t + 3600 : 0));
  const price = Number.isFinite(spot) ? spot : pts.length ? last(pts).p : (m15.length ? last(m15) : last(h1)).c;

  // candle harian versi broker (17:00 NY) untuk PDH/PDL/pivot & ATR harian
  const dNY = nyDaily(h1, dayKeyOf), todayKey = dayKeyOf(nowS);
  const dailyC = (daily || []).filter(x => Number.isFinite(x.c)).map(x => ({ h: x.h ?? x.c, l: x.l ?? x.c, c: x.c, d: x.d }));
  const doneNY = dNY.filter(d => d.d < todayKey && d.n >= 12);
  const prevDay = doneNY.length ? last(doneNY) : ([...dailyC].reverse().find(x => x.d && x.d < nowD.toISOString().slice(0, 10)) || null);
  const dailyCloses = dailyC.length > 50 ? dailyC.map(x => x.c) : doneNY.map(x => x.c);
  const atrD = (doneNY.length >= 10 ? atr(doneNY.slice(-21)) : atr(dailyC.slice(-30))) || (Math.max(...h1.map(x => x.h)) - Math.min(...h1.map(x => x.l)));
  const hDone = h1.filter(c => c.t + 3600 <= nowS || !isOpen(nowD));
  const atrH = atr((hDone.length > 15 ? hDone : h1).slice(-30)) || atrD / Math.sqrt(24);

  const closed = !isOpen(nowD);
  const anchor = closed ? nOpen(nowD) : nowD;
  // kualitas data
  const umur = (nowS - lastDataT) / 60;
  const basi = closed ? (umur > 60 * 60 ? 1 : 0) : (umur > 120 ? 2 : umur > 20 ? 1 : 0);
  const ctx = { pts, m15, h1, price, atrH: Math.max(atrH, price * 0.0003), atrD, dailyCloses, prevDay, now: nowD, nowMs, anchor, lastDataT,
    macro, calendar, news, claude, calib, kinerja, dayKey: nowD.toISOString().slice(0, 10) };
  const lastClose = (m15.length ? last(m15) : last(h1)).c, selisih = Math.abs(price - lastClose);
  const konsisten = selisih <= Math.max(2 * ctx.atrH, price * 0.003);
  const ctxA = { ...ctx, now: anchor };   // dasar waktu proyeksi: sekarang, atau jam buka berikutnya saat pasar tutup

  const dirAgents = [agentTrend(ctx), agentMomentum(ctx), agentStructure(ctx), agentMacro(ctx), agentNews(ctx), agentClaude(ctx)];
  const infoAgents = [agentVolatility(ctx), agentSession(ctx), agentCalendar(ctxA), agentValidator(ctx)];
  const agents = [...dirAgents, ...infoAgents];
  const by = Object.fromEntries(agents.map(a => [a.id, a]));
  const W = { ...PRIOR_WEIGHTS, ...(calib?.bobot || {}) };
  let S = 0, wsum = 0, wAll = 0, wOk = 0;
  for (const a of dirAgents) { const w = W[a.id] || 0; wAll += w; if (!a.cukup) continue; wOk += w; S += a.skor * w * a.keyakinan; wsum += w * a.keyakinan; }
  S = clamp(S / (wsum || 1), -1, 1);
  const cakupan = wAll ? wOk / wAll : 0;
  const voters = VOTERS.filter(id => by[id].cukup);
  const agree = voters.filter(id => Math.sign(by[id].skor) === Math.sign(S) && Math.abs(by[id].skor) > 0.1).length;
  const highSoon = by.calendar.data.events.filter(e => e.dampak === 'tinggi');
  let conf = 0.35 + Math.abs(S) * 0.35 + agree * 0.05;
  conf *= highSoon.length ? 0.85 : 1;
  conf *= by.volatility.data.rezim === 'ekspansi' ? 0.9 : 1;
  const ar = calib?.arah; if (ar && ar.n >= 50) conf *= clamp(ar.h4 / 0.55, 0.75, 1.1);
  if (closed) conf *= 0.85;   // ketidakpastian gap pembukaan
  if (basi === 1) conf *= 0.75;
  if (!konsisten) conf *= 0.8;
  conf *= 0.6 + 0.4 * cakupan;
  conf = clamp(conf, 0.1, 0.92);
  const bias = S > 0.15 ? 'BULLISH' : S < -0.15 ? 'BEARISH' : 'SIDEWAYS';

  const levels = keyLevels(ctx);
  const sf = (highSoon.length ? 0.9 : 1) * (by.volatility.data.rezim === 'ekspansi' ? 0.92 : 1) * (closed ? 0.9 : 1) * (basi === 1 ? 0.8 : 1) * (konsisten ? 1 : 0.85) * (0.75 + 0.25 * cakupan);
  let rencana = basi === 2 ? [] : buildPlans(ctx, S, levels).map(pl => {
    const st = rawStrength(pl, S, by, sf);
    const end = anchor.getTime() + pl.berlaku_menit * 60000;
    const ev = highSoon.filter(e => e.t.getTime() <= end).map(e => `${e.nama} ${jamWIB(e.t)} WIB`);
    const pk = peluangFrom(calib, st.kekuatan);
    return { ...pl, ...st, kekuatan_label: strengthLabel(st.kekuatan), peluang: pk ? round2(pk.peluang) : null, peluang_sampel: pk ? pk.sampel : 0,
      ekspektasi_R: pk ? round2(pk.ekspektasi_R) : null, rilis: ev };
  });
  rencana.sort((a, b) => b.kekuatan - a.kekuatan);   // rencana terkuat selalu di urutan pertama
  const proyeksi = project(ctxA, S);
  const events = by.calendar.data.events;
  const jadwal = schedule(ctxA, events);
  const gap = closed ? gapAnalysis(ctx, S, anchor) : null;
  const main = rencana[0];

  const risk = { id: 'risk', nama: 'Maya', peran: 'Risk Manager', skor: 0, keyakinan: 0.7,
    ringkasan: by.volatility.data.rezim === 'ekspansi' ? 'Risiko maks 0,5% per transaksi' : 'Risiko maks 1% per transaksi',
    detail: [`SL ≈ ${(ctx.atrH * 0.9).toFixed(P.digit)} dari tepi zona (0,9× ATR H1 asli)`, 'Jangan entry 45 menit sebelum/sesudah rilis data berdampak tinggi', 'Selalu uji di akun demo sebelum akun riil'], data: { maxRisk: by.volatility.data.rezim === 'ekspansi' ? 0.5 : 1 } };
  const exec = { id: 'execution', nama: 'Dimas', peran: 'Eksekusi (EA MQL5)', skor: 0, keyakinan: rencana.length ? 0.7 : 0.3,
    ringkasan: rencana.length ? `${rencana.length} rencana siap jadi EA MT5` : 'Belum ada rencana layak', detail: ['EA: entry di zona + konfirmasi M15, TP parsial, SL ke BE, filter kekuatan minimal, selisih harga broker dihitung otomatis'], data: {} };
  const pine = { id: 'pine', nama: 'Pina', peran: 'Pine Coder (TradingView)', skor: 0, keyakinan: 0.7,
    ringkasan: 'Indikator Pine v6 level & zona hari ini siap disalin', detail: ['Gambar zona entry, SL/TP, level kunci, dan alert saat harga masuk zona'], data: {} };
  const kurangList = dirAgents.filter(a => !a.cukup).map(a => a.nama);
  const chief = { id: 'chief', nama: 'Rina', peran: 'Chief Strategist', skor: S, keyakinan: conf, cukup: true,
    ringkasan: `${bias} · keyakinan ${(conf * 100).toFixed(0)}% · ${agree}/${voters.length} analis searah`,
    detail: [`Skor konsensus ${S >= 0 ? '+' : ''}${S.toFixed(2)} (bobot ${calib?.bobot ? 'hasil kalibrasi backtest' : 'awal'})`,
      ...dirAgents.map(a => `${a.nama} (${a.peran}): ${a.cukup ? `${a.skor >= 0 ? '+' : ''}${a.skor.toFixed(2)} × bobot ${(W[a.id] || 0).toFixed(2)}` : 'tidak ikut — ' + a.ringkasan.replace('Data belum cukup — ', '')}`)], data: { agree, voters: voters.length, bobot: W, cakupan } };

  const kualitas = { basi, umur_menit: Math.round(umur), candle_h1: h1.length, candle_m15: m15.length, titik_live: pts.length, konsisten, selisih_harga: rp(selisih),
    agent_kurang: kurangList, cakupan: round2(cakupan), kalender_asli: by.calendar.data.asli, terkalibrasi: !!calib?.rencana };
  const peringatan = [
    basi === 2 ? `Data harga basi (${Math.round(umur)} menit tanpa pembaruan) — tidak ada rencana entry` : basi === 1 ? `Data harga tertunda ${Math.round(umur)} menit` : null,
    !konsisten ? `Harga spot & candle berbeda ${selisih.toFixed(P.digit)} — cek sumber data` : null,
    highSoon.length ? `Rilis berdampak tinggi: ${highSoon.slice(0, 2).map(e => `${e.nama} ${jamWIB(e.t)} WIB`).join(', ')}` : null,
    by.volatility.data.rezim === 'ekspansi' ? 'Volatilitas tinggi' : null,
    closed ? 'Pasar tutup: waspadai gap & spread lebar saat pembukaan' : null,
    kurangList.length ? `Agent tanpa data cukup: ${kurangList.join(', ')}` : null,
  ].filter(Boolean);

  const oosR = calib?.rencana?.oos;
  const keunggulan = oosR && oosR.tersentuh >= 30 ? { ada: oosR.ekspektasi_R >= 0, R: oosR.ekspektasi_R, n: oosR.tersentuh } : null;
  const narasi = buildNarrative({ bias, S, conf, main, rencana, by, dirAgents, W, highSoon, closed, anchor, basi, gap, price, calib });
  const tren = bias === 'BULLISH' ? 'cenderung naik' : bias === 'BEARISH' ? 'cenderung turun' : 'bergerak dalam range';
  const pre = closed ? `Pasar tutup — proyeksi untuk pembukaan ${fmtWIB(anchor)} dari harga penutupan ${gap.penutupan}. ` : '';
  const ringkasan = `${pre}${P.id} ${tren} (${agree}/${voters.length} analis searah). ${by.volatility.ringkasan}. ${main ? `Rencana terkuat: ${main.tipe} ${main.prioritas} di ${main.entry_bawah}–${main.entry_atas} (kekuatan sinyal ${main.kekuatan}% · ${main.kekuatan_label}).` : 'Belum ada rencana entry yang layak — tunggu.'}`;
  return {
    engine: ENGINE_VERSION, aset: { id: P.id, nama: P.nama, kelas: P.kelas, digit: P.digit, kontrak: P.kontrak, jam: P.jam }, harga_sekarang: rp(price), bias, keyakinan: Math.round(conf * 100), skor: round2(S), ringkasan, narasi,
    kekuatan_sinyal: main ? main.kekuatan : null, peluang_sinyal: main ? main.peluang : null, keunggulan,
    agents: [chief, ...agents, risk, exec, pine],
    level: levels, proyeksi, rencana, jadwal, gap, mode: closed ? 'akhir-pekan' : 'live', kualitas,
    invalidasi: main ? `Candle H1 close ${main.tipe === 'BUY' ? 'di bawah' : 'di atas'} ${main.sl}` : 'Tidak ada skenario aktif',
    peringatan: peringatan.join(' · ') || 'Tidak ada peringatan khusus', peringatan_list: peringatan,
    statistik: { atrH1: rp(ctx.atrH), atrD1: rp(atrD), rentangHarian: rp(atrD) },
    basis: { price: rp(price), time: anchor.toISOString(), dibuat: nowD.toISOString(), live: !closed, data_time: new Date(lastDataT * 1000).toISOString(), data_price: rp(lastClose) },
  };
}

// ---------- narasi untuk trader: apa yang dilakukan, kenapa, kapan batal ----------
function buildNarrative({ bias, S, conf, main, rencana, by, dirAgents, W, highSoon, closed, anchor, basi, gap, price, calib }) {
  const sorted = dirAgents.filter(a => a.cukup && Math.abs(a.skor) > 0.2).map(a => ({ a, c: a.skor * (W[a.id] || 0) * a.keyakinan })).sort((x, y) => Math.abs(y.c) - Math.abs(x.c));
  const dir = Math.sign(S) || 1;
  const pro = sorted.filter(x => Math.sign(x.c) === dir).slice(0, 3).map(x => x.a.alasan);
  const con = [...sorted.filter(x => Math.sign(x.c) === -dir).slice(0, 2).map(x => x.a.alasan),
    ...dirAgents.filter(a => a.cukup && a.hambatan && a.hambatan.arah === dir).map(a => a.hambatan.teks)];
  let aksi, judul, warna;
  const pk = main && main.peluang != null && main.peluang_sampel >= 30 ? main.peluang : null;
  const layak = main && main.kekuatan >= 55 && (pk == null || pk >= 0.5);
  const oos = calib?.rencana?.oos, tanpaEdge = oos && oos.tersentuh >= 30 && oos.ekspektasi_R < 0;
  if (basi === 2) { aksi = 'JANGAN TRADING'; warna = 'red'; judul = 'Data harga basi — tunggu sampai data kembali normal.'; }
  else if (!main) { aksi = 'TUNGGU'; warna = 'gold'; judul = 'Belum ada zona entry yang layak. Biarkan harga mendekati level kunci.'; }
  else if (tanpaEdge) { aksi = 'TUNGGU'; warna = 'gold'; judul = `Sistem belum punya keunggulan teruji di ${P.id} (uji backtest ${oos.ekspektasi_R.toFixed(2)}R per trade). Pakai sebagai peta level saja — zona ${main.tipe} ${main.entry_bawah}–${main.entry_atas}.`; }
  else if (!layak) { aksi = 'TUNGGU'; warna = 'gold'; judul = `Sinyal ${main.kekuatan_label.toLowerCase()} (${main.kekuatan}%). Pantau zona ${main.tipe} ${main.entry_bawah}–${main.entry_atas}, jangan paksa entry.`; }
  else { aksi = main.tipe; warna = main.tipe === 'BUY' ? 'green' : 'red'; judul = `${main.tipe} di ${main.entry_bawah}–${main.entry_atas} setelah ada candle konfirmasi.`; }
  if (closed && basi !== 2) judul = `Pasar buka ${fmtWIB(anchor)}. ` + judul;
  const jarak = main ? (main.tipe === 'BUY' ? price - main.entry_atas : main.entry_bawah - price) : null;
  return {
    aksi, warna, judul,
    kenapa: pro.length ? pro : ['Tidak ada faktor dominan — pasar cenderung datar'],
    penghambat: con,
    batal: main ? `Batal bila candle H1 close ${main.tipe === 'BUY' ? 'di bawah' : 'di atas'} ${main.sl}.` : null,
    target: main ? `TP1 ${main.tp1} (amankan 50%), TP2 ${main.tp2}. RR 1:${main.rr}.` : null,
    jarak: main && jarak > 0 ? `Harga ${jarak.toFixed(P.digit)} dari zona — tunggu harga datang.` : main ? 'Harga sudah di/dekat zona — tunggu konfirmasi candle M15.' : null,
    waspada: highSoon.length ? `Hindari entry ±45 menit di sekitar ${highSoon.slice(0, 2).map(e => `${e.nama} (${jamWIB(e.t)} WIB)`).join(' dan ')}.` : null,
    keandalan: tanpaEdge ? `Uji backtest aset ini rata-rata ${oos.ekspektasi_R.toFixed(2)}R dari ${oos.tersentuh} trade — EA tidak akan entry.` : pk != null ? `Dalam backtest, sinyal sekuat ini mencapai TP1 sebelum SL ${Math.round(pk * 100)}% dari ${main.peluang_sampel} kali.`
      : calib?.rencana ? 'Sampel backtest untuk kekuatan ini belum cukup — perlakukan sebagai indikasi.' : 'Belum terkalibrasi dengan backtest — perlakukan sebagai indikasi.',
  };
}

// ---------- status live sebuah rencana terhadap harga ----------
export function planState(pl, p, nowMs, t0Ms) {
  const lo = Math.min(pl.entry_bawah, pl.entry_atas), hi = Math.max(pl.entry_bawah, pl.entry_atas), buy = pl.tipe !== 'SELL';
  if (nowMs > t0Ms + (pl.berlaku_menit ?? 1440) * 60000) return { kode: 'exp', teks: 'Kedaluwarsa' };
  if (buy ? p <= pl.sl : p >= pl.sl) return { kode: 'sl', teks: `${buy ? 'Di bawah' : 'Di atas'} SL — skenario batal` };
  const dg = Math.max(2, ...[pl.entry_bawah, pl.sl].map(v => (String(v).split('.')[1] || '').length));
  if (p >= lo && p <= hi) return { kode: 'zone', teks: `DI ZONA ${buy ? 'BUY' : 'SELL'} — tunggu konfirmasi` };
  return { kode: 'wait', teks: p > hi ? `Menunggu turun ${(p - hi).toFixed(dg)} ke zona` : `Menunggu naik ${(lo - p).toFixed(dg)} ke zona` };
}
// ---------- evaluasi hasil rencana dengan candle sesudahnya (backtest & arsip live) ----------
// Konservatif: bila SL dan TP tersentuh di candle yang sama, dianggap SL.
// Hasil R memakai manajemen rencana: 50% ditutup di TP1, sisa SL ke impas → TP2 atau 0.
export function evaluatePlan(pl, bars, t0, menit = pl.berlaku_menit || 480) {
  const lo = Math.min(pl.entry_bawah, pl.entry_atas), hi = Math.max(pl.entry_bawah, pl.entry_atas), buy = pl.tipe !== 'SELL';
  const mid = (lo + hi) / 2, risk = Math.abs(mid - pl.sl); if (!(risk > 0)) return null;
  const r1 = Math.abs(pl.tp1 - mid) / risk, r2 = Math.abs(pl.tp2 - mid) / risk;
  const end = t0 + menit * 60; let entry = null, tp1 = false;
  for (const b of bars) {
    if (b.t < t0) continue;
    if (entry == null) {
      if (b.t >= end) return { hasil: 'tidak tersentuh', R: 0, tersentuh: false };
      if (b.l <= hi && b.h >= lo) entry = b.t; else continue;
      // candle yang sama: periksa SL saja (urutan di dalam candle tidak diketahui)
      if (buy ? b.l <= pl.sl : b.h >= pl.sl) return { hasil: 'SL', R: -1, tersentuh: true, t_entry: entry };
      continue;
    }
    if (!tp1) {
      const sl = buy ? b.l <= pl.sl : b.h >= pl.sl, t1 = buy ? b.h >= pl.tp1 : b.l <= pl.tp1;
      if (sl) return { hasil: 'SL', R: -1, tersentuh: true, t_entry: entry };
      if (t1) { tp1 = true; const t2 = buy ? b.h >= pl.tp2 : b.l <= pl.tp2; if (t2) return { hasil: 'TP2', R: round2(0.5 * r1 + 0.5 * r2), tersentuh: true, t_entry: entry }; }
    } else {
      const be = buy ? b.l <= mid : b.h >= mid, t2 = buy ? b.h >= pl.tp2 : b.l <= pl.tp2;
      if (be) return { hasil: 'TP1', R: round2(0.5 * r1), tersentuh: true, t_entry: entry };
      if (t2) return { hasil: 'TP2', R: round2(0.5 * r1 + 0.5 * r2), tersentuh: true, t_entry: entry };
    }
    if (b.t >= end + 16 * 3600) break;   // posisi terbuka maksimal 16 jam setelah masa berlaku
  }
  if (entry == null) return null;   // data belum cukup untuk menilai
  return tp1 ? { hasil: 'TP1', R: round2(0.5 * r1), tersentuh: true, t_entry: entry, terbuka: true } : { hasil: 'terbuka', R: 0, tersentuh: true, t_entry: entry, terbuka: true };
}
export function positionSize({ balance, riskPct, entry, sl, contract = 100 }) {
  const dist = Math.abs(entry - sl); if (!(dist > 0) || !(balance > 0)) return null;
  const riskMoney = balance * riskPct / 100; const lot = riskMoney / (dist * contract);
  return { riskMoney: round2(riskMoney), lot: Math.max(0.01, Math.floor(lot * 100) / 100), dist: +dist.toPrecision(4) };
}
