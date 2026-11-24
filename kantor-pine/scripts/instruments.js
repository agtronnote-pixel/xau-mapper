// =====================================================================
//  Forex & indeks (GitHub Actions) — Yahoo Finance, gratis tanpa key.
//  GBPUSD: GBPUSD=X (harga live di HP dari Kraken).
//  USA100 / SNP500: futures Nasdaq 100 (NQ=F) & S&P 500 (ES=F) — jam perdagangannya
//  sama dengan CFD indeks di broker; selisih harga ke broker dikoreksi otomatis oleh EA.
//  Indeks tidak punya sumber harga live gratis yang bisa dibaca dari HP → data server per jam.
// =====================================================================
import { PRESETS } from '../app/engine.js';
import { yahooCandles } from './market.js';
import { oandaMarket, oandaCfgFromEnv } from '../app/oanda.js';

export const YAHOO = {
  GBPUSD: { yahoo: 'GBPUSD=X', live: { provider: 'kraken', symbol: 'GBPUSD' }, berita: ['GBP USD pound sterling', 'Bank of England rates'] },
  USA100: { yahoo: 'NQ=F', live: { provider: 'server' }, berita: ['Nasdaq 100 stocks', 'tech stocks Fed'] },
  SNP500: { yahoo: 'ES=F', live: { provider: 'server' }, berita: ['S&P 500 stocks', 'Wall Street stocks Fed'] },
};
export async function fetchYahooInstrument(id, shared = {}) {
  const y = YAHOO[id]; if (!y) throw new Error(`instrumen ${id} tidak dikenal`);
  const status = {};
  // OANDA bila token tersedia: harga CFD asli (sama jenisnya dengan broker MT5), bukan futures
  const oc = oandaCfgFromEnv();
  if (oc) {
    try {
      const o = await oandaMarket(oc, id);
      if (o.h1.length >= 200) return { dibuat: new Date().toISOString(), status: { h1: 'oanda', m15: 'oanda', d1: 'oanda', m5: 'oanda' }, profil: PRESETS[id], sumber: 'oanda', live: y.live,
        h1: o.h1, m15: o.m15, daily: o.daily, points: o.points.slice(-168), spot: o.spot,
        macro: shared.macro || { dxy: [], ry: [], y10: [] }, calendar: shared.calendar || [], offset: 0, offset_sampel: 0 };
      status.oanda = `gagal: H1 hanya ${o.h1.length}`;
    } catch (e) { status.oanda = 'gagal: ' + e.message.slice(0, 80); }
  }
  const get = async (k, iv, rg) => { try { const c = await yahooCandles(y.yahoo, iv, rg); status[k] = 'yahoo'; return c; } catch (e) { status[k] = 'gagal: ' + e.message.slice(0, 60); return []; } };
  const [h1, m15, d1, m5] = await Promise.all([get('h1', '60m', '60d'), get('m15', '15m', '60d'), get('d1', '1d', '2y'), get('m5', '5m', '1d')]);
  const spot = m5.length ? m5[m5.length - 1].c : h1.length ? h1[h1.length - 1].c : null;
  return {
    dibuat: new Date().toISOString(), status, profil: PRESETS[id], sumber: 'yahoo', live: y.live,
    h1, m15: m15.slice(-2880), daily: d1.map(c => ({ d: new Date(c.t * 1000).toISOString().slice(0, 10), c: c.c, h: c.h, l: c.l })),
    points: m5.slice(-168).map(c => ({ t: c.t + 300, p: c.c })), spot,
    macro: shared.macro || { dxy: [], ry: [], y10: [] }, calendar: shared.calendar || [], offset: 0, offset_sampel: 0,
  };
}
