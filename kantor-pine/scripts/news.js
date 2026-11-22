// =====================================================================
//  Kantor Pine XAUUSD — Agent "Kabar": skor sentimen berita emas
//  Tanpa AI dan tanpa API key: judul berita dari RSS diberi skor dengan
//  kamus kata kunci. Ini penanda arah kasar, bukan pemahaman isi berita.
// =====================================================================

// Bobot positif = cenderung mendukung kenaikan emas, negatif = menekan emas.
export const LEXICON = [
  // kebijakan moneter & suku bunga
  [/rate[- ]cuts?|cut (bets|odds)|cut rates|dovish|easing|pivot|lower rates/i, 1.0],
  [/rate hikes?|hike rates|hike (bets|odds)|fed hike|hawkish|tighten(ing)?|higher for longer/i, -1.0],
  [/yields? (fall|drop|slide|decline|ease)|treasur(y|ies) rall/i, 0.7],
  [/yields? (rise|jump|climb|surge)|bond sell-?off/i, -0.7],
  // dolar
  [/dollar (weak|slump|fall|drop|slide|decline)|weaker dollar|greenback (falls|slides|weakens)/i, 0.8],
  [/dollar (strong|firm|rall|jump|gain|climb|surge)|stronger dollar|greenback (rises|gains|firms)/i, -0.8],
  // permintaan aset aman & geopolitik
  [/safe[- ]haven|geopolitic|\bwars?\b|conflict|attack|missile|escalat|sanction|tension|crisis|turmoil/i, 0.7],
  [/ceasefire|peace (deal|talks)|de-?escalat|truce|tensions ease/i, -0.6],
  [/central banks? (buy|purchas|add)|etf inflows?|record demand|strong demand/i, 0.6],
  [/etf outflows?|weak demand|demand falls/i, -0.6],
  // data ekonomi AS
  [/inflation (cools|eases|slows)|cpi (cools|eases|lower)|jobs? (miss|weak)|unemployment (rises|jumps)|recession/i, 0.6],
  [/inflation (hot|jumps|accelerat|rises)|strong jobs|jobs (beat|surge)|payrolls (beat|surge)|robust (growth|economy)/i, -0.6],
  // arah harga yang disebut langsung
  [/gold (rises|gains|jumps|climbs|rall|surges|soars|rebounds|hits record)/i, 0.5],
  [/gold (falls|drops|slides|slumps|declines|tumbles|plunges|sinks|retreats)/i, -0.5],
  [/worst week|lowest (level|since)|sell-?off|liquidation/i, -0.4],
];

export function scoreHeadline(title) {
  let s = 0; const hits = [];
  for (const [re, w] of LEXICON) { const m = title.match(re); if (m) { s += w; hits.push(m[0].toLowerCase()); } }
  return { skor: Math.max(-1.5, Math.min(1.5, s)), kata: hits };
}

// Pengurai RSS/Atom sederhana (tanpa dependensi).
export function parseFeed(xml, sumber) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
  const pick = (b, tag) => { const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')); return m ? m[1] : ''; };
  const clean = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  for (const b of blocks) {
    const judul = clean(pick(b, 'title'));
    let link = clean(pick(b, 'link')); if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); if (m) link = m[1]; }
    const waktu = Date.parse(clean(pick(b, 'pubDate') || pick(b, 'published') || pick(b, 'updated'))) || null;
    if (judul) items.push({ judul, link, waktu, sumber });
  }
  return items;
}

// Gabungkan berita: buang duplikat, hanya yang relevan dengan emas, beri bobot kebaruan.
export function aggregateNews(items, now = Date.now(), jamMaks = 36) {
  const seen = new Set(), out = [];
  for (const it of items) {
    const key = it.judul.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 80);
    if (seen.has(key)) continue; seen.add(key);
    if (!/gold|xau|bullion|precious metal|fed|dollar|treasur|yield|inflation|cpi|payroll|geopolit/i.test(it.judul)) continue;
    const umurJam = it.waktu ? (now - it.waktu) / 3600e3 : 12;
    if (umurJam > jamMaks || umurJam < -2) continue;
    const sc = scoreHeadline(it.judul);
    out.push({ ...it, ...sc, umurJam: Math.round(umurJam * 10) / 10, bobot: Math.exp(-Math.max(umurJam, 0) / 12) });
  }
  out.sort((a, b) => (a.umurJam - b.umurJam));
  const bermakna = out.filter(x => x.skor !== 0);
  const wsum = bermakna.reduce((s, x) => s + x.bobot, 0);
  const skor = wsum ? bermakna.reduce((s, x) => s + x.skor * x.bobot, 0) / wsum : 0;
  const s = Math.max(-1, Math.min(1, skor));
  return {
    dibuat: new Date(now).toISOString(), skor: Math.round(s * 100) / 100,
    label: s > 0.2 ? 'POSITIF untuk emas' : s < -0.2 ? 'NEGATIF untuk emas' : 'NETRAL',
    jumlah: out.length, bermakna: bermakna.length,
    berita: out.slice(0, 12).map(({ judul, link, sumber, umurJam, skor, kata }) => ({ judul, link, sumber, umurJam, skor, kata })),
    catatan: 'Skor dari kata kunci judul berita (tanpa AI). Penanda arah kasar; bisa salah membaca konteks.',
  };
}
