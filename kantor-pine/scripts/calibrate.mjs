// =====================================================================
//  Backtest walk-forward & kalibrasi (GitHub Actions, sekali sehari).
//  Menjalankan mesin di setiap jam pada data 60 hari terakhir seolah-olah
//  waktu itu "sekarang" (tanpa melihat masa depan), lalu menilai hasilnya:
//   - bobot agent  : dari korelasi skor agent dengan gerak harga 4 jam berikutnya
//                    (dipelajari di 60% data awal; 40% sisanya untuk uji jujur)
//   - peluang      : tingkat TP1-sebelum-SL per rentang kekuatan sinyal
//   - proyeksi     : koefisien drift & rentang 80% per horizon
//   - sesi, arah   : statistik pendukung
//  Keluaran: app/data/kalibrasi.json
// =====================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, evaluatePlan, marketOpen, sessionOf, HZ, PRIOR_WEIGHTS, DIR_AGENTS } from '../app/engine.js';
import { mean, quantile, corr, dedupe, summarize } from './lib-stats.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'app', 'data', 'kalibrasi.json');

export function backtest(M, { bobot = null, step = 3600, maxRuns = Infinity } = {}) {
  const { h1, m15 } = M; if (h1.length < 150) throw new Error('Candle H1 kurang untuk backtest');
  const m15Start = m15.length ? m15[0].t : Infinity;
  const closeAt = t => { // harga close terakhir pada waktu t
    const src = t >= m15Start + 900 ? m15 : h1, size = src === m15 ? 900 : 3600;
    let lo = 0, hi = src.length - 1, ans = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (src[mid].t + size <= t) { ans = src[mid]; lo = mid + 1; } else hi = mid - 1; }
    return ans ? ans.c : null;
  };
  const runs = [];
  const start = h1[120].t + 3600, end = h1[h1.length - 1].t + 3600 - 24 * 3600;
  let i0 = 0, j0 = 0;
  for (let T = Math.ceil(start / step) * step; T <= end && runs.length < maxRuns; T += step) {
    const now = new Date(T * 1000);
    if (!marketOpen(now) || !marketOpen(new Date((T - 3600) * 1000))) continue;
    while (i0 < h1.length && h1[i0].t + 3600 <= T) i0++;
    while (j0 < m15.length && m15[j0].t + 900 <= T) j0++;
    const H = h1.slice(Math.max(0, i0 - 300), i0), Q = m15.slice(Math.max(0, j0 - 200), j0);
    if (H.length < 120) continue;
    const price = (Q.length && Q[Q.length - 1].t + 900 >= T - 900 ? Q[Q.length - 1] : H[H.length - 1]).c;
    const day = now.toISOString().slice(0, 10);
    let r; try {
      r = analyze({ h1: H, m15: Q, points: [], spot: price, now, daily: M.daily.filter(x => x.d < day), macro: M.macro,
        calib: bobot ? { bobot } : null });
    } catch { continue; }
    const atrH = r.statistik.atrH1, fwd = {};
    for (const h of HZ.filter(h => h >= 15)) { const c = closeAt(T + h * 60); if (c != null && T + h * 60 <= h1[h1.length - 1].t + 3600) fwd[h] = (c - price) / atrH; }
    const bars = T >= m15Start ? m15 : h1;
    const lo = bars.findIndex(b => b.t >= T), seg = lo < 0 ? [] : bars.slice(lo, lo + (bars === m15 ? 24 * 4 * 2 : 48));
    const plans = r.rencana.map(pl => ({ t: T, tipe: pl.tipe, mid: (pl.entry_bawah + pl.entry_atas) / 2, kekuatan: pl.kekuatan, ev: evaluatePlan(pl, seg, T) }));
    runs.push({ T, S: r.skor, agents: Object.fromEntries(r.agents.filter(a => DIR_AGENTS.includes(a.id)).map(a => [a.id, a.cukup ? a.skor : null])), fwd, plans });
  }
  return runs;
}

function fitWeights(runs) {
  const w = { ...PRIOR_WEIGHTS }, ic = {};
  for (const id of ['trend', 'momentum', 'structure', 'macro']) {
    const xs = [], ys = [];
    runs.forEach(r => { if (r.agents[id] != null && r.fwd[240] != null) { xs.push(r.agents[id]); ys.push(r.fwd[240]); } });
    const c = corr(xs, ys); ic[id] = { ic: c == null ? null : +c.toFixed(3), n: xs.length };
    if (c != null && xs.length >= 100) w[id] = +(PRIOR_WEIGHTS[id] * Math.min(1.75, Math.max(0.25, 1 + 4 * c))).toFixed(3);
  }
  const sum = Object.values(w).reduce((a, b) => a + b, 0), target = Object.values(PRIOR_WEIGHTS).reduce((a, b) => a + b, 0);
  Object.keys(w).forEach(k => { w[k] = +(w[k] * target / sum).toFixed(3); });
  return { w, ic };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let fresh = false;
  try { const old = JSON.parse(readFileSync(out, 'utf8')); fresh = old.versi === 3 && Date.now() - Date.parse(old.dibuat) < 20 * 3600e3; } catch {}
  if (fresh && !process.argv.includes('--force')) { console.log('Kalibrasi masih baru (< 20 jam), dilewati.'); process.exit(0); }
  const M = JSON.parse(readFileSync(join(root, '.cache', 'market-full.json'), 'utf8'));
  const t0 = Date.now();
  const all1 = backtest(M);
  if (all1.length < 120) { console.log(`Sampel backtest terlalu sedikit (${all1.length}), kalibrasi dilewati.`); process.exit(0); }
  const split = Math.floor(all1.length * 0.6), splitT = all1[split].T;
  const { w, ic } = fitWeights(all1.slice(0, split));
  const runs = backtest(M, { bobot: w });
  const plans = dedupe(runs.flatMap(r => r.plans));
  const oos = plans.filter(p => p.t >= splitT);

  const edges = [5, 40, 50, 60, 70, 96], kekuatan = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const g = plans.filter(p => p.kekuatan >= edges[i] && p.kekuatan < edges[i + 1]), s = summarize(g);
    kekuatan.push({ dari: edges[i], sampai: edges[i + 1], n: s.tersentuh, peluang: +((s.tp1 + 5) / (s.tersentuh + 10)).toFixed(3), ekspektasi_R: s.ekspektasi_R });
  }
  const sesi = {};
  for (const id of ['asia', 'london', 'overlap', 'ny', 'sepi']) {
    const g = plans.filter(p => p.ev?.t_entry && sessionOf(new Date(p.ev.t_entry * 1000)) === id), s = summarize(g);
    if (s.tersentuh) sesi[id] = { n: s.tersentuh, peluang: +((s.tp1 + 5) / (s.tersentuh + 10)).toFixed(3), ekspektasi_R: s.ekspektasi_R };
  }
  const proyeksi = {};
  for (const h of HZ) {
    const xs = [], ys = []; runs.forEach(r => { if (r.fwd[h] != null) { xs.push(r.S); ys.push(r.fwd[h]); } });
    if (xs.length < 60) continue;
    const sxx = xs.reduce((a, x) => a + x * x, 0), k = sxx ? xs.reduce((a, x, i) => a + x * ys[i], 0) / sxx : 0;
    proyeksi[h] = { k: +k.toFixed(3), q80: +quantile(ys.map((y, i) => Math.abs(y - k * xs[i])), 0.8).toFixed(3), n: xs.length };
  }
  const arahOf = h => { const g = runs.filter(r => Math.abs(r.S) > 0.15 && r.fwd[h]); return { hit: g.length ? g.filter(r => Math.sign(r.S) === Math.sign(r.fwd[h])).length / g.length : null, n: g.length }; };
  const a1 = arahOf(60), a4 = arahOf(240);
  const dt = s => new Date(s * 1000).toISOString().slice(0, 10);
  const res = {
    versi: 3, dibuat: new Date().toISOString(), periode: `${dt(runs[0].T)} – ${dt(runs[runs.length - 1].T)}`, sampel_jam: runs.length,
    bobot: w, ic, kekuatan, sesi, proyeksi,
    arah: { h1: +(a1.hit ?? 0).toFixed(3), h4: +(a4.hit ?? 0).toFixed(3), n: a4.n },
    rencana: { ...summarize(plans), oos: summarize(oos) },
    catatan: 'Bobot dipelajari dari 60% data awal; angka "oos" diuji pada 40% data terakhir yang tidak dipakai kalibrasi. Entry dihitung saat harga menyentuh zona (tanpa syarat candle konfirmasi); bila SL & TP tersentuh di candle yang sama dianggap SL.',
  };
  writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(`Backtest ${runs.length} jam, ${plans.length} rencana unik, ${((Date.now() - t0) / 1000).toFixed(1)} dtk`);
  console.log('bobot:', w, 'ic:', ic);
  console.log('rencana:', res.rencana);
  console.log('kekuatan:', kekuatan);
  console.log('arah:', res.arah, 'sesi:', sesi);
}
