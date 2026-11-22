// GitHub Actions: nilai mapping live yang sudah diarsipkan dengan harga sesudahnya
// → app/data/kinerja.json (rekam jejak jujur, diperbarui tiap jam).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePlan } from '../app/engine.js';
import { dedupe, summarize } from './lib-stats.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dir = join(root, 'app', 'data', 'arsip');
const M = JSON.parse(readFileSync(join(root, '.cache', 'market-full.json'), 'utf8'));
let files = []; try { files = readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort().slice(-3); } catch {}
const recs = files.flatMap(f => readFileSync(join(dir, f), 'utf8').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
const bars = M.m15.length ? M.m15 : M.h1, lastT = bars.length ? bars[bars.length - 1].t + (M.m15.length ? 900 : 3600) : 0;
const items = [];
for (const r of recs) {
  const t = Math.floor(Date.parse(r.t) / 1000);
  for (const p of r.plans) {
    const pl = { tipe: p.tipe, entry_bawah: p.eb, entry_atas: p.ea, sl: p.sl, tp1: p.tp1, tp2: p.tp2, berlaku_menit: p.menit };
    let ev = t >= bars[0]?.t ? evaluatePlan(pl, bars, t) : null;
    if (ev?.terbuka && lastT < t + (p.menit + 16 * 60) * 60) ev = { ...ev, belum_selesai: true };
    items.push({ t, tipe: p.tipe, mid: (p.eb + p.ea) / 2, kekuatan: p.k, prioritas: p.prioritas, plan: p, ev });
  }
}
const uniq = dedupe(items), now = Date.now() / 1000;
const win = d => summarize(uniq.filter(x => x.t >= now - d * 86400 && !x.ev?.belum_selesai));
const res = {
  dibuat: new Date().toISOString(), mapping_diarsip: recs.length, rencana_unik: uniq.length,
  d7: win(7), d30: win(30),
  terakhir: uniq.filter(x => x.ev && x.ev.tersentuh && !x.ev.terbuka).slice(-8).reverse().map(x => ({ t: new Date(x.t * 1000).toISOString(), tipe: x.tipe, entry: `${x.plan.eb}–${x.plan.ea}`, kekuatan: x.kekuatan, hasil: x.ev.hasil, R: x.ev.R })),
  catatan: 'Rencana yang sama di mapping per jam dihitung sekali per hari. Entry = harga menyentuh zona; SL & TP di candle yang sama dihitung SL.',
};
writeFileSync(join(root, 'app', 'data', 'kinerja.json'), JSON.stringify(res));
console.log('kinerja live:', JSON.stringify({ arsip: recs.length, d7: res.d7, d30: res.d30 }));
