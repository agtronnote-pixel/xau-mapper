// =====================================================================
//  Kantor Pine XAUUSD — Lapisan data harga (tanpa API key)
//  Sumber utama: xaus.com (CORS terbuka, gratis untuk pemakaian wajar).
//  - spot      : harga XAU/USD terkini (cache sumber 60 detik)
//  - intraday  : titik harga tiap 5 menit, sampai 48 jam
//  - history   : candle harian (close/high/low), sampai 1 tahun
//  Struktur provider dibuat agar sumber lain mudah ditambahkan nanti.
// =====================================================================

export const PROVIDERS = {
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
export async function loadMarket({ provider = 'xaus', f = (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null), useCache = typeof localStorage !== 'undefined' } = {}) {
  const P = PROVIDERS[provider];
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
export const SERVER_FILES = { market: 'market.json', calib: 'kalibrasi.json', kinerja: 'kinerja.json', news: 'berita.json', claude: 'analisis-claude.json' };
export async function loadServer({ base = 'data/', f = (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null) } = {}) {
  const get = async name => { try { const r = await f(base + name, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } };
  const ent = await Promise.all(Object.entries(SERVER_FILES).map(async ([k, n]) => [k, await get(n)]));
  const out = Object.fromEntries(ent);
  for (const [k, v] of ent) { if (v) store.set('kpx_srv_' + k, v); else out[k] = store.get('kpx_srv_' + k); }
  return out;
}
export async function loadSpot({ provider = 'xaus', f = fetch.bind(globalThis) } = {}) {
  return PROVIDERS[provider].spot(f);
}
