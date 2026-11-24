// =====================================================================
//  Kantor Pine — sumber data OANDA (REST v20), untuk emas, forex & indeks.
//  Butuh token pribadi (gratis dari akun demo OANDA). Token TIDAK pernah ada di
//  aplikasi HP: dipakai di server GitHub (secret OANDA_TOKEN) dan di Kantor lokal
//  di PC (file KPX_Tools\KPX_OANDA.txt). Kripto tetap Binance/HTX.
// =====================================================================
export const OANDA_INSTR = { XAUUSD: 'XAU_USD', GBPUSD: 'GBP_USD', USA100: 'NAS100_USD', SNP500: 'SPX500_USD' };
const HOST = env => env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';

async function call(cfg, path, f = fetch) {
  const r = await f(HOST(cfg.env) + path, { headers: { Authorization: `Bearer ${cfg.token}`, 'Accept-Datetime-Format': 'UNIX' }, signal: AbortSignal.timeout(15000) });
  if (r.status === 401 || r.status === 403) throw new Error(`OANDA menolak token (HTTP ${r.status}) — cek token & jenis akun (practice/live)`);
  if (!r.ok) throw new Error(`OANDA HTTP ${r.status}`);
  return r.json();
}
// Candle harga tengah (mid). Hanya candle yang sudah selesai, kecuali withLast = true.
export async function oandaCandles(cfg, id, gran, count, { withLast = false, f } = {}) {
  const ins = OANDA_INSTR[id]; if (!ins) throw new Error(`${id} tidak ada di OANDA`);
  const j = await call(cfg, `/v3/instruments/${ins}/candles?price=M&granularity=${gran}&count=${Math.min(count, 5000)}`, f);
  return (j.candles || []).filter(c => c.mid && (c.complete || withLast)).map(c => ({ t: Math.floor(+c.time), o: +c.mid.o, h: +c.mid.h, l: +c.mid.l, c: +c.mid.c }));
}
// Harga terkini: candle 5 detik yang sedang berjalan (tanpa perlu nomor akun).
export async function oandaPrice(cfg, id, f) {
  const c = await oandaCandles(cfg, id, 'S5', 2, { withLast: true, f });
  if (!c.length) throw new Error('OANDA: harga tidak tersedia (pasar tutup?)');
  const last = c[c.length - 1];
  return { price: last.c, at: (last.t + 5) * 1000 };
}
// Satu paket data untuk mesin analisis: H1, M15, harian, titik 5 menit, harga terkini.
export async function oandaMarket(cfg, id, { h1 = 3000, m15 = 5000, d1 = 500 } = {}) {
  const [H1, M15, D1, M5] = await Promise.all([oandaCandles(cfg, id, 'H1', h1), oandaCandles(cfg, id, 'M15', m15), oandaCandles(cfg, id, 'D', d1), oandaCandles(cfg, id, 'M5', 170, { withLast: true })]);
  const last = M5.length ? M5[M5.length - 1] : H1[H1.length - 1];
  return {
    h1: H1, m15: M15, daily: D1.map(c => ({ d: new Date((c.t + 6 * 3600) * 1000).toISOString().slice(0, 10), c: c.c, h: c.h, l: c.l })),
    points: M5.map(c => ({ t: c.t + 300, p: c.c })), spot: last ? last.c : null, spotAt: last ? new Date((last.t + 300) * 1000).toISOString() : null,
  };
}
export const oandaCfgFromEnv = () => process.env.OANDA_TOKEN ? { token: process.env.OANDA_TOKEN.trim(), env: (process.env.OANDA_ENV || 'practice').trim().toLowerCase() } : null;
