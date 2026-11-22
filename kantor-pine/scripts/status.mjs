// GitHub Actions (langkah terakhir): ringkasan kesehatan sistem → app/data/status.json
// + ringkasan di halaman run GitHub. Aplikasi memakainya untuk memperingatkan data yang terlambat.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const data = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'data');
const read = f => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const umurMenit = iso => iso ? Math.round((Date.now() - Date.parse(iso)) / 60000) : null;
const aset = read(join(data, 'aset.json'));
const ids = ['XAUUSD', ...(aset?.aktif || [])];
const rows = ids.map(id => {
  const dir = id === 'XAUUSD' ? data : join(data, 'aset', id);
  const L = read(join(dir, 'latest.json')), M = read(join(dir, 'market.json')), K = read(join(dir, 'kalibrasi.json')), B = read(join(dir, 'berita.json'));
  const gagal = Object.entries(M?.status || {}).filter(([, v]) => String(v).startsWith('gagal')).map(([k]) => k);
  const umur = umurMenit(L?.basis?.dibuat), tutup = L?.mode === 'akhir-pekan';
  const ok = umur != null && umur <= (tutup ? 7 * 60 : 150) && L?.kualitas?.basi !== 2 && !gagal.includes('h1');
  return { id, ok, mode: L?.mode || null, mapping_umur_menit: umur, data_basi: L?.kualitas?.basi ?? null, keputusan: L?.narasi?.aksi || null,
    kalibrasi_umur_jam: K?.dibuat ? Math.round(umurMenit(K.dibuat) / 60) : null, berita_umur_menit: umurMenit(B?.dibuat), sumber_gagal: gagal };
});
const res = { dibuat: new Date().toISOString(), semua_ok: rows.every(r => r.ok), aset: rows };
writeFileSync(join(data, 'status.json'), JSON.stringify(res));
const md = ['## Kantor Pine — kesehatan sistem', '', '| Aset | Status | Mapping | Keputusan | Kalibrasi | Sumber gagal |', '|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.id} | ${r.ok ? '✅' : '⚠️'} | ${r.mapping_umur_menit ?? '–'} mnt${r.mode === 'akhir-pekan' ? ' (tutup)' : ''} | ${r.keputusan || '–'} | ${r.kalibrasi_umur_jam ?? '–'} jam | ${r.sumber_gagal.join(', ') || '–'} |`)].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log(md);
if (!res.semua_ok) console.log('::warning::Ada aset dengan data terlambat atau sumber gagal — lihat tabel di atas.');
