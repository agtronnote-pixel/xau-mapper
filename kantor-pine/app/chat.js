// =====================================================================
//  Kantor Pine — Tanya Kantor: tanya jawab dengan tim agent.
//  Tanpa API key: pertanyaan dikenali dari kata kuncinya, lalu agent yang
//  bertugas menjawab dari hasil analisis yang sedang berjalan (live).
// =====================================================================
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = v => v == null ? '–' : Math.round(v * 100) + '%';

export const SARAN = ['Sekarang buy atau sell?', 'Kenapa?', 'Di mana SL dan TP?', 'Kapan waktu terbaik entry?', 'Berita terbaru?', 'Berapa lot untuk modal saya?', 'Seberapa akurat sinyal ini?', 'Harga 4 jam lagi ke mana?'];

const has = (q, ...w) => w.some(x => q.includes(x));
const agentOf = (r, id) => (r.agents || []).find(a => a.id === id);
const sig = a => a.skor > 0.15 ? 'condong NAIK' : a.skor < -0.15 ? 'condong TURUN' : 'netral';
const say = (r, id, html) => { const a = agentOf(r, id); return { dari: a ? `${a.nama} · ${a.peran}` : 'Kantor', html }; };

// ctx: { map, asset, spot, news, settings, num(v), wib(Date), positionSize, contract, assets: [{id,nama}] }
export function answer(text, ctx) {
  const q = ' ' + String(text || '').toLowerCase().replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const r = ctx.map, n = ctx.num, A = ctx.asset;
  const out = [];

  // pindah aset: "emas", "btc", "xmr", ...
  const alias = { emas: 'XAUUSD', gold: 'XAUUSD', xau: 'XAUUSD', bitcoin: 'BTCUSD', btc: 'BTCUSD', monero: 'XMRUSD', xmr: 'XMRUSD', pound: 'GBPUSD', gbp: 'GBPUSD', nasdaq: 'USA100', 'us100': 'USA100', 'usa100': 'USA100', 'sp500': 'SNP500', 'snp500': 'SNP500', 'us500': 'SNP500' };
  for (const a of ctx.assets || []) alias[a.id.replace(/USD$/, '').toLowerCase()] = a.id;
  const pindah = Object.entries(alias).find(([k, v]) => v !== A && q.includes(' ' + k + ' '));
  if (pindah) return [{ dari: 'Kantor', html: `Pindah ke <b>${esc(pindah[1])}</b>… tanyakan lagi setelah analisisnya muncul.`, pindah: pindah[1] }];

  if (!r || !r.narasi) return [{ dari: 'Kantor', html: 'Tim masih mengumpulkan data pasar. Coba lagi beberapa detik lagi.' }];
  const N = r.narasi, main = (r.rencana || [])[0], p = Number.isFinite(ctx.spot) ? ctx.spot : r.basis.price;

  if (has(q, ' halo ', ' hai ', ' hi ', ' pagi ', ' siang ', ' sore ', ' malam ', ' assalam')) {
    return [{ dari: 'Rina · Chief Strategist', html: `Halo! Saya Rina, memimpin tim ${esc(r.aset?.nama || A)}. Harga sekarang <b>${n(p)}</b>, keputusan tim: <b>${esc(N.aksi)}</b>. Mau tanya apa?` }];
  }
  if (has(q, ' kenapa ', ' mengapa ', ' alasan ', ' kok ', ' dasar ')) {
    const pro = (N.kenapa || []).map(esc).join('; ') || 'belum ada alasan kuat';
    const kon = (N.penghambat || []).map(esc).join('; ');
    out.push(say(r, 'chief', `Alasan utama: ${pro}.${kon ? `<br>Yang menghambat: ${kon}.` : ''}`));
    const top = (r.agents || []).filter(a => a.cukup && ['trend', 'momentum', 'structure', 'macro', 'news'].includes(a.id)).sort((a, b) => Math.abs(b.skor) - Math.abs(a.skor)).slice(0, 3);
    if (top.length) out.push({ dari: 'Suara analis', html: top.map(a => `<b>${esc(a.nama)}</b> (${esc(a.peran)}): ${sig(a)} — ${esc(a.ringkasan)}`).join('<br>') });
    return out;
  }
  if (has(q, ' sl ', ' stop ', ' tp ', ' target ', ' take profit ', ' level ', ' zona ')) {
    if (!r.rencana?.length) return [say(r, 'execution', 'Belum ada rencana entry yang layak saat ini.')];
    return [say(r, 'execution', r.rencana.map(x => `<b>${x.tipe} ${esc(x.prioritas)}</b> (kekuatan ${x.kekuatan}%): zona ${n(x.entry_bawah)}–${n(x.entry_atas)} · SL <b>${n(x.sl)}</b> · TP1 <b>${n(x.tp1)}</b> · TP2 ${n(x.tp2)}`).join('<br>') + (N.target ? `<br>${esc(N.target)}` : ''))];
  }
  if (has(q, ' proyeksi ', ' arah ', ' nanti ', ' prediksi ', ' ke mana ', ' kemana ', ' jam lagi ', ' besok ')) {
    const want = /(\d+)\s*jam/.exec(q); const m = want ? +want[1] * 60 : 240;
    const pr = (r.proyeksi || []).reduce((b, x) => Math.abs(x.menit - m) < Math.abs(b.menit - m) ? x : b, r.proyeksi?.[0] || { menit: 0 });
    return [say(r, 'volatility', pr.harga ? `Proyeksi ${pr.menit >= 60 ? pr.menit / 60 + ' jam' : pr.menit + ' menit'} lagi: sekitar <b>${n(pr.harga)}</b>, rentang ${n(pr.bawah)}–${n(pr.atas)}${pr.kalibrasi ? ' (8 dari 10 kali harga berakhir di rentang ini pada backtest)' : ''}. Ini skenario peluang, bukan kepastian.` : 'Proyeksi belum tersedia.')];
  }
  if (has(q, ' kapan ', ' jam ', ' sesi ', ' waktu ', ' jadwal ')) {
    const t0 = Date.parse(r.basis.time), now = Date.now();
    const next = (r.jadwal || []).filter(j => t0 + j.menit_akhir * 60e3 > now).slice(0, 4);
    return [say(r, 'session', next.length ? next.map(j => `<b>${ctx.wib(new Date(t0 + j.menit_mulai * 60e3))}–${ctx.wib(new Date(t0 + j.menit_akhir * 60e3))}</b> ${esc(j.aksi)}: ${esc(j.detail)}`).join('<br>') : 'Jadwal 24 jam mapping ini sudah lewat — tunggu mapping berikutnya.')];
  }
  if (has(q, ' berita ', ' news ', ' kabar ', ' sentimen ')) {
    const b = ctx.news;
    if (!b?.berita?.length) return [say(r, 'news', 'Belum ada berita yang terkumpul untuk aset ini.')];
    return [say(r, 'news', `Sentimen: <b>${esc(b.label)}</b> (skor ${b.skor}). Berita terbaru:<br>` + b.berita.slice(0, 4).map(x => `• ${esc(x.judul)} <span class="hint">(${x.skor > 0 ? '+' : ''}${x.skor})</span>`).join('<br>'))];
  }
  if (has(q, ' lot ', ' modal ', ' risiko ', ' resiko ', ' saldo ', ' money ')) {
    if (!main) return [say(r, 'risk', 'Belum ada rencana entry, jadi belum ada ukuran lot.')];
    const ps = ctx.positionSize({ balance: ctx.settings.balance, riskPct: ctx.settings.riskPct, entry: (main.entry_bawah + main.entry_atas) / 2, sl: main.sl, contract: ctx.contract });
    return [say(r, 'risk', ps ? `Dengan modal <b>$${ctx.settings.balance}</b> dan risiko <b>${ctx.settings.riskPct}%</b>: risiko $${ps.riskMoney}, jarak SL ${ps.dist}, perkiraan lot <b>${ps.lot}</b>. Ubah modal & risiko di menu Rencana. Cocokkan dengan kalkulator broker karena ukuran kontrak tiap broker berbeda.` : 'Isi modal dan risiko di menu Rencana dulu.')];
  }
  if (has(q, ' akurat ', ' akurasi ', ' backtest ', ' peluang ', ' winrate ', ' win rate ', ' rekam ', ' kinerja ', ' bisa dipercaya ')) {
    const k = r.keunggulan;
    return [say(r, 'validator', `${N.keandalan ? esc(N.keandalan) + '<br>' : ''}${k ? `Uji data baru (out-of-sample): rata-rata ${k.R >= 0 ? '+' : ''}${k.R}R per transaksi dari ${k.n} sinyal — ${k.ada ? 'sistem punya <b>keunggulan</b>' : '<b>belum menguntungkan</b>, EA tidak entry kecuali mode Semua Sinyal'}.` : 'Sampel backtest belum cukup untuk menilai keunggulan.'}`)];
  }
  // keputusan
  if (has(q, ' buy ', ' sell ', ' beli ', ' jual ', ' entry ', ' masuk ', ' keputusan ', ' sekarang ', ' harus ', ' sinyal ', ' signal ', ' posisi ', ' op ', ' open ')) {
    out.push(say(r, 'chief', `Keputusan: <b style="color:var(--${N.warna === 'green' ? 'green' : N.warna === 'red' ? 'red' : 'gold'})">${esc(N.aksi)}</b>. ${esc(N.judul)}<br>Kekuatan sinyal <b>${r.kekuatan_sinyal ?? '–'}%</b>${r.peluang_sinyal != null ? `, peluang TP1 duluan di backtest <b>${pct(r.peluang_sinyal)}</b>` : ''}.${N.jarak ? '<br>' + esc(N.jarak) : ''}`));
    if (main) out.push(say(r, 'execution', `Rencana ${esc(main.prioritas)}: ${main.tipe} ${n(main.entry_bawah)}–${n(main.entry_atas)}, SL ${n(main.sl)}, TP1 ${n(main.tp1)}, TP2 ${n(main.tp2)} (RR 1:${main.rr}). EA entry otomatis saat harga menyentuh zona.`));
    return out;
  }
  if (has(q, ' batal ', ' invalid ', ' gagal ', ' salah ')) return [say(r, 'risk', esc(N.batal || r.invalidasi || 'Belum ada syarat batal.'))];
  if (has(q, ' bahaya ', ' waspada ', ' hati-hati ', ' peringatan ', ' news merah ', ' rilis ')) {
    const w = [N.waspada, ...(r.peringatan_list || [])].filter(Boolean);
    return [say(r, 'calendar', w.length ? w.map(esc).join('<br>') : 'Tidak ada peringatan khusus saat ini.')];
  }
  // tanya agent tertentu: "arka", "mira", "trend", "momentum", ...
  const ag = (r.agents || []).find(a => q.includes(' ' + a.nama.toLowerCase() + ' ') || q.includes(' ' + a.id + ' ') || q.includes(' ' + String(a.peran).toLowerCase().split(' ').pop() + ' '));
  if (ag) return [{ dari: `${ag.nama} · ${ag.peran}`, html: `${esc(ag.ringkasan)}${ag.cukup === false ? ' (data belum cukup, tidak ikut voting)' : ''}<br>${(ag.detail || []).slice(0, 4).map(esc).join('<br>')}` }];
  if (has(q, ' tim ', ' karyawan ', ' agent ', ' siapa ')) return [{ dari: 'Kantor', html: 'Tim: ' + (r.agents || []).map(a => `<b>${esc(a.nama)}</b> (${esc(a.peran)})`).join(', ') + '. Sebut namanya untuk bertanya langsung, mis. "Mira gimana?"' }];
  if (has(q, ' terima kasih ', ' makasih ', ' thanks ', ' ok ', ' oke ', ' siap ')) return [{ dari: 'Rina · Chief Strategist', html: 'Sama-sama. Tim terus memantau pasar secara real-time.' }];
  return [{ dari: 'Kantor', html: 'Maaf, saya belum paham pertanyaannya. Coba salah satu pertanyaan di bawah, atau sebut nama agent (Arka, Mira, Sena, Ravi, Kabar, Maya, Dimas…).' }];
}
