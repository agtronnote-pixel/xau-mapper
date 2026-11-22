// Statistik bersama untuk backtest (kalibrasi) dan penilaian arsip live.
import { nyDayKey } from '../app/engine.js';
export const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
export function quantile(a, q) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }
export function corr(x, y) {
  const n = x.length; if (n < 10) return null;
  const mx = mean(x), my = mean(y); let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; }
  return b && c ? a / Math.sqrt(b * c) : null;
}
// Rencana yang sama (arah + zona) yang muncul berulang di mapping per jam dihitung sekali per hari.
export function dedupe(items) {
  const seen = new Set();
  return items.filter(x => { const k = `${nyDayKey(x.t)}|${x.tipe}|${Math.round(x.mid)}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
export function summarize(res) {
  const done = res.filter(x => x.ev && x.ev.tersentuh && !x.ev.terbuka);
  const win = done.filter(x => x.ev.hasil === 'TP1' || x.ev.hasil === 'TP2').length;
  return { rencana: res.length, tersentuh: done.length, tp1: win, sl: done.filter(x => x.ev.hasil === 'SL').length,
    winrate: done.length ? +(win / done.length).toFixed(3) : 0, ekspektasi_R: done.length ? +mean(done.map(x => x.ev.R)).toFixed(3) : 0 };
}
// Lokasi file per aset. Tanpa --aset = emas (lokasi lama, tetap kompatibel).
import { join } from 'node:path';
export function asetCtx(root, argv = process.argv) {
  const i = argv.indexOf('--aset'), id = i > 0 ? argv[i + 1] : null;
  return id ? { id, cache: join(root, '.cache', `${id}-full.json`), out: join(root, 'app', 'data', 'aset', id), ea: `KPX_${id}_latest` }
            : { id: 'XAUUSD', cache: join(root, '.cache', 'market-full.json'), out: join(root, 'app', 'data'), ea: 'KPX_Mapping_latest' };
}
