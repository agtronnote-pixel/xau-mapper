// GitHub Actions: peringkat volatilitas harian → app/data/aset.json (5 aset 24/7 paling volatil),
// lalu data pasar tiap aset → app/data/aset/<ID>/market.json + .cache/<ID>-full.json.
// Makro & kalender diambil dari .cache/market-full.json (build-market.mjs jalan lebih dulu).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankUniverse, fetchCryptoMarket, UNIVERSE, TETAP, liveSource } from './crypto.js';
import { appMarket } from './market.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), data = join(root, 'app', 'data');
const read = f => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const prev = read(join(data, 'aset.json')), gold = read(join(root, '.cache', 'market-full.json')) || {};
let daftar = prev?.daftar || [];
for (const id of TETAP) if (!daftar.some(a => a.id === id)) { const u = UNIVERSE.find(x => x[0] === id); daftar.push({ id, nama: u[1], tetap: true, live: liveSource(u) }); }
const perluRank = !prev || Date.now() - Date.parse(prev.diperingkat || 0) > 20 * 3600e3 || process.argv.includes('--rank');
if (perluRank) {
  const { ranked, top, gagal } = await rankUniverse((prev?.daftar || []).map(x => x.id));
  if (top.length >= 3) daftar = top.map(x => ({ id: x.id, nama: x.nama, vol30: x.vol30, atr_pct: x.atr_pct, tetap: !!x.tetap, live: liveSource(UNIVERSE.find(u => u[0] === x.id)) }));
  var peringkat = ranked, catatanGagal = gagal;
  console.log('peringkat volatilitas 30 hari:', ranked.map(x => `${x.id} ${x.vol30}%`).join(' · '), gagal.length ? `| gagal: ${gagal.join(', ')}` : '');
}
mkdirSync(join(root, '.cache'), { recursive: true });
const ok = [];
for (const a of daftar) {
  try {
    const full = await fetchCryptoMarket(a.id, { macro: gold.macro, calendar: gold.calendar });
    if (full.h1.length < 200) throw new Error(`H1 hanya ${full.h1.length}`);
    writeFileSync(join(root, '.cache', `${a.id}-full.json`), JSON.stringify(full));
    mkdirSync(join(data, 'aset', a.id), { recursive: true });
    writeFileSync(join(data, 'aset', a.id, 'market.json'), JSON.stringify(appMarket(full)));
    a.harga = full.spot; a.digit = full.profil.digit; ok.push(a.id);
    console.log(`${a.id}: H1 ${full.h1.length} · M15 ${full.m15.length} · harian ${full.daily.length} · spot ${full.spot} · sumber`, full.status);
  } catch (e) { console.log(`${a.id}: gagal — ${e.message}`); }
}
writeFileSync(join(data, 'aset.json'), JSON.stringify({
  dibuat: new Date().toISOString(), diperingkat: perluRank ? new Date().toISOString() : prev.diperingkat,
  metode: '5 teratas menurut volatilitas terealisasi 30 hari (tahunan) dari 12 koin likuid yang umum tersedia di broker MT5, diperbarui sekali sehari (aset lama bertahan selama volatilitasnya ≥ 90% aset ke-5). Ditambah aset yang selalu dipantau: ' + TETAP.join(', ') + '.',
  daftar, peringkat: perluRank ? peringkat : prev?.peringkat || [], gagal: perluRank ? catatanGagal : prev?.gagal || [], aktif: ok,
}, null, 1));
console.log('aktif:', ok.join(', '));
