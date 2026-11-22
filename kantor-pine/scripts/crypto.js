// =====================================================================
//  Data kripto sisi server (GitHub Actions) — gratis, tanpa API key.
//  Utama: Binance data-api (data-api.binance.vision), cadangan: Coinbase Exchange.
//  Peringkat volatilitas harian untuk memilih 5 aset 24/7 paling volatil
//  dari kelompok koin likuid yang umum tersedia di broker MT5.
// =====================================================================
import { cryptoProfile } from '../app/engine.js';

// [id aplikasi/MT5, nama, simbol Binance, produk Coinbase]
export const UNIVERSE = [
  ['BTCUSD', 'Bitcoin', 'BTCUSDT', 'BTC-USD'], ['ETHUSD', 'Ethereum', 'ETHUSDT', 'ETH-USD'], ['SOLUSD', 'Solana', 'SOLUSDT', 'SOL-USD'],
  ['XRPUSD', 'XRP', 'XRPUSDT', 'XRP-USD'], ['DOGEUSD', 'Dogecoin', 'DOGEUSDT', 'DOGE-USD'], ['ADAUSD', 'Cardano', 'ADAUSDT', 'ADA-USD'],
  ['AVAXUSD', 'Avalanche', 'AVAXUSDT', 'AVAX-USD'], ['LINKUSD', 'Chainlink', 'LINKUSDT', 'LINK-USD'], ['LTCUSD', 'Litecoin', 'LTCUSDT', 'LTC-USD'],
  ['BNBUSD', 'BNB', 'BNBUSDT', null], ['DOTUSD', 'Polkadot', 'DOTUSDT', 'DOT-USD'], ['BCHUSD', 'Bitcoin Cash', 'BCHUSDT', 'BCH-USD'],
  // tidak ada di Binance/Coinbase: HTX (utama) & Kraken (cadangan)
  ['XMRUSD', 'Monero', null, null, { htx: 'xmrusdt', kraken: 'XMRUSD' }],
];
// Aset permintaan pengguna: selalu dipantau di samping 5 teratas.
export const TETAP = ['BTCUSD', 'XMRUSD'];
// Sumber harga live untuk aplikasi di HP (semua CORS terbuka, tanpa key).
export const liveSource = u => u[2] ? { provider: 'binance', symbol: u[2] } : u[4]?.htx ? { provider: 'htx', symbol: u[4].htx } : { provider: 'kraken', symbol: u[4].kraken };
const UA = { 'User-Agent': 'Mozilla/5.0 (KantorPine; +https://github.com/agtronnote-pixel/xau-mapper)' };
const BN = 'https://data-api.binance.vision/api/v3';
const IV = { '5m': 300, '15m': 900, '1h': 3600, '1d': 86400 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url) { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }

export async function binanceKlines(symbol, interval, bars) {
  const out = []; let end = null;
  while (out.length < bars) {
    const lim = Math.min(1000, bars - out.length);
    const j = await getJSON(`${BN}/klines?symbol=${symbol}&interval=${interval}&limit=${lim}${end ? `&endTime=${end}` : ''}`);
    if (!Array.isArray(j) || !j.length) break;
    const c = j.map(k => ({ t: Math.floor(k[0] / 1000), o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
    out.unshift(...c); end = j[0][0] - 1;
    if (j.length < lim) break;
  }
  return dedupe(out);
}
export async function coinbaseCandles(product, interval, bars) {
  const g = IV[interval], out = []; let end = Math.floor(Date.now() / 1000);
  while (out.length < bars) {
    const start = end - 300 * g;
    const j = await getJSON(`https://api.exchange.coinbase.com/products/${product}/candles?granularity=${g}&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`);
    if (!Array.isArray(j) || !j.length) break;
    out.unshift(...j.map(k => ({ t: k[0], o: k[3], h: k[2], l: k[1], c: k[4] })).sort((a, b) => a.t - b.t));
    end = start; await sleep(150);
  }
  return dedupe(out).slice(-bars);
}
const HTX_IV = { '5m': '5min', '15m': '15min', '1h': '60min', '1d': '1day' };
export async function htxCandles(symbol, interval, bars) {
  const j = await getJSON(`https://api.huobi.pro/market/history/kline?symbol=${symbol}&period=${HTX_IV[interval]}&size=${Math.min(2000, bars)}`);
  if (j.status !== 'ok' || !Array.isArray(j.data)) throw new Error(j['err-msg'] || 'HTX gagal');
  return dedupe(j.data.map(k => ({ t: k.id, o: k.open, h: k.high, l: k.low, c: k.close })));
}
export async function krakenCandles(pair, interval, bars) {
  const j = await getJSON(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${IV[interval] / 60}`);
  if (j.error?.length) throw new Error(j.error.join(','));
  const a = Object.values(j.result).find(Array.isArray) || [];
  return dedupe(a.map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }))).slice(-bars);
}
const dedupe = a => { const m = new Map(); a.forEach(c => { if ([c.o, c.h, c.l, c.c].every(Number.isFinite) && c.h >= c.l) m.set(c.t, c); }); return [...m.values()].sort((x, y) => x.t - y.t); };
async function candles(u, interval, bars) {
  if (u[4]) {   // aset di luar Binance/Coinbase
    try { const c = await htxCandles(u[4].htx, interval, bars); if (c.length) return { c, src: 'htx' }; } catch {}
    return { c: await krakenCandles(u[4].kraken, interval, bars), src: 'kraken' };
  }
  try { const c = await binanceKlines(u[2], interval, bars); if (c.length) return { c, src: 'binance' }; } catch (e) { if (!u[3]) throw e; }
  if (!u[3]) throw new Error('tidak ada sumber cadangan');
  return { c: await coinbaseCandles(u[3], interval === '5m' ? '5m' : interval, bars), src: 'coinbase' };
}

// Volatilitas terealisasi 30 hari (tahunan, %) dan ATR harian relatif.
export function realizedVol(daily) {
  const c = daily.slice(-31).map(x => x.c), r = c.slice(1).map((v, i) => Math.log(v / c[i]));
  const m = r.reduce((a, b) => a + b, 0) / (r.length || 1), sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length || 1));
  const d = daily.slice(-15), atr = d.slice(1).reduce((a, x, i) => a + Math.max(x.h - x.l, Math.abs(x.h - d[i].c), Math.abs(x.l - d[i].c)), 0) / Math.max(1, d.length - 1);
  return { vol30: +(sd * Math.sqrt(365) * 100).toFixed(1), atr_pct: +(atr / c[c.length - 1] * 100).toFixed(2) };
}
// Pilih 5 teratas dengan histeresis: aset lama bertahan selama volatilitasnya ≥ 90% aset ke-5,
// supaya daftar tidak berganti-ganti setiap hari.
export function pickTop(ranked, prev = [], n = 5) {
  const sel = ranked.slice(0, n).map(x => x.id);
  for (const id of prev) {
    if (sel.includes(id)) continue;
    const me = ranked.find(x => x.id === id); if (!me) continue;
    const weakest = sel.map(s => ranked.find(x => x.id === s)).filter(x => !prev.includes(x.id)).sort((a, b) => a.vol30 - b.vol30)[0];
    if (weakest && me.vol30 >= 0.9 * ranked[n - 1].vol30) sel[sel.indexOf(weakest.id)] = id;
  }
  return ranked.filter(x => sel.includes(x.id)).slice(0, n);
}
export async function rankUniverse(prevIds = []) {
  const ranked = [], gagal = [];
  for (const u of UNIVERSE) {
    try { const { c } = await candles(u, '1d', 40); if (c.length < 31) throw new Error('histori kurang');
      ranked.push({ id: u[0], nama: u[1], harga: c[c.length - 1].c, ...realizedVol(c) }); }
    catch (e) { gagal.push(`${u[0]}: ${e.message}`); }
    await sleep(120);
  }
  ranked.sort((a, b) => b.vol30 - a.vol30);
  const tetap = ranked.filter(x => TETAP.includes(x.id));
  return { ranked, top: [...pickTop(ranked.filter(x => !TETAP.includes(x.id)), prevIds), ...tetap.map(x => ({ ...x, tetap: true }))], gagal };
}
// Data lengkap satu aset (H1 60 hari, M15 30 hari, harian 400 hari, titik 5 menit 14 jam, harga terkini).
export async function fetchCryptoMarket(id, shared = {}) {
  const u = UNIVERSE.find(x => x[0] === id); if (!u) throw new Error(`aset ${id} tidak dikenal`);
  const status = {};
  const get = async (k, iv, n) => { try { const r = await candles(u, iv, n); status[k] = r.src; return r.c; } catch (e) { status[k] = 'gagal: ' + e.message; return []; } };
  const h1 = await get('h1', '1h', 1440), m15 = await get('m15', '15m', 2880), daily = await get('d1', '1d', 400), m5 = await get('m5', '5m', 168);
  let spot = null;
  try {
    if (u[2]) { spot = +(await getJSON(`${BN}/ticker/price?symbol=${u[2]}`)).price; status.spot = 'binance'; }
    else { spot = +(await getJSON(`https://api.huobi.pro/market/detail/merged?symbol=${u[4].htx}`)).tick.close; status.spot = 'htx'; }
    if (!Number.isFinite(spot)) throw new Error('spot');
  } catch { spot = m5.length ? m5[m5.length - 1].c : null; status.spot = 'dari candle'; }
  const ref = spot || h1[h1.length - 1]?.c || 1;
  return {
    dibuat: new Date().toISOString(), status, profil: cryptoProfile(id, u[1], ref), sumber: status.h1, live: liveSource(u),
    h1, m15, daily: daily.map(c => ({ d: new Date(c.t * 1000).toISOString().slice(0, 10), c: c.c, h: c.h, l: c.l })),
    points: m5.map(c => ({ t: c.t + 300, p: c.c })), spot,
    macro: shared.macro || { dxy: [], ry: [], y10: [] }, calendar: shared.calendar || [], offset: 0, offset_sampel: 0,
  };
}
