// =====================================================================
//  Kantor Pine XAUUSD — Mesin Analisis Multi-Agent
//  Murni JavaScript, tanpa dependensi, tanpa API key.
//  Berjalan di browser (aplikasi PWA) dan di Node (GitHub Actions).
// =====================================================================

export const ENGINE_VERSION = '2.2.0';
export const HZ = [5, 15, 30, 60, 120, 240, 480, 720, 1440];

// ---------- util ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const last = a => a[a.length - 1];
const round2 = v => Math.round(v * 100) / 100;
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
export const fmtWIB = d => new Date(d).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB';

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
  const k = tr.slice(-n);
  return mean(k);
}
export function macd(closes, f = 12, s = 26, sig = 9) {
  if (closes.length < s + sig) return null;
  const a = ema(closes, f), b = ema(closes, s), m = a.map((x, i) => x - b[i]), sg = ema(m, sig);
  return { macd: last(m), signal: last(sg), hist: last(m) - last(sg), histPrev: m[m.length - 2] - sg[sg.length - 2] };
}
export function bollinger(closes, n = 20, k = 2) {
  if (closes.length < n) return null;
  const w = closes.slice(-n), m = mean(w), sd = Math.sqrt(mean(w.map(x => (x - m) ** 2)));
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
function localParts(date, tz) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', weekday: 'short', day: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const g = t => (p.find(x => x.type === t) || {}).value;
  return { h: +g('hour'), m: +g('minute'), wd: g('weekday'), d: +g('day') };
}
// Emas spot tutup dari Jumat 17:00 sampai Minggu 18:00 waktu New York.
export function marketOpen(date) {
  const { h, wd } = localParts(date, 'America/New_York');
  if (wd === 'Sat') return false;
  if (wd === 'Fri' && h >= 17) return false;
  if (wd === 'Sun' && h < 18) return false;
  return true;
}
export function activeSessions(date) {
  if (!marketOpen(date)) return [];
  return SESSIONS.filter(s => { const { h } = localParts(date, s.tz); return h >= s.h1 && h < s.h2; });
}
// Waktu buka pasar berikutnya (resolusi 1 menit). Bila pasar sedang buka, kembalikan `date`.
export function nextOpen(date) {
  if (marketOpen(date)) return date;
  let t = Math.ceil(date.getTime() / 60000) * 60000;
  for (let i = 0; i < 4 * 24 * 60; i++, t += 60000) if (marketOpen(new Date(t))) return new Date(t);
  return date;
}
export function volFactor(date) {
  const a = activeSessions(date);
  if (!marketOpen(date)) return 0;
  if (!a.length) return 0.55;
  const f = Math.max(...a.map(s => s.vol));
  return a.length > 1 ? f + 0.25 : f;
}
export { SESSIONS };

// ---------- kalender rilis rutin AS (perkiraan) ----------
export function routineEvents(from, hours = 24) {
  const out = [];
  for (let m = 0; m <= hours * 60; m += 30) {
    const d = new Date(from.getTime() + m * 60000);
    const ny = localParts(d, 'America/New_York');
    if (ny.m !== 30 || ny.h !== 8) continue;
    if (ny.wd === 'Thu') out.push({ t: d, nama: 'Klaim Pengangguran AS (mingguan)', dampak: 'sedang' });
    if (ny.wd === 'Fri' && ny.d <= 7) out.push({ t: d, nama: 'Non-Farm Payrolls (NFP)', dampak: 'tinggi' });
    else if (ny.d >= 10 && ny.d <= 15 && ['Tue', 'Wed', 'Thu'].includes(ny.wd)) out.push({ t: d, nama: 'Kemungkinan rilis CPI / PPI AS', dampak: 'tinggi' });
  }
  return out;
}

// ---------- AGENTS ----------
// Setiap agent mengembalikan: {id, nama, peran, skor (-1..1, + = naik), keyakinan (0..1), ringkasan, detail[]}
function agentTrend(ctx) {
  const { h1, dailyCloses } = ctx; const c = h1.map(x => x.c);
  const e20 = last(ema(c, 20)), e50 = last(ema(c, 50)), sl = slope(c, 24) / ctx.atrH;
  const de20 = dailyCloses.length > 20 ? last(ema(dailyCloses, 20)) : null, de50 = dailyCloses.length > 50 ? last(ema(dailyCloses, 50)) : null;
  let s = 0; const d = [];
  if (e20 > e50) { s += 0.35; d.push('EMA20 H1 di atas EMA50 (trend naik jangka pendek)'); } else { s -= 0.35; d.push('EMA20 H1 di bawah EMA50 (trend turun jangka pendek)'); }
  s += clamp(sl * 1.5, -0.35, 0.35); d.push(`Kemiringan harga 24 jam: ${sl >= 0 ? '+' : ''}${(sl).toFixed(2)} ATR/jam`);
  if (de20 && de50) { if (de20 > de50) { s += 0.3; d.push('Trend harian naik (EMA20 > EMA50 D1)'); } else { s -= 0.3; d.push('Trend harian turun (EMA20 < EMA50 D1)'); } }
  s = clamp(s, -1, 1);
  return { id: 'trend', nama: 'Arka', peran: 'Analis Trend', skor: s, keyakinan: 0.5 + Math.abs(s) * 0.4,
    ringkasan: s > 0.25 ? 'Trend dominan NAIK' : s < -0.25 ? 'Trend dominan TURUN' : 'Trend datar / transisi', detail: d, data: { e20, e50 } };
}
function agentMomentum(ctx) {
  const c15 = ctx.m15.map(x => x.c), c60 = ctx.h1.map(x => x.c);
  const r15 = rsi(c15), r60 = rsi(c60), m = macd(c60); let s = 0; const d = [];
  if (r60 != null) { s += clamp((r60 - 50) / 40, -0.45, 0.45); d.push(`RSI H1 ${r60.toFixed(1)}`); }
  if (r15 != null) { s += clamp((r15 - 50) / 60, -0.25, 0.25); d.push(`RSI M15 ${r15.toFixed(1)}`); }
  if (m) { const up = m.hist > m.histPrev; s += m.hist > 0 ? 0.15 : -0.15; s += up ? 0.1 : -0.1; d.push(`MACD H1 histogram ${m.hist > 0 ? 'positif' : 'negatif'}, ${up ? 'menguat' : 'melemah'}`); }
  let catatan = '';
  if (r60 > 72) { catatan = 'Jenuh beli — rawan koreksi'; s -= 0.15; } else if (r60 < 28) { catatan = 'Jenuh jual — rawan pantulan'; s += 0.15; }
  if (catatan) d.push(catatan);
  s = clamp(s, -1, 1);
  return { id: 'momentum', nama: 'Mira', peran: 'Analis Momentum', skor: s, keyakinan: 0.45 + Math.abs(s) * 0.4,
    ringkasan: catatan || (s > 0.2 ? 'Momentum beli menguat' : s < -0.2 ? 'Momentum jual menguat' : 'Momentum netral'), detail: d, data: { r15, r60 } };
}
function agentVolatility(ctx) {
  const b = bollinger(ctx.h1.map(x => x.c)); const d = [];
  const ratio = ctx.atrH / (ctx.atrD / Math.sqrt(24));
  d.push(`ATR H1 ≈ ${ctx.atrH.toFixed(2)} | ATR harian ≈ ${ctx.atrD.toFixed(2)}`);
  let rezim = 'normal';
  if (b) { d.push(`Lebar Bollinger H1 ${(b.width * 100).toFixed(2)}%`); if (b.width < 0.004) rezim = 'squeeze'; }
  if (ratio > 1.4) rezim = 'ekspansi';
  const ringkas = rezim === 'squeeze' ? 'Volatilitas menyempit — siaga breakout' : rezim === 'ekspansi' ? 'Volatilitas tinggi — perlebar SL, kecilkan lot' : 'Volatilitas normal';
  return { id: 'volatility', nama: 'Vega', peran: 'Analis Volatilitas', skor: 0, keyakinan: rezim === 'ekspansi' ? 0.4 : 0.7, ringkasan: ringkas, detail: d,
    data: { rezim, rangeHarian: ctx.atrD, ratio } };
}
function agentStructure(ctx) {
  const { highs, lows } = swings(ctx.h1, 2); const d = []; let s = 0; const p = ctx.price;
  const hh = highs.slice(-2), ll = lows.slice(-2);
  if (hh.length === 2 && ll.length === 2) {
    const up = hh[1].p > hh[0].p && ll[1].p > ll[0].p, dn = hh[1].p < hh[0].p && ll[1].p < ll[0].p;
    if (up) { s += 0.45; d.push('Higher high & higher low (struktur naik)'); }
    else if (dn) { s -= 0.45; d.push('Lower high & lower low (struktur turun)'); }
    else d.push('Struktur campuran (range)');
  }
  const lastH = last(highs), lastL = last(lows);
  if (lastH && p > lastH.p) { s += 0.35; d.push(`Break of Structure naik di atas ${lastH.p.toFixed(2)}`); }
  if (lastL && p < lastL.p) { s -= 0.35; d.push(`Break of Structure turun di bawah ${lastL.p.toFixed(2)}`); }
  s = clamp(s, -1, 1);
  return { id: 'structure', nama: 'Sena', peran: 'Analis Struktur (SMC)', skor: s, keyakinan: 0.5 + Math.abs(s) * 0.35,
    ringkasan: s > 0.3 ? 'Struktur bullish' : s < -0.3 ? 'Struktur bearish' : 'Struktur range', detail: d, data: { highs: highs.slice(-3), lows: lows.slice(-3) } };
}
function agentSession(ctx) {
  const a = activeSessions(ctx.now), open = marketOpen(ctx.now), d = [];
  const names = a.map(s => s.nama);
  if (!open) d.push(`Pasar emas TUTUP, buka lagi ${fmtWIB(ctx.anchor)}`);
  else d.push(names.length ? `Sesi aktif: ${names.join(' + ')}` : 'Di antara sesi (likuiditas rendah)');
  const f = volFactor(ctx.now); d.push(`Faktor volatilitas sesi: ${f.toFixed(2)}×`);
  return { id: 'session', nama: 'Tara', peran: 'Analis Sesi', skor: 0, keyakinan: open ? (f >= 1 ? 0.8 : 0.55) : 0.2,
    ringkasan: !open ? 'Pasar tutup' : names.length ? `Sesi ${names.join(' + ')} berjalan` : 'Sesi sepi', detail: d, data: { open, names, factor: f } };
}
function agentCalendar(ctx) {
  const ev = routineEvents(ctx.now, 24), d = [];
  ev.forEach(e => d.push(`${e.nama} — ${e.t.toISOString()}`));
  if (!ev.length) d.push('Tidak ada rilis rutin AS berdampak tinggi yang terdeteksi 24 jam ke depan');
  d.push('Jadwal ini perkiraan pola rutin. Selalu cek kalender ekonomi resmi.');
  const high = ev.some(e => e.dampak === 'tinggi');
  return { id: 'calendar', nama: 'Nadi', peran: 'Kalender & Berita', skor: 0, keyakinan: high ? 0.4 : 0.75,
    ringkasan: high ? 'Ada rilis data AS berdampak tinggi — hindari entry di sekitarnya' : ev.length ? 'Ada rilis data AS berdampak sedang' : 'Kalender relatif sepi', detail: d, data: { events: ev } };
}

// Validator: uji model arah harian pada histori (walk-forward sederhana).
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
function agentValidator(ctx) {
  const v = validateDaily(ctx.dailyCloses), d = [];
  if (v) d.push(`Akurasi arah harian model trend: ${(v.akurasi * 100).toFixed(1)}% dari ${v.sampel} hari`);
  else d.push('Histori belum cukup untuk validasi');
  d.push('Di atas 55% = model punya keunggulan; di bawah 50% = jangan terlalu percaya bias.');
  return { id: 'validator', nama: 'Lukas', peran: 'Validator (Backtest)', skor: 0, keyakinan: v ? clamp(v.akurasi, 0.3, 0.8) : 0.5,
    ringkasan: v ? `Akurasi historis ${(v.akurasi * 100).toFixed(0)}%` : 'Belum tervalidasi', detail: d, data: v || {} };
}

// ---------- level kunci ----------
function keyLevels(ctx) {
  const L = [], p = ctx.price, tol = ctx.atrH * 0.25;
  const add = (harga, jenis, catatan) => { if (!Number.isFinite(harga)) return; if (L.some(x => Math.abs(x.harga - harga) < tol)) return; L.push({ harga: round2(harga), jenis, catatan }); };
  const pd = ctx.prevDay;
  if (pd) {
    const P = (pd.h + pd.l + pd.c) / 3;
    add(P, 'Pivot', 'Pivot harian'); add(2 * P - pd.l, 'Resistance', 'R1 harian'); add(2 * P - pd.h, 'Support', 'S1 harian');
    add(pd.h, 'Resistance', 'High kemarin (PDH)'); add(pd.l, 'Support', 'Low kemarin (PDL)');
  }
  const { highs, lows } = swings(ctx.h1, 2);
  highs.slice(-3).forEach(h => add(h.p, h.p > p ? 'Resistance' : 'Support', 'Swing high H1'));
  lows.slice(-3).forEach(l => add(l.p, l.p < p ? 'Support' : 'Resistance', 'Swing low H1'));
  const step = p > 1000 ? 25 : 5; const r = Math.round(p / step) * step;
  [r - step, r, r + step].forEach(x => add(x, x > p ? 'Resistance' : 'Support', 'Angka bulat'));
  L.forEach(l => { if (l.jenis !== 'Pivot') l.jenis = l.harga > p ? 'Resistance' : 'Support'; });
  return L.filter(l => Math.abs(l.harga - p) < ctx.atrD * 1.6).sort((a, b) => b.harga - a.harga);
}

// ---------- proyeksi ----------
function project(ctx, S) {
  const out = []; const p0 = ctx.price;
  // Akumulasi per langkah 5 menit: varians bertambah sesuai volatilitas sesi,
  // drift mengikuti skor konsensus dan melemah seiring waktu (sinyal makin basi).
  const dt = 5 / 60; let varSum = 0, drift = 0, t = 0;
  for (const m of HZ) {
    while (t < m) {
      t += 5; const h = t / 60;
      const f = clamp(volFactor(new Date(ctx.now.getTime() + t * 60000)), 0.15, 1.6);
      varSum += (ctx.atrH * f) ** 2 * dt;
      drift += S * 0.35 * ctx.atrH * f * dt / (1 + h / 8);
    }
    const half = Math.max(0.9 * Math.sqrt(varSum), ctx.atrH * 0.15);
    out.push({ menit: m, harga: round2(p0 + drift), bawah: round2(p0 + drift - half), atas: round2(p0 + drift + half), catatan: '' });
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
    const eb = round2(level - w), ea = round2(level + w), mid = (eb + ea) / 2;
    const sl = round2(buy ? eb - a * 0.9 : ea + a * 0.9);
    const risk = Math.abs(mid - sl);
    const dir = buy ? 1 : -1, dist = x => (x - mid) * dir;
    const targets = (buy ? res : sup).map(l => l.harga).filter(x => dist(x) >= risk).sort((x, y) => dist(x) - dist(y));
    const t1 = targets.find(x => dist(x) <= risk * 2) ?? mid + dir * risk * 1.5;
    const t2 = targets.find(x => dist(x) > dist(t1) + risk * 0.5) ?? mid + dir * Math.max(risk * 3, dist(t1) + risk);
    const tp1 = round2(t1), tp2 = round2(t2);
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

// ---------- jadwal aksi 24 jam ----------
function schedule(ctx, events) {
  const blocks = []; let cur = null;
  for (let m = 0; m < 1440; m += 30) {
    const d = new Date(ctx.now.getTime() + m * 60000);
    let aksi, detail;
    const near = events.find(e => Math.abs(e.t - d) <= 45 * 60000 && e.dampak === 'tinggi');
    if (!marketOpen(d)) { aksi = 'NO TRADE'; detail = 'Pasar tutup'; }
    else if (!marketOpen(new Date(d.getTime() - 60 * 60000))) { aksi = 'NO TRADE'; detail = 'Pembukaan pasar: spread melebar & gap awal, tunggu stabil'; }
    else if (near) { aksi = 'NO TRADE'; detail = `Sekitar ${near.nama}`; }
    else {
      const s = activeSessions(d).map(x => x.id);
      if (s.includes('london') && s.includes('ny')) { aksi = 'HOLD'; detail = 'Overlap London–NY: volatilitas puncak, kelola posisi'; }
      else if (s.includes('london')) { aksi = 'ENTRY'; detail = 'Sesi London: entry bila zona tersentuh + konfirmasi'; }
      else if (s.includes('ny')) { aksi = 'TAKE PROFIT'; detail = 'Akhir NY: amankan profit, kurangi posisi'; }
      else if (s.includes('asia')) { aksi = 'WAIT'; detail = 'Sesi Asia: tunggu, pantau level'; }
      else { aksi = 'WAIT'; detail = 'Likuiditas rendah'; }
    }
    if (cur && cur.aksi === aksi && cur.detail === detail) cur.menit_akhir = m + 30;
    else { cur = { menit_mulai: m, menit_akhir: m + 30, aksi, detail }; blocks.push(cur); }
  }
  return blocks;
}

// ---------- analisis gap pembukaan (mode akhir pekan) ----------
function gapAnalysis(ctx, S, anchor) {
  const c = ctx.price, a = ctx.atrH, lastT = last(ctx.pts).t;
  const day = ctx.pts.filter(x => x.t >= lastT - 24 * 3600).map(x => x.p);
  const hi = Math.max(...day), lo = Math.min(...day), loc = hi > lo ? (c - lo) / (hi - lo) : 0.5;
  const dc = ctx.dailyCloses, wk = dc.length > 6 ? (c - dc[dc.length - 6]) / dc[dc.length - 6] * 100 : null;
  const up = round2(c + a * 0.5), dn = round2(c - a * 0.5);
  const kondisiClose = loc < 0.25 ? 'ditutup dekat LOW harian (tekanan jual kuat sampai akhir)' : loc > 0.75 ? 'ditutup dekat HIGH harian (tekanan beli kuat sampai akhir)' : 'ditutup di tengah range harian';
  const lean = S < -0.15 && loc < 0.3 ? 'Risiko lanjutan turun saat pembukaan lebih besar, tapi setelah penurunan tajam waspadai pantulan short-covering.'
    : S > 0.15 && loc > 0.7 ? 'Risiko lanjutan naik saat pembukaan lebih besar, waspadai aksi ambil untung.'
    : 'Tidak ada kecenderungan gap yang jelas dari data teknikal.';
  return {
    penutupan: round2(c), waktu_tutup: new Date(lastT * 1000).toISOString(), buka: anchor.toISOString(),
    range_hari_terakhir: { high: round2(hi), low: round2(lo), posisi_close: round2(loc) },
    perubahan_mingguan_pct: wk == null ? null : round2(wk), ambang_atas: up, ambang_bawah: dn,
    kondisi: kondisiClose, kecenderungan: lean,
    skenario: [
      { nama: 'Gap naik', kondisi: `Harga buka di atas ${up}`, aksi: `Jangan kejar. Bila harga kembali turun di bawah ${up} di sesi Asia → peluang SELL menutup gap ke ${round2(c)}. Bila bertahan di atas → tunggu pullback ke harga pembukaan untuk BUY.` },
      { nama: 'Tanpa gap / gap kecil', kondisi: `Harga buka di ${dn}–${up}`, aksi: 'Ikuti rencana utama di bawah setelah 60 menit pertama.' },
      { nama: 'Gap turun', kondisi: `Harga buka di bawah ${dn}`, aksi: `Jangan kejar. Bila harga kembali naik di atas ${dn} di sesi Asia → peluang BUY menutup gap ke ${round2(c)}. Bila bertahan di bawah → tunggu pullback ke harga pembukaan untuk SELL.` },
    ],
    catatan: 'Berita akhir pekan tidak terbaca oleh mesin. Cek kabar geopolitik & pernyataan bank sentral sebelum pasar buka. Spread biasanya melebar di menit-menit awal.',
  };
}

// ---------- KONSENSUS (Rina, Chief Strategist) ----------
const WEIGHTS = { trend: 0.35, momentum: 0.25, structure: 0.4 };
export function analyze({ points, daily, spot, now = new Date() }) {
  const pts = (points || []).filter(x => Number.isFinite(x.p) && Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  if (pts.length < 24) throw new Error('Data intraday belum cukup (butuh minimal 2 jam).');
  const price = Number.isFinite(spot) ? spot : last(pts).p;
  const m15 = aggregate(pts, 15), h1 = aggregate(pts, 60);
  const dailyC = (daily || []).filter(x => Number.isFinite(x.c)).map(x => ({ h: x.h ?? x.c, l: x.l ?? x.c, c: x.c, d: x.d }));
  const dailyCloses = dailyC.map(x => x.c);
  const atrD = atr(dailyC.slice(-30)) || (Math.max(...pts.map(x => x.p)) - Math.min(...pts.map(x => x.p)));
  const atrH = atr(h1.slice(-30)) || atrD / Math.sqrt(24);
  const today = new Date(now).toISOString().slice(0, 10);
  const prevDay = [...dailyC].reverse().find(x => x.d && x.d < today) || dailyC[dailyC.length - 2] || null;
  const closed = !marketOpen(new Date(now));
  const anchor = closed ? nextOpen(new Date(now)) : new Date(now);
  const ctx = { pts, m15, h1, price, atrH: Math.max(atrH, price * 0.0003), atrD, dailyCloses, prevDay, now: new Date(now), anchor };
  const ctxA = { ...ctx, now: anchor };   // dasar waktu proyeksi: sekarang, atau jam buka berikutnya saat pasar tutup

  const agents = [agentTrend(ctx), agentMomentum(ctx), agentStructure(ctx), agentVolatility(ctx), agentSession(ctx), agentCalendar(ctxA), agentValidator(ctx)];
  const by = Object.fromEntries(agents.map(a => [a.id, a]));
  let S = 0, wsum = 0;
  for (const [id, w] of Object.entries(WEIGHTS)) { S += by[id].skor * w * by[id].keyakinan; wsum += w * by[id].keyakinan; }
  S = clamp(S / (wsum || 1), -1, 1);
  const agree = ['trend', 'momentum', 'structure'].filter(id => Math.sign(by[id].skor) === Math.sign(S) && Math.abs(by[id].skor) > 0.1).length;
  let conf = 0.35 + Math.abs(S) * 0.35 + agree * 0.06;
  conf *= by.calendar.keyakinan < 0.5 ? 0.85 : 1;
  conf *= by.volatility.data.rezim === 'ekspansi' ? 0.9 : 1;
  if (by.validator.data.akurasi) conf *= clamp(by.validator.data.akurasi / 0.55, 0.75, 1.1);
  if (closed) conf *= 0.85;   // ketidakpastian gap pembukaan
  conf = clamp(conf, 0.1, 0.92);
  const bias = S > 0.15 ? 'BULLISH' : S < -0.15 ? 'BEARISH' : 'SIDEWAYS';

  const levels = keyLevels(ctx);
  const rencana = buildPlans(ctx, S, levels);
  const proyeksi = project(ctxA, S);
  const events = by.calendar.data.events;
  const jadwal = schedule(ctxA, events);
  const gap = closed ? gapAnalysis(ctx, S, anchor) : null;

  const risk = { id: 'risk', nama: 'Maya', peran: 'Risk Manager', skor: 0, keyakinan: 0.7,
    ringkasan: by.volatility.data.rezim === 'ekspansi' ? 'Risiko maks 0,5% per transaksi' : 'Risiko maks 1% per transaksi',
    detail: [`SL minimal ≈ ${(ctx.atrH * 0.9).toFixed(2)} (0,9× ATR H1)`, 'Jangan entry 45 menit sebelum/sesudah rilis data berdampak tinggi', 'Selalu uji di akun demo sebelum akun riil'], data: { maxRisk: by.volatility.data.rezim === 'ekspansi' ? 0.5 : 1 } };
  const exec = { id: 'execution', nama: 'Dimas', peran: 'Eksekusi (EA MQL5)', skor: 0, keyakinan: rencana.length ? 0.7 : 0.3,
    ringkasan: rencana.length ? `${rencana.length} rencana siap jadi EA MT5` : 'Belum ada rencana layak', detail: ['EA dibuat otomatis dari rencana: entry di zona + konfirmasi M15, TP parsial, SL ke BE'], data: {} };
  const pine = { id: 'pine', nama: 'Pina', peran: 'Pine Coder (TradingView)', skor: 0, keyakinan: 0.7,
    ringkasan: 'Indikator Pine v6 level & zona hari ini siap disalin', detail: ['Gambar zona entry, SL/TP, level kunci, dan alert saat harga masuk zona'], data: {} };
  const chief = { id: 'chief', nama: 'Rina', peran: 'Chief Strategist', skor: S, keyakinan: conf,
    ringkasan: `${bias} · keyakinan ${(conf * 100).toFixed(0)}% · ${agree}/3 analis searah`,
    detail: [`Skor konsensus ${S >= 0 ? '+' : ''}${S.toFixed(2)}`, ...agents.filter(a => WEIGHTS[a.id]).map(a => `${a.nama} (${a.peran}): ${a.skor >= 0 ? '+' : ''}${a.skor.toFixed(2)}`)], data: { agree } };

  const tren = bias === 'BULLISH' ? 'cenderung naik' : bias === 'BEARISH' ? 'cenderung turun' : 'bergerak dalam range';
  const pre = closed ? `Pasar tutup — proyeksi untuk pembukaan ${fmtWIB(anchor)} dari harga penutupan ${gap.penutupan}. ` : '';
  const ringkasan = `${pre}XAUUSD ${tren} (${agree}/3 analis searah). ${by.volatility.ringkasan}. ${by.session.ringkasan}. ${rencana[0] ? `Rencana utama: ${rencana[0].tipe} di ${rencana[0].entry_bawah}–${rencana[0].entry_atas}.` : 'Belum ada rencana entry yang layak — tunggu.'}`;
  const main = rencana[0];
  return {
    engine: ENGINE_VERSION, harga_sekarang: round2(price), bias, keyakinan: Math.round(conf * 100), skor: round2(S), ringkasan,
    agents: [chief, ...agents, risk, exec, pine],
    level: levels, proyeksi, rencana, jadwal, gap, mode: closed ? 'akhir-pekan' : 'live',
    invalidasi: main ? `Candle H1 close ${main.tipe === 'BUY' ? 'di bawah' : 'di atas'} ${main.sl}` : 'Tidak ada skenario aktif',
    peringatan: [events.filter(e => e.dampak === 'tinggi').length ? 'Ada rilis data AS berdampak tinggi dalam 24 jam' : null, by.volatility.data.rezim === 'ekspansi' ? 'Volatilitas tinggi' : null, closed ? 'Pasar tutup: waspadai gap & spread lebar saat pembukaan' : null].filter(Boolean).join(' · ') || 'Tidak ada peringatan khusus',
    statistik: { atrH1: round2(ctx.atrH), atrD1: round2(atrD), rentangHarian: round2(atrD) },
    basis: { price: round2(price), time: anchor.toISOString(), dibuat: new Date(now).toISOString(), live: !closed },
  };
}

// ---------- status live sebuah rencana terhadap harga ----------
export function planState(pl, p, nowMs, t0Ms) {
  const lo = Math.min(pl.entry_bawah, pl.entry_atas), hi = Math.max(pl.entry_bawah, pl.entry_atas), buy = pl.tipe !== 'SELL';
  if (nowMs > t0Ms + (pl.berlaku_menit ?? 1440) * 60000) return { kode: 'exp', teks: 'Kedaluwarsa' };
  if (buy ? p <= pl.sl : p >= pl.sl) return { kode: 'sl', teks: `${buy ? 'Di bawah' : 'Di atas'} SL — skenario batal` };
  if (p >= lo && p <= hi) return { kode: 'zone', teks: `DI ZONA ${buy ? 'BUY' : 'SELL'} — tunggu konfirmasi` };
  return { kode: 'wait', teks: p > hi ? `Menunggu turun ${(p - hi).toFixed(2)} ke zona` : `Menunggu naik ${(lo - p).toFixed(2)} ke zona` };
}
export function positionSize({ balance, riskPct, entry, sl, contract = 100 }) {
  const dist = Math.abs(entry - sl); if (!(dist > 0) || !(balance > 0)) return null;
  const riskMoney = balance * riskPct / 100; const lot = riskMoney / (dist * contract);
  return { riskMoney: round2(riskMoney), lot: Math.max(0.01, Math.floor(lot * 100) / 100), dist: round2(dist) };
}
