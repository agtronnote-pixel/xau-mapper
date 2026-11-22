// =====================================================================
//  Data pasar sisi server (GitHub Actions) — semua gratis, tanpa API key.
//  - Candle H1 (60 hari) & M15 (30 hari) emas: Yahoo Finance GC=F (futures),
//    digeser ke basis harga spot xaus.com memakai selisih median di periode tumpang tindih.
//  - DXY harian: Yahoo DX-Y.NYB · Yield riil 10 thn (DFII10) & 10 thn (DGS10): FRED
//  - Kalender ekonomi minggu ini: ForexFactory (faireconomy.media)
// =====================================================================
import { PROVIDERS } from '../app/data.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (KantorPine; +https://github.com/agtronnote-pixel/xau-mapper)' };
async function getJSON(url) { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${url} HTTP ${r.status}`); return r.json(); }
async function getText(url) { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${url} HTTP ${r.status}`); return r.text(); }

export async function yahooCandles(symbol, interval, range) {
  const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`);
  const R = j.chart?.result?.[0]; if (!R) throw new Error(`${symbol}: tidak ada data`);
  const q = R.indicators.quote[0], ts = R.timestamp || [], size = interval === '60m' ? 3600 : interval === '15m' ? 900 : 86400;
  const out = [];
  ts.forEach((t, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (![o, h, l, c].every(Number.isFinite) || h < l) return;
    const b = Math.floor(t / size) * size;
    // tick settlement/penutupan yang disisipkan Yahoo (timestamp tidak rata, tanpa range) bukan candle asli
    if (t !== b && h === l && (i === ts.length - 1 || out.length && out[out.length - 1].t === b)) return;
    if (out.length && out[out.length - 1].t === b) return;   // candle duplikat
    out.push({ t: b, o, h, l, c });
  });
  return out;
}
function fredCSV(text) {
  return text.trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { d, v: parseFloat(v) }; }).filter(x => Number.isFinite(x.v));
}
// Selisih spot − futures: median dari titik spot 5 menit vs close candle M15 terdekat (±5 menit).
export function basisOffset(points, m15) {
  const byEnd = new Map(m15.map(c => [c.t + 900, c.c]));
  const diffs = [];
  for (const p of points) {
    const end = Math.round(p.t / 900) * 900;
    if (Math.abs(p.t - end) <= 300 && byEnd.has(end)) diffs.push(p.p - byEnd.get(end));
  }
  if (diffs.length < 6) return null;
  diffs.sort((a, b) => a - b);
  return { offset: diffs[Math.floor(diffs.length / 2)], n: diffs.length };
}
const shift = (arr, d) => arr.map(c => ({ t: c.t, o: +(c.o + d).toFixed(2), h: +(c.h + d).toFixed(2), l: +(c.l + d).toFixed(2), c: +(c.c + d).toFixed(2) }));

export function parseCalendar(arr) {
  const map = { High: 'tinggi', Medium: 'sedang' };
  return (arr || []).filter(e => ['USD', 'GBP'].includes(e.country) && map[e.impact]).map(e => ({
    t: new Date(e.date).toISOString(), nama: e.title, negara: e.country, dampak: map[e.impact], perkiraan_nilai: e.forecast || null, sebelumnya: e.previous || null,
  })).filter(e => !e.t.startsWith('Invalid')).sort((a, b) => a.t.localeCompare(b.t));
}

// Ambil semua data. `prev` = market.json sebelumnya (dipakai bila sumber gagal).
export async function fetchServerMarket(prev = null) {
  const status = {}, safe = async (k, fn) => { try { const v = await fn(); status[k] = 'ok'; return v; } catch (e) { status[k] = 'gagal: ' + e.message.slice(0, 80); return null; } };
  const [h1f, m15f, spot, intra, dxyD, ry, y10, cal, hist] = await Promise.all([
    safe('gc_h1', () => yahooCandles('GC=F', '60m', '60d')),
    safe('gc_m15', () => yahooCandles('GC=F', '15m', '30d')),
    safe('xau_spot', () => PROVIDERS.xaus.spot(fetch)),
    safe('xau_intraday', () => PROVIDERS.xaus.intraday(fetch)),
    safe('dxy', () => yahooCandles('DX-Y.NYB', '1d', '1y')),
    safe('real_yield', async () => fredCSV(await getText('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10'))),
    safe('yield10', async () => fredCSV(await getText('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10'))),
    safe('kalender', async () => parseCalendar(await getJSON('https://nfs.faireconomy.media/ff_calendar_thisweek.json'))),
    safe('xau_history', () => PROVIDERS.xaus.history(fetch, 370)),
  ]);
  let off = intra && m15f ? basisOffset(intra.points, m15f) : null;
  if (!off && prev?.offset != null) off = { offset: prev.offset, n: 0, lama: true };
  if (!off && spot && m15f?.length) off = { offset: spot.price - m15f[m15f.length - 1].c, n: 1 };
  const d = off ? off.offset : 0;
  const dayKey = t => new Date(t * 1000).toISOString().slice(0, 10);
  return {
    dibuat: new Date().toISOString(), status,
    offset: +d.toFixed(2), offset_sampel: off?.n ?? 0, offset_lama: !!off?.lama,
    h1: h1f ? shift(h1f, d) : (prev?.h1 || []), m15: m15f ? shift(m15f, d) : (prev?.m15 || []),
    spot: spot ? spot.price : null, spot_at: spot ? new Date(spot.at).toISOString() : null,
    points: intra ? intra.points : [],
    // histori harian xaus berbasis futures → digeser ke basis spot agar konsisten
    daily: hist ? hist.daily.map(x => ({ d: x.d, c: +(x.c + d).toFixed(2), h: x.h != null ? +(x.h + d).toFixed(2) : null, l: x.l != null ? +(x.l + d).toFixed(2) : null })) : (prev?.daily || []),
    macro: {
      dxy: dxyD ? dxyD.map(c => ({ d: dayKey(c.t), c: +c.c.toFixed(3) })) : (prev?.macro?.dxy || []),
      ry: ry ? ry.slice(-400) : (prev?.macro?.ry || []),
      y10: y10 ? y10.slice(-400) : (prev?.macro?.y10 || []),
    },
    calendar: cal || prev?.calendar || [],
  };
}
// Versi ringkas untuk aplikasi (dimuat di HP): candle sebagai array [t,o,h,l,c] yang dibulatkan
// sesuai presisi aset — sekitar 60% lebih kecil, jadi riwayat git & unduhan HP tetap ringan.
export function appMarket(full) {
  const dg = full.profil?.digit ?? 2, f = 10 ** dg, r = v => Math.round(v * f) / f;
  const C = a => a.map(c => [c.t, r(c.o), r(c.h), r(c.l), r(c.c)]);
  return {
    format: 2, dibuat: full.dibuat, status: full.status, offset: full.offset, offset_sampel: full.offset_sampel, profil: full.profil || null, live: full.live || null,
    h1: C(full.h1.slice(-300)), m15: C(full.m15.slice(-200)), daily: full.daily.slice(-120).map(d => [d.d, r(d.c), d.h != null ? r(d.h) : null, d.l != null ? r(d.l) : null]),
    macro: { dxy: full.macro.dxy.slice(-90).map(x => [x.d, x.c]), ry: full.macro.ry.slice(-90).map(x => [x.d, x.v]), y10: [] },
    calendar: full.calendar,
  };
}
export { expandMarket } from '../app/data.js';
// Tulis market.json hanya bila candle berubah (akhir pekan/pasar tutup → tidak ada commit sia-sia).
export function sameCandles(a, b) {
  if (!a || !b || a.format !== 2 || b.format !== 2) return false;
  const k = m => JSON.stringify([m.h1.slice(-3), m.m15.slice(-3), m.h1.length, m.m15.length, m.calendar?.length, m.profil?.digit]);
  return k(a) === k(b);
}
