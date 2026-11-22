// =====================================================================
//  Kantor Pine XAUUSD — Lapisan data harga (tanpa API key)
//  Sumber utama: xaus.com (CORS terbuka, gratis untuk pemakaian wajar).
//  - spot      : harga XAU/USD terkini (cache sumber 60 detik)
//  - intraday  : titik harga tiap 5 menit, sampai 48 jam
//  - history   : candle harian (close/high/low), sampai 1 tahun
//  Struktur provider dibuat agar sumber lain mudah ditambahkan nanti.
// =====================================================================

export const PROVIDERS = {
  // Kripto 24/7: Binance data-api publik (CORS terbuka, tanpa key). Simbol: BTCUSDT, dst.
  binance: {
    nama: 'Binance',
    base: 'https://data-api.binance.vision/api/v3',
    async spot(f = fetch, symbol) {
      const r = await f(`${this.base}/ticker/price?symbol=${symbol}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`spot HTTP ${r.status}`);
      const j = await r.json(), price = +j.price;
      if (!Number.isFinite(price)) throw new Error('spot tidak tersedia');
      return { price, at: Date.now(), state: {} };
    },
    async intraday(f = fetch, symbol) {
      const r = await f(`${this.base}/klines?symbol=${symbol}&interval=5m&limit=168`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`intraday HTTP ${r.status}`);
      const j = await r.json();
      return { points: j.map(k => ({ t: Math.floor(k[0] / 1000) + 300, p: +k[4] })).filter(x => x.t <= Date.now() / 1000 + 60), state: {} };
    },
    async history() { return { daily: [], stats: {} }; },   // histori harian dari server
  },
  // Aset di luar Binance (mis. Monero): HTX utama, Kraken cadangan — keduanya CORS terbuka, tanpa key.
  htx: {
    nama: 'HTX',
    async spot(f = fetch, symbol) {
      const j = await (await f(`https://api.huobi.pro/market/detail/merged?symbol=${symbol}`, { cache: 'no-store' })).json();
      const price = +j?.tick?.close; if (!Number.isFinite(price)) throw new Error('spot tidak tersedia');
      return { price, at: j.ts || Date.now(), state: {} };
    },
    async intraday(f = fetch, symbol) {
      const j = await (await f(`https://api.huobi.pro/market/history/kline?symbol=${symbol}&period=5min&size=168`, { cache: 'no-store' })).json();
      if (j.status !== 'ok') throw new Error('intraday HTX gagal');
      return { points: j.data.map(k => ({ t: k.id + 300, p: k.close })).filter(x => x.t <= Date.now() / 1000 + 60).sort((a, b) => a.t - b.t), state: {} };
    },
    async history() { return { daily: [], stats: {} }; },
  },
  kraken: {
    nama: 'Kraken',
    async spot(f = fetch, symbol) {
      const j = await (await f(`https://api.kraken.com/0/public/Ticker?pair=${symbol}`, { cache: 'no-store' })).json();
      const price = +Object.values(j.result || {})[0]?.c?.[0]; if (!Number.isFinite(price)) throw new Error('spot tidak tersedia');
      return { price, at: Date.now(), state: {} };
    },
    async intraday(f = fetch, symbol) {
      const j = await (await f(`https://api.kraken.com/0/public/OHLC?pair=${symbol}&interval=5`, { cache: 'no-store' })).json();
      const a = Object.values(j.result || {}).find(Array.isArray) || [];
      return { points: a.slice(-168).map(k => ({ t: k[0] + 300, p: +k[4] })).filter(x => x.t <= Date.now() / 1000 + 60), state: {} };
    },
    async history() { return { daily: [], stats: {} }; },
  },
  xaus: {
    nama: 'xaus.com',
    base: 'https://xaus.com/api/v1',
    async spot(f = fetch) {
      const r = await f(`${this.base}/spot?compact=1`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`spot HTTP ${r.status}`);
      const j = await r.json();
      const price = j.spot_usd_oz ?? (j.xau && j.xau.price);
      if (!Number.isFinite(price)) throw new Error('spot tidak tersedia');
      return { price, at: Date.parse(j.updated_at) || Date.now(), state: j.data_state || {} };
    },
    async intraday(f = fetch, hours = 48) {
      const r = await f(`${this.base}/intraday?symbol=xau&hours=${hours}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`intraday HTTP ${r.status}`);
      const j = await r.json();
      return { points: (j.points || []).map(x => ({ t: x.t, p: x.p })), state: j.data_state || {} };
    },
    async history(f = fetch, days = 370) {
      const r = await f(`${this.base}/history?days=${days}`);
      if (!r.ok) throw new Error(`history HTTP ${r.status}`);
      const j = await r.json();
      return { daily: (j.points || []).map(x => ({ d: x.d, c: x.c, h: x.h, l: x.l })), stats: { high52: j.high_52w, low52: j.low_52w, ret1y: j.return_1y_pct, retYtd: j.return_ytd_pct } };
    },
  },
};

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* penuh/tidak tersedia */ } },
};

// Ambil semua data yang dibutuhkan mesin analisis. Histori harian di-cache 6 jam.
export async function loadMarket({ provider = 'xaus', symbol, fallback, f = (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null), useCache = typeof localStorage !== 'undefined' } = {}) {
  const P = PROVIDERS[provider];
  if (provider !== 'xaus') {
    let spot, intra;
    try { [spot, intra] = await Promise.all([P.spot(f, symbol), P.intraday(f, symbol)]); }
    catch (e) { if (provider !== 'htx' || !fallback) throw e; return loadMarket({ provider: 'kraken', symbol: fallback, f, useCache }); }
    return { source: P.nama, spot: spot.price, spotAt: spot.at, state: {}, points: intra.points, daily: [], stats: {} };
  }
  let hist = useCache ? store.get('kpx_hist') : null;
  const histFresh = hist && Date.now() - hist.at < 6 * 3600e3;
  const [spot, intra, h] = await Promise.all([
    P.spot(f), P.intraday(f), histFresh ? Promise.resolve(null) : P.history(f).catch(() => null),
  ]);
  if (h) { hist = { at: Date.now(), ...h }; if (useCache) store.set('kpx_hist', hist); }
  return { source: P.nama, spot: spot.price, spotAt: spot.at, state: spot.state, points: intra.points, daily: hist ? hist.daily : [], stats: hist ? hist.stats : {} };
}
// Data pendukung dari server GitHub (diperbarui tiap jam oleh Actions), satu origin dengan aplikasi:
// candle H1/M15 asli, makro, kalender, kalibrasi backtest, kinerja live, berita, analisis Claude.
// market.json format 2: candle ringkas [t,o,h,l,c] → objek untuk mesin analisis.
export function expandMarket(m) {
  if (!m || m.format !== 2) return m;
  const C = a => (a || []).map(([t, o, h, l, c]) => ({ t, o, h, l, c }));
  return { ...m, h1: C(m.h1), m15: C(m.m15), daily: (m.daily || []).map(([d, c, h, l]) => ({ d, c, h: h ?? c, l: l ?? c })),
    macro: { dxy: (m.macro?.dxy || []).map(([d, c]) => ({ d, c })), ry: (m.macro?.ry || []).map(([d, v]) => ({ d, v })), y10: [] } };
}
export const SERVER_FILES = { market: 'market.json', calib: 'kalibrasi.json', kinerja: 'kinerja.json', news: 'berita.json', claude: 'analisis-claude.json' };
export async function loadServer({ base = 'data/', key = 'XAUUSD', f = (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null) } = {}) {
  const get = async name => { try { const r = await f(base + name, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } };
  const ent = await Promise.all(Object.entries(SERVER_FILES).map(async ([k, n]) => [k, await get(n)]));
  const out = Object.fromEntries(ent);
  for (const [k, v] of ent) { const sk = `kpx_srv_${key}_${k}`; if (v) store.set(sk, v); else out[k] = store.get(sk); }
  out.market = expandMarket(out.market);
  return out;
}
export async function loadSpot({ provider = 'xaus', symbol, fallback, f = fetch.bind(globalThis) } = {}) {
  try { return await PROVIDERS[provider].spot(f, symbol); }
  catch (e) { if (provider === 'htx' && fallback) return PROVIDERS.kraken.spot(f, fallback); throw e; }
}
