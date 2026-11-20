// Dijalankan oleh GitHub Actions: ambil data pasar, jalankan tim agent,
// lalu tulis hasilnya untuk aplikasi (data/latest.json) dan MT5 (ea/).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../app/engine.js';
import { loadMarket } from '../app/data.js';
import { buildEA, buildPine, mapSummary } from '../app/exporters.js';

const app = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const m = await loadMarket({ f: fetch, useCache: false });
const r = analyze({ points: m.points, daily: m.daily, spot: m.spot, now: new Date() });
r.sumber_harga = `${m.source} · server GitHub`;
r.basis.live = false;
mkdirSync(join(app, 'data'), { recursive: true }); mkdirSync(join(app, 'ea'), { recursive: true });
writeFileSync(join(app, 'data', 'latest.json'), JSON.stringify(r));
const ea = buildEA(r); if (ea) writeFileSync(join(app, 'ea', 'KPX_Mapping_latest.mq5'), ea);
writeFileSync(join(app, 'ea', 'KPX_Mapping_latest.pine'), buildPine(r).code);
writeFileSync(join(app, 'data', 'latest.txt'), mapSummary(r));
console.log(mapSummary(r));
