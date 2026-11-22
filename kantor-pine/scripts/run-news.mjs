// Dijalankan oleh GitHub Actions: kumpulkan judul berita dari RSS publik, beri skor sentimen.
//  tanpa argumen      → emas  → app/data/berita.json
//  --aset BTCUSD --nama Bitcoin → kripto → app/data/aset/BTCUSD/berita.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed, aggregateNews, LEXICON_CRYPTO } from './news.js';

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const aset = arg('--aset'), nama = arg('--nama') || aset;
const gn = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:1d&hl=en-US&gl=US&ceid=US:en`;
const base = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'data');
let FEEDS, out, opt = {};
if (aset) {
  const koin = aset.replace(/USD$/, '');
  FEEDS = [['Google News', gn(`${nama} price OR ${koin} crypto`)], ['Google News', gn(`crypto market bitcoin ETF`)]];
  out = join(base, 'aset', aset);
  const kata = [nama, koin].filter(Boolean).map(x => x.replace(/[^a-z0-9]/gi, '')).join('|');
  opt = { lex: LEXICON_CRYPTO, nama, relevan: new RegExp(`${kata}|crypto|bitcoin|btc|etf|fed|stablecoin|sec\\b`, 'i') };
} else {
  FEEDS = [
    ['Google News', gn('gold price OR XAUUSD')],
    ['Google News', gn('Fed dollar treasury yields')],
    ['Yahoo Finance', 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=GC=F&region=US&lang=en-US'],
  ];
  out = base;
}
const items = [], status = [];
for (const [n, url] of FEEDS) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'KantorPine/3 (+github actions)' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const got = parseFeed(await r.text(), n); items.push(...got); status.push(`${n}: ${got.length}`);
  } catch (e) { status.push(`${n}: gagal (${e.message})`); }
}
const res = aggregateNews(items, Date.now(), 36, opt);
res.sumber_status = status;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'berita.json'), JSON.stringify(res));
console.log(`[${aset || 'XAUUSD'}]`, status.join(' | '), `→ skor ${res.skor} (${res.label}) dari ${res.bermakna}/${res.jumlah} berita`);
