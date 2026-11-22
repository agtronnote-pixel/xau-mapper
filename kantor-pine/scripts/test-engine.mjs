// Uji mesin analisis v3 dengan data sintetis (tanpa jaringan).
import { analyze, aggregate, mergeCandles, nyDayKey, nyDaily, rsi, ema, atr, planState, positionSize, marketOpen, activeSessions, evaluatePlan } from '../app/engine.js';
import assert from 'node:assert/strict';

function rng(seed){ return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
// Data sintetis: 20 hari candle H1 & 5 hari M15 dari "server", plus 14 jam titik live 5 menit.
function synth(trend, seed, { nowUTC = Date.UTC(2026,10,18,9,0) } = {}){
  const r = rng(seed), now = nowUTC/1000, pts = [];
  let p = 4000; const path = [];
  for (let t = now - 20*86400; t <= now; t += 300) { p += trend*0.25 + (r()-0.5)*2.4; path.push({ t, p: +p.toFixed(2) }); }
  const h1 = aggregate(path, 60).filter(c => c.t + 3600 <= now - 14*3600).map(({t,o,h,l,c}) => ({ t, o, h: h + r()*1.5, l: l - r()*1.5, c }));
  const m15 = aggregate(path, 15).filter(c => c.t >= now - 5*86400 && c.t + 900 <= now - 14*3600).map(({t,o,h,l,c}) => ({ t, o, h, l, c }));
  path.filter(x => x.t > now - 14*3600).forEach(x => pts.push(x));
  const daily = []; let d = 3500;
  for (let i = 370; i >= 1; i--) { const c = d + trend*20 + (r()-0.5)*40; const day = new Date((now - i*86400)*1000).toISOString().slice(0,10); daily.push({ d: day, c: +c.toFixed(2), h: +(Math.max(c,d)+r()*15).toFixed(2), l: +(Math.min(c,d)-r()*15).toFixed(2) }); d = c; }
  const macro = { dxy: [], ry: [] }; let dx = 104, ry = 2.2;
  for (let i = 120; i >= 1; i--) { const day = new Date((now - i*86400)*1000).toISOString().slice(0,10); dx -= trend*0.05 + (r()-0.5)*0.3; ry -= trend*0.01 + (r()-0.5)*0.03; macro.dxy.push({ d: day, c: +dx.toFixed(3) }); macro.ry.push({ d: day, v: +ry.toFixed(3) }); }
  return { points: pts, h1, m15, daily, macro, spot: p, now: new Date(now*1000) };
}

// indikator dasar
assert.equal(ema([1,1,1],2).at(-1), 1);
assert.ok(rsi(Array.from({length:30},(_,i)=>i)) > 95, 'RSI naik terus ~100');
assert.equal(aggregate([{t:0,p:1},{t:300,p:3},{t:600,p:2},{t:3600,p:5}],60).length, 2);
assert.ok(Math.abs(atr([{h:2,l:1,c:1.5},{h:3,l:2,c:2.5},{h:4,l:3,c:3.5}]) - 1.5) < 1e-9);
// gabung candle: wick asli server dipertahankan, live memperluas & memperbarui close
const mg = mergeCandles([{t:0,o:10,h:15,l:9,c:12}], [{t:0,o:11,h:16,l:10,c:14},{t:3600,o:14,h:14,l:13,c:13}]);
assert.deepEqual(mg[0], {t:0,o:10,h:16,l:9,c:14}); assert.equal(mg.length, 2);
// candle harian broker berganti 17:00 New York
assert.equal(nyDayKey(Date.UTC(2026,10,18,21,59)/1000), '2026-11-18', 'Rabu 16:59 NY masih hari Rabu');
assert.equal(nyDayKey(Date.UTC(2026,10,18,22,0)/1000), '2026-11-19', 'Rabu 17:00 NY = candle Kamis');
// sesi & pasar
assert.equal(marketOpen(new Date('2026-11-21T12:00:00Z')), false, 'Sabtu tutup');
assert.equal(marketOpen(new Date('2026-11-18T12:00:00Z')), true);
assert.ok(activeSessions(new Date('2026-11-18T14:00:00Z')).map(s=>s.id).includes('london'));
assert.deepEqual(positionSize({balance:1000, riskPct:1, entry:4000, sl:3995}).lot, 0.02);

// skenario pasar
for (const [name, trend, seed] of [['naik', 0.6, 7], ['turun', -0.6, 11], ['datar', 0, 3]]) {
  const r = analyze(synth(trend, seed));
  console.log(`\n[${name}] bias=${r.bias} skor=${r.skor} keyakinan=${r.keyakinan}% harga=${r.harga_sekarang} ATRh=${r.statistik.atrH1} ATRd=${r.statistik.atrD1}`);
  console.log(' keputusan:', r.narasi.aksi, '—', r.narasi.judul, '| kenapa:', r.narasi.kenapa.join('; '));
  r.rencana.forEach(p => console.log(`  ${p.tipe} ${p.prioritas}: ${p.entry_bawah}-${p.entry_atas} SL ${p.sl} TP ${p.tp1}/${p.tp2} RR ${p.rr} kekuatan ${p.kekuatan}%`));
  console.log('  agents:', r.agents.map(a=>`${a.nama}(${a.cukup===false?'off':a.skor.toFixed(2)})`).join(' '));
  assert.equal(r.proyeksi.length, 9);
  r.proyeksi.forEach(p => assert.ok(p.bawah <= p.harga && p.harga <= p.atas));
  r.proyeksi.forEach((p, i) => { if (i) assert.ok(p.atas - p.bawah >= r.proyeksi[i-1].atas - r.proyeksi[i-1].bawah - 0.02, 'rentang tidak boleh menyempit'); });
  r.rencana.forEach(p => { assert.ok(p.rr >= 1); if (p.tipe==='BUY') assert.ok(p.sl < p.entry_bawah && p.tp1 > p.entry_atas && p.tp2 > p.tp1); else assert.ok(p.sl > p.entry_atas && p.tp1 < p.entry_bawah && p.tp2 < p.tp1); assert.ok(p.rr <= 2.01);
    assert.ok(Number.isInteger(p.kekuatan) && p.kekuatan >= 5 && p.kekuatan <= 95); assert.equal(p.kekuatan_label, p.kekuatan >= 70 ? 'Kuat' : p.kekuatan >= 50 ? 'Sedang' : 'Lemah'); });
  r.rencana.forEach((p, i) => { if (i) assert.ok(r.rencana[i-1].kekuatan >= p.kekuatan, 'rencana terurut dari terkuat'); });
  assert.equal(r.kekuatan_sinyal, r.rencana[0]?.kekuatan ?? null);
  assert.equal(r.jadwal[0].menit_mulai, 0); assert.equal(r.jadwal.at(-1).menit_akhir, 1440);
  assert.equal(r.agents.length, 14);
  ['trend','momentum','structure','macro'].forEach(id => assert.equal(r.agents.find(a=>a.id===id).cukup, true, `${id} punya data cukup`));
  assert.equal(r.kualitas.basi, 0); assert.ok(r.kualitas.candle_h1 >= 300);
  assert.ok(['BUY','SELL','TUNGGU'].includes(r.narasi.aksi)); assert.ok(r.narasi.kenapa.length >= 1);
  if (name==='naik') assert.equal(r.bias, 'BULLISH');
  if (name==='turun') assert.equal(r.bias, 'BEARISH');
}

// BUG LAMA: data pendek → agent tidak diam-diam memberi skor 0, melainkan keluar dari konsensus
{
  const s = synth(0.6, 7); const r = analyze({ points: s.points, spot: s.spot, now: s.now });
  const trend = r.agents.find(a => a.id === 'trend');
  assert.equal(trend.cukup, false, 'Arka tidak ikut bila H1 < 60'); assert.ok(r.kualitas.agent_kurang.includes('Arka'));
  assert.ok(r.peringatan.includes('Agent tanpa data cukup'));
  assert.ok(r.agents.find(a => a.id === 'chief').detail.some(d => d.startsWith('Arka') && d.includes('tidak ikut')));
}
// data basi saat pasar buka → tidak ada rencana, keputusan "JANGAN TRADING"
{
  const s = synth(0.6, 7); s.now = new Date(s.now.getTime() + 3 * 3600e3);
  const r = analyze(s); assert.equal(r.kualitas.basi, 2); assert.equal(r.rencana.length, 0); assert.equal(r.narasi.aksi, 'JANGAN TRADING');
  const s2 = synth(0.6, 7); s2.now = new Date(s2.now.getTime() + 40 * 60e3); const r2 = analyze(s2); assert.equal(r2.kualitas.basi, 1);
}
// kalender asli: rilis berdampak tinggi → blok NO TRADE & catatan di rencana
{
  const s = synth(-0.6, 11); const t = new Date(s.now.getTime() + 4.5 * 3600e3).toISOString();
  s.calendar = [{ t, nama: 'Core PCE Price Index m/m', dampak: 'tinggi' }, { t: new Date(s.now.getTime() + 6 * 86400e3).toISOString(), nama: 'X', dampak: 'sedang' }];
  const r = analyze(s);
  assert.equal(r.kualitas.kalender_asli, true);
  assert.ok(r.jadwal.some(j => j.aksi === 'NO TRADE' && j.detail.includes('Core PCE')), 'blok NO TRADE sekitar rilis');
  r.rencana.forEach(p => assert.ok(p.rilis.some(x => x.includes('Core PCE'))));
  assert.ok(r.narasi.waspada && r.narasi.waspada.includes('Core PCE'));
}
// kalibrasi: bobot, peluang & rentang proyeksi dari backtest dipakai
{
  const s = synth(0.6, 7);
  s.calib = { bobot: { trend: 0.1, momentum: 0.2, structure: 0.4, macro: 0.1, news: 0.05, claude: 0.05 }, arah: { h4: 0.55, n: 400 },
    kekuatan: [{ dari: 5, sampai: 40, n: 50, peluang: 0.45, ekspektasi_R: -0.1 }, { dari: 40, sampai: 96, n: 80, peluang: 0.57, ekspektasi_R: 0.3 }],
    proyeksi: Object.fromEntries([15,30,60,120,240,480,720,1440].map((h,i) => [h, { k: 0.1*(i+1), q80: 0.5*(i+1), n: 500 }])),
    rencana: { tersentuh: 100, winrate: 0.52, ekspektasi_R: 0.2, oos: { tersentuh: 40, winrate: 0.5, ekspektasi_R: 0.1 } } };
  const r = analyze(s);
  r.rencana.forEach(p => { assert.ok(p.peluang != null && p.peluang_sampel > 0); });
  assert.ok(r.proyeksi.filter(p => p.kalibrasi).length >= 8, 'proyeksi terkalibrasi');
  assert.ok(r.agents.find(a => a.id === 'chief').detail[0].includes('kalibrasi'));
  assert.ok(r.narasi.keandalan.includes('backtest'));
}
// evaluasi rencana (backtest & arsip live)
{
  const pl = { tipe: 'BUY', entry_bawah: 99, entry_atas: 101, sl: 95, tp1: 106, tp2: 112, berlaku_menit: 60 };
  const B = (t, l, h) => ({ t, o: l, h, l, c: h });
  assert.equal(evaluatePlan(pl, [B(0,102,103), B(900,100,102), B(1800,101,107), B(2700,101,113)], 0).hasil, 'TP2');
  assert.equal(evaluatePlan(pl, [B(0,100,102), B(900,94,101)], 0).hasil, 'SL');
  assert.equal(evaluatePlan(pl, [B(0,94,107)], 0).hasil, 'SL', 'SL & TP di candle yang sama = SL');
  assert.equal(evaluatePlan(pl, [B(0,103,104), B(3600,103,104)], 0).hasil, 'tidak tersentuh');
  const tp1 = evaluatePlan(pl, [B(0,100,101), B(900,101,107), B(1800,99.9,104)], 0); assert.equal(tp1.hasil, 'TP1'); assert.equal(tp1.R, 0.6, '50% × 1,2R');
}
// mode akhir pekan: data sampai penutupan Jumat, dianalisis hari Sabtu
{
  const base = synth(-0.6, 13, { nowUTC: Date.UTC(2026,10,20,21,55) }); base.now = new Date('2026-11-21T16:00:00Z');
  const w = analyze(base);
  assert.ok(w.gap, 'ada analisis gap'); assert.equal(w.mode, 'akhir-pekan'); assert.equal(w.kualitas.basi, 0);
  assert.equal(w.basis.time, '2026-11-22T23:00:00.000Z', 'proyeksi mulai saat pasar buka (Minggu 18:00 New York)');
  assert.equal(w.jadwal[0].aksi, 'NO TRADE'); assert.ok(w.jadwal.some(j => j.aksi !== 'NO TRADE'), 'ada jendela trading setelah buka');
  assert.ok(w.proyeksi.at(-1).atas - w.proyeksi.at(-1).bawah > 5, 'rentang 24 jam tidak datar');
  assert.ok(w.gap.ambang_atas > w.gap.penutupan && w.gap.ambang_bawah < w.gap.penutupan);
  assert.ok(w.narasi.judul.startsWith('Pasar buka'));
  console.log('\n[akhir pekan]', w.narasi.aksi, '—', w.narasi.judul);
}
// backtest cepat (dipakai kalibrasi harian)
{
  const { backtest } = await import('./calibrate.mjs');
  const s = synth(0.4, 21, { nowUTC: Date.UTC(2026,10,18,9,0) });
  const runs = backtest({ h1: s.h1, m15: s.m15, daily: s.daily, macro: s.macro }, { maxRuns: 40 });
  assert.ok(runs.length >= 20, 'backtest berjalan'); assert.ok(runs.some(r => r.plans.some(p => p.ev)), 'rencana dinilai');
  assert.ok(runs.every(r => Object.keys(r.agents).length === 6));
  console.log('backtest sintetis:', runs.length, 'jam');
}
// KRIPTO 24/7: profil, presisi harga kecil (DOGE), tanpa mode akhir pekan
{
  const { cryptoProfile } = await import('../app/engine.js');
  const pd = cryptoProfile('DOGEUSD', 'Dogecoin', 0.0547), pb = cryptoProfile('BTCUSD', 'Bitcoin', 59700);
  assert.equal(pd.digit, 6); assert.equal(pb.digit, 2); assert.equal(pb.langkah, 500); assert.equal(pd.langkah, 0.0005);
  assert.equal(marketOpen(new Date('2026-11-21T12:00:00Z'), pd), true, 'kripto buka hari Sabtu');
  const sc = 0.0547 / 4000;   // skala data sintetis ke harga DOGE
  const s = synth(-0.6, 17, { nowUTC: Date.UTC(2026,10,21,12,0) });   // Sabtu
  const k = c => ({ t: c.t, o: c.o*sc, h: c.h*sc, l: c.l*sc, c: c.c*sc });
  const r = analyze({ ...s, h1: s.h1.map(k), m15: s.m15.map(k), points: s.points.map(x => ({ t: x.t, p: x.p*sc })), spot: s.spot*sc,
    daily: s.daily.map(d => ({ d: d.d, c: d.c*sc, h: d.h*sc, l: d.l*sc })), profil: pd });
  assert.equal(r.mode, 'live'); assert.equal(r.gap, null); assert.equal(r.aset.id, 'DOGEUSD'); assert.equal(r.kualitas.basi, 0);
  assert.ok(r.rencana.length, 'ada rencana untuk DOGE');
  r.rencana.forEach(p => { assert.ok(p.entry_bawah < p.entry_atas, 'zona tidak runtuh oleh pembulatan'); assert.ok((String(p.sl).split('.')[1] || '').length > 2, 'presisi > 2 desimal');
    if (p.tipe === 'BUY') assert.ok(p.sl < p.entry_bawah && p.tp1 > p.entry_atas); else assert.ok(p.sl > p.entry_atas && p.tp1 < p.entry_bawah); });
  assert.ok(r.jadwal.some(j => j.detail.includes('Akhir pekan')), 'sesi akhir pekan kripto');
  assert.ok(!r.jadwal.some(j => j.detail === 'Pasar tutup'));
  const { buildEA, mapSummary } = await import('../app/exporters.js');
  const ea = buildEA(r); assert.ok(ea.includes('StringFind(_Symbol, "DOGE")') && ea.includes('KPX_DOGEUSD_'.slice(0,4)) && !/InpMaxSpread\s+= 0\.50/.test(ea), 'EA disesuaikan untuk DOGE');
  assert.ok(mapSummary(r).includes('MAPPING DOGEUSD'));
  console.log('[DOGE]', r.narasi.aksi, '—', r.narasi.judul);
  const { pickTop, realizedVol } = await import('./crypto.js');
  const R = [['A',90],['B',85],['C',80],['D',75],['E',70],['F',66],['G',50]].map(([id, vol30]) => ({ id, vol30 }));
  assert.deepEqual(pickTop(R, []).map(x => x.id), ['A','B','C','D','E']);
  assert.ok(pickTop(R, ['F']).map(x => x.id).includes('F'), 'aset lama bertahan bila vol ≥ 90% aset ke-5');
  assert.ok(!pickTop(R, ['G']).map(x => x.id).includes('G'), 'aset lama keluar bila jauh lebih tenang');
  const { UNIVERSE, TETAP, liveSource } = await import('./crypto.js');
  assert.ok(TETAP.includes('XMRUSD')); const xmr = UNIVERSE.find(u => u[0] === 'XMRUSD');
  assert.deepEqual(liveSource(xmr), { provider: 'htx', symbol: 'xmrusdt' }); assert.equal(liveSource(UNIVERSE[0]).provider, 'binance');
  const dly = Array.from({ length: 40 }, (_, i) => ({ c: 100 * (1 + (i % 2 ? 0.02 : -0.02)), h: 103, l: 97 }));
  assert.ok(realizedVol(dly).vol30 > 30);
}
// FOREX & INDEKS: jam pasar, presisi, kalender GBP, ambang data basi aset tanpa harga live
{
  const { PRESETS } = await import('../app/engine.js');
  const G = PRESETS.GBPUSD, N = PRESETS.USA100;
  assert.equal(marketOpen(new Date('2026-11-22T22:30:00Z'), G), true, 'forex buka Minggu 17:30 NY');
  assert.equal(marketOpen(new Date('2026-11-22T22:30:00Z'), N), false, 'indeks CME baru buka 18:00 NY');
  const sc = 1.308 / 4000, k = c => ({ t: c.t, o: c.o*sc, h: c.h*sc, l: c.l*sc, c: c.c*sc });
  const s = synth(0.6, 23);
  const t = new Date(s.now.getTime() + 3 * 3600e3).toISOString();
  const r = analyze({ ...s, h1: s.h1.map(k), m15: s.m15.map(k), points: s.points.map(x => ({ t: x.t, p: x.p*sc })), spot: s.spot*sc,
    daily: s.daily.map(d => ({ d: d.d, c: d.c*sc, h: d.h*sc, l: d.l*sc })), profil: G,
    calendar: [{ t, nama: 'BOE Official Bank Rate', negara: 'GBP', dampak: 'tinggi' }, { t, nama: 'Tokyo CPI', negara: 'JPY', dampak: 'tinggi' }, { t: new Date(s.now.getTime() + 6*86400e3).toISOString(), nama: 'x', negara: 'USD', dampak: 'sedang' }] });
  assert.equal(r.aset.id, 'GBPUSD'); assert.equal(r.aset.digit, 5);
  assert.ok(r.jadwal.some(j => j.detail.includes('GBP BOE')), 'rilis GBP masuk kalender GBPUSD'); assert.ok(!r.jadwal.some(j => j.detail.includes('Tokyo')));
  r.rencana.forEach(p => assert.ok((String(p.sl).split('.')[1] || '').length >= 3));
  const { buildEA } = await import('../app/exporters.js'); const ea = buildEA(r);
  if (ea) assert.ok(ea.includes('InpMaxSpread     = 0.00030') && ea.includes('StringFind(_Symbol, "GBP")'), 'EA GBPUSD');
  // indeks tanpa harga live: data 60 menit masih "segar", 2 jam = tertunda
  const s2 = synth(-0.6, 29); const pts = s2.points; s2.now = new Date(s2.now.getTime() + 60 * 60e3);
  const r2 = analyze({ ...s2, points: pts, profil: N }); assert.equal(r2.kualitas.basi, 0, 'indeks: 60 menit = segar');
  s2.now = new Date(s2.now.getTime() + 60 * 60e3); assert.equal(analyze({ ...s2, points: pts, profil: N }).kualitas.basi, 1);
  console.log('[GBPUSD]', r.narasi.aksi, '—', r.narasi.judul);
}
// format data ringkas (market.json v2): bolak-balik tanpa kehilangan, hasil analisis sama
{
  const { appMarket, sameCandles, expandMarket } = await import('./market.js');
  const s = synth(0.6, 7), full = { dibuat: 'x', status: {}, h1: s.h1, m15: s.m15, daily: s.daily, macro: { ...s.macro, y10: [] }, calendar: [], profil: null };
  const a = appMarket(full), e = expandMarket(JSON.parse(JSON.stringify(a)));
  assert.equal(a.format, 2); assert.ok(Array.isArray(a.h1[0])); assert.equal(e.h1.length, Math.min(300, s.h1.length)); assert.deepEqual(Object.keys(e.h1[0]), ['t','o','h','l','c']);
  assert.ok(sameCandles(a, JSON.parse(JSON.stringify(a)))); assert.ok(!sameCandles(a, { ...a, h1: a.h1.slice(0, -1) }));
  const r1 = analyze({ ...s, h1: e.h1, m15: e.m15, daily: e.daily, macro: e.macro }), r0 = analyze({ ...s, h1: s.h1.slice(-300), m15: s.m15.slice(-200), daily: s.daily.slice(-120) });
  assert.equal(r1.bias, r0.bias); assert.ok(Math.abs(r1.skor - r0.skor) < 0.02, 'pembulatan tidak mengubah hasil');
}
const st = planState({tipe:'BUY',entry_bawah:10,entry_atas:12,sl:8,berlaku_menit:60}, 11, 0, 0);
assert.equal(st.kode, 'zone');
console.log('\nSEMUA TES LULUS');

// ekspor
const { buildEA, buildPine, mapSummary, makeZip } = await import('../app/exporters.js');
const res = analyze(synth(0.6, 7));
const ea = buildEA(res); assert.ok(ea.includes('int      P_TYPE[]') && ea.includes('OnTick'), 'EA terbentuk');
assert.ok(![...ea].some(c => c.charCodeAt(0) > 127), 'EA ASCII');
assert.ok(ea.includes('InpAllowReal') && ea.includes('ACCOUNT_TRADE_MODE_REAL'), 'EA: pengaman akun riil');
{ // EA mengikuti aturan keputusan aplikasi: peluang backtest < 50% (sampel cukup) = dilewati
  const r2 = JSON.parse(JSON.stringify(res)); r2.rencana.forEach(p => { p.peluang = 0.42; p.peluang_sampel = 60; });
  const ea2 = buildEA(r2); assert.ok(/P_PEL\[\]  = \{42/.test(ea2) && ea2.includes('InpMinPeluang'), 'EA: filter peluang'); }
assert.ok(ea.includes('InpMinStrength') && ea.includes('P_STR[]') && ea.includes('ComputeOffset()') && ea.includes('REF_PRICE'), 'EA: filter kekuatan & offset otomatis');
const pine = buildPine(res); assert.ok(pine.code.startsWith('//@version=6') && pine.code.includes('alertcondition'));
const sum = mapSummary(res); assert.ok(sum.includes('MAPPING XAUUSD') && sum.includes('KEPUTUSAN'));
if (res.rencana.length) assert.ok(sum.includes('Kekuatan') && pine.code.includes('%"') && ea.includes('Kekuatan sinyal'), 'kekuatan di ekspor');
const z = makeZip([{name:'a.txt', text:'hi'}]); assert.ok(z.size > 40);
const fs = await import('node:fs');
fs.writeFileSync('/tmp/kpx_sample.pine', pine.code); fs.writeFileSync('/tmp/kpx_sample.mq5', ea); fs.writeFileSync('/tmp/kpx_sample.txt', sum);
console.log('EKSPOR LULUS');

// agent Kabar (RSS + kata kunci)
const { scoreHeadline, parseFeed, aggregateNews } = await import('./news.js');
assert.ok(scoreHeadline('Gold Slides To $3,558 As Fed Hike Bets Drive Worst Week Since March').skor < -1, 'berita negatif');
assert.ok(scoreHeadline('Gold Soars Toward Record High as Rate-Cut Bets and Dollar Weakness Drive Demand').skor > 1, 'berita positif');
assert.equal(scoreHeadline('Fed Chair Warsh speaks on labor market').skor, 0, '"Warsh" bukan "war"');
assert.ok(scoreHeadline('Gold price drops below Tk 195,000 per bhari').skor < 0 && scoreHeadline('Reasons for gold prices plummeting').skor < 0);
const now = Date.parse('2026-11-20T18:00:00Z');
const rss = `<rss><channel>
<item><title><![CDATA[Gold falls toward $3,500 as hawkish Fed bets build]]></title><link>https://a.example/1</link><pubDate>Fri, 20 Nov 2026 16:00:00 GMT</pubDate></item>
<item><title>Gold falls toward $3,500 as hawkish Fed bets build</title><link>https://b.example/dup</link><pubDate>Fri, 20 Nov 2026 16:05:00 GMT</pubDate></item>
<item><title>Safe-haven demand lifts bullion as Middle East tensions escalate</title><link>https://a.example/2</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate></item>
<item><title>Bitcoin hits new high</title><link>https://a.example/3</link><pubDate>Fri, 20 Nov 2026 17:00:00 GMT</pubDate></item>
</channel></rss>`;
const items = parseFeed(rss, 'Tes'); assert.equal(items.length, 4);
const agg = aggregateNews(items, now);
assert.equal(agg.jumlah, 2, 'duplikat & berita tak relevan dibuang');
assert.ok(agg.skor < 0, 'berita terbaru (negatif) lebih berbobot');
console.log('KABAR LULUS', agg.skor, agg.label);
