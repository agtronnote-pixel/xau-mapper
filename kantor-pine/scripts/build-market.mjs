// GitHub Actions: kumpulkan data pasar server → app/data/market.json (ringkas, untuk HP)
// dan .cache/market-full.json (lengkap, untuk backtest & penilaian arsip; tidak di-commit).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchServerMarket, appMarket, expandMarket, sameCandles } from './market.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appFile = join(root, 'app', 'data', 'market.json');
let raw = null; try { raw = JSON.parse(readFileSync(appFile, 'utf8')); } catch {}
const prev = expandMarket(raw);
const full = await fetchServerMarket(prev);
mkdirSync(join(root, '.cache'), { recursive: true });
writeFileSync(join(root, '.cache', 'market-full.json'), JSON.stringify(full));
const am = appMarket(full);
if (!sameCandles(am, raw)) writeFileSync(appFile, JSON.stringify(am)); else console.log('candle emas tidak berubah — market.json tidak ditulis ulang');
console.log('status sumber:', full.status);
console.log(`offset futures→spot ${full.offset} (${full.offset_sampel} sampel${full.offset_lama ? ', nilai lama' : ''}) · H1 ${full.h1.length} · M15 ${full.m15.length} · DXY ${full.macro.dxy.length} · yield riil ${full.macro.ry.length} · kalender ${full.calendar.length}`);
if (!full.h1.length) { console.error('Tidak ada candle H1 sama sekali'); process.exit(1); }
