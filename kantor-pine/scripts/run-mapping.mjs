// GitHub Actions: jalankan tim agent dengan data lengkap, lalu tulis hasilnya untuk
// aplikasi (data/latest.json), MT5 (ea/), dan arsip penilaian (data/arsip/YYYY-MM.jsonl).
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../app/engine.js';
import { buildEA, buildPine, mapSummary } from '../app/exporters.js';
import { asetCtx } from './lib-stats.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), app = join(root, 'app'), A = asetCtx(root), D = A.out;
const read = f => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const M = read(A.cache);
if (!M) { console.error(`${A.cache} tidak ada — jalankan build-market/build-crypto dulu`); process.exit(1); }
const extra = { news: read(join(D, 'berita.json')), claude: A.id === 'XAUUSD' ? read(join(app, 'data', 'analisis-claude.json')) : null,
  calib: read(join(D, 'kalibrasi.json')), kinerja: read(join(D, 'kinerja.json')), profil: M.profil || undefined };
const r = analyze({ points: M.points, spot: M.spot ?? undefined, h1: M.h1, m15: M.m15, daily: M.daily, macro: M.macro, calendar: M.calendar, now: new Date(), ...extra });
r.sumber_harga = A.id === 'XAUUSD' ? `${M.spot != null ? 'xaus.com' : 'Yahoo GC=F (disesuaikan ke spot)'} · server GitHub` : `${M.sumber || 'binance'} · server GitHub`;
r.basis.live = false;
mkdirSync(join(D, 'arsip'), { recursive: true }); mkdirSync(join(app, 'ea'), { recursive: true });
writeFileSync(join(D, 'latest.json'), JSON.stringify(r));
const ea = buildEA(r); if (ea) writeFileSync(join(app, 'ea', `${A.ea}.mq5`), ea);
writeFileSync(join(app, 'ea', `${A.ea}.pine`), buildPine(r).code);
writeFileSync(join(D, 'latest.txt'), mapSummary(r));
// arsip: hanya saat pasar buka & data segar, supaya penilaian live jujur
if (r.mode === 'live' && r.kualitas.basi === 0 && r.rencana.length) {
  const rec = { t: r.basis.dibuat, p: r.basis.price, bias: r.bias, S: r.skor, conf: r.keyakinan, engine: r.engine,
    agents: Object.fromEntries(r.agents.filter(a => a.cukup !== undefined).map(a => [a.id, a.cukup ? +a.skor.toFixed(3) : null])),
    plans: r.rencana.map(p => ({ tipe: p.tipe, prioritas: p.prioritas, eb: p.entry_bawah, ea: p.entry_atas, sl: p.sl, tp1: p.tp1, tp2: p.tp2, k: p.kekuatan, pel: p.peluang, menit: p.berlaku_menit })) };
  appendFileSync(join(D, 'arsip', `${r.basis.dibuat.slice(0, 7)}.jsonl`), JSON.stringify(rec) + '\n');
}
console.log(`[${A.id}]`, r.narasi.aksi, '—', r.narasi.judul, '| kekuatan', r.kekuatan_sinyal, 'peluang', r.peluang_sinyal);
console.log('kualitas data:', JSON.stringify(r.kualitas));
