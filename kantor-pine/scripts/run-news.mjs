// Dijalankan oleh GitHub Actions: kumpulkan judul berita emas dari RSS publik,
// beri skor sentimen, tulis app/data/berita.json untuk aplikasi.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed, aggregateNews } from './news.js';

const FEEDS = [
  ['Google News', 'https://news.google.com/rss/search?q=gold+price+OR+XAUUSD+when:1d&hl=en-US&gl=US&ceid=US:en'],
  ['Google News', 'https://news.google.com/rss/search?q=Fed+dollar+treasury+yields+when:1d&hl=en-US&gl=US&ceid=US:en'],
  ['FXStreet', 'https://www.fxstreet.com/rss/news'],
  ['Yahoo Finance', 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=GC=F&region=US&lang=en-US'],
];

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'data');
const items = [], status = [];
for (const [nama, url] of FEEDS) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'KantorPine/2 (+github actions)' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const got = parseFeed(await r.text(), nama); items.push(...got); status.push(`${nama}: ${got.length}`);
  } catch (e) { status.push(`${nama}: gagal (${e.message})`); }
}
const res = aggregateNews(items);
res.sumber_status = status;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'berita.json'), JSON.stringify(res));
console.log(status.join(' | '));
console.log(`Skor ${res.skor} (${res.label}) dari ${res.bermakna}/${res.jumlah} berita`);
res.berita.slice(0, 6).forEach(b => console.log(` ${b.skor >= 0 ? '+' : ''}${b.skor}  ${b.judul}`));
