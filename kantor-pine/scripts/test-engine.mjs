// Uji mesin analisis dengan data sintetis (tanpa jaringan).
import { analyze, aggregate, rsi, ema, atr, planState, positionSize, marketOpen, activeSessions, validateDaily } from '../app/engine.js';
import assert from 'node:assert/strict';

function rng(seed){ return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
function synth(trend, seed){
  const r = rng(seed), now = Date.UTC(2026,10,18,9,0)/1000; // Rabu 09:00 UTC
  const pts = []; let p = 4000;
  for (let i = 48*12; i >= 0; i--) { p += trend + (r()-0.5)*3; pts.push({ t: now - i*300, p: +p.toFixed(2) }); }
  const daily = []; let d = 3500;
  for (let i = 370; i >= 1; i--) { const c = d + trend*20 + (r()-0.5)*40; const day = new Date((now - i*86400)*1000).toISOString().slice(0,10); daily.push({ d: day, c: +c.toFixed(2), h: +(Math.max(c,d)+r()*15).toFixed(2), l: +(Math.min(c,d)-r()*15).toFixed(2) }); d = c; }
  daily[daily.length-1].c = pts[0].p;
  return { points: pts, daily, spot: p, now: new Date(now*1000) };
}

// indikator dasar
assert.equal(ema([1,1,1],2).at(-1), 1);
assert.ok(rsi(Array.from({length:30},(_,i)=>i)) > 95, 'RSI naik terus ~100');
assert.equal(aggregate([{t:0,p:1},{t:300,p:3},{t:600,p:2},{t:3600,p:5}],60).length, 2);
assert.ok(Math.abs(atr([{h:2,l:1,c:1.5},{h:3,l:2,c:2.5},{h:4,l:3,c:3.5}]) - 1.5) < 1e-9);
// sesi & pasar
assert.equal(marketOpen(new Date('2026-11-21T12:00:00Z')), false, 'Sabtu tutup');
assert.equal(marketOpen(new Date('2026-11-18T12:00:00Z')), true);
assert.ok(activeSessions(new Date('2026-11-18T14:00:00Z')).map(s=>s.id).includes('london'));
// sizing
assert.deepEqual(positionSize({balance:1000, riskPct:1, entry:4000, sl:3995}).lot, 0.02);

for (const [name, trend, seed] of [['naik', 0.6, 7], ['turun', -0.6, 11], ['datar', 0, 3]]) {
  const r = analyze(synth(trend, seed));
  console.log(`\n[${name}] bias=${r.bias} skor=${r.skor} keyakinan=${r.keyakinan}% harga=${r.harga_sekarang} ATRh=${r.statistik.atrH1} ATRd=${r.statistik.atrD1}`);
  console.log(' ringkasan:', r.ringkasan);
  r.rencana.forEach(p => console.log(`  ${p.tipe} ${p.prioritas}: ${p.entry_bawah}-${p.entry_atas} SL ${p.sl} TP ${p.tp1}/${p.tp2} RR ${p.rr}`));
  console.log('  proyeksi:', r.proyeksi.map(p=>`${p.menit}m:${p.harga}`).join(' '));
  console.log('  agents:', r.agents.map(a=>`${a.nama}(${a.skor.toFixed(2)})`).join(' '));
  console.log('  jadwal:', r.jadwal.map(j=>`${j.menit_mulai}-${j.menit_akhir} ${j.aksi}`).join(' | '));
  // invarian
  assert.equal(r.proyeksi.length, 9);
  r.proyeksi.forEach(p => assert.ok(p.bawah <= p.harga && p.harga <= p.atas));
  r.proyeksi.forEach((p, i) => { if (i) assert.ok(p.atas - p.bawah >= r.proyeksi[i-1].atas - r.proyeksi[i-1].bawah - 0.02, 'rentang tidak boleh menyempit'); });
  r.rencana.forEach(p => { assert.ok(p.rr >= 1); if (p.tipe==='BUY') assert.ok(p.sl < p.entry_bawah && p.tp1 > p.entry_atas && p.tp2 > p.tp1); else assert.ok(p.sl > p.entry_atas && p.tp1 < p.entry_bawah && p.tp2 < p.tp1); assert.ok(p.rr <= 2.01); });
  assert.equal(r.jadwal[0].menit_mulai, 0); assert.equal(r.jadwal.at(-1).menit_akhir, 1440);
  assert.equal(r.agents.length, 11);
  if (name==='naik') assert.equal(r.bias, 'BULLISH');
  if (name==='turun') assert.equal(r.bias, 'BEARISH');
}
// mode akhir pekan: data sampai penutupan Jumat, dianalisis hari Sabtu
{
  const base = synth(-0.6, 13); const fridayClose = Date.UTC(2026,10,20,21,55)/1000; const shift = fridayClose - base.points.at(-1).t;
  base.points = base.points.map(x => ({ t: x.t + shift, p: x.p })); base.now = new Date('2026-11-21T16:00:00Z');
  const w = analyze(base);
  assert.ok(w.gap, 'ada analisis gap'); assert.equal(w.mode, 'akhir-pekan');
  assert.equal(w.basis.time, '2026-11-22T23:00:00.000Z', 'proyeksi mulai saat pasar buka (Minggu 18:00 New York)');
  assert.equal(w.jadwal[0].aksi, 'NO TRADE'); assert.ok(w.jadwal.some(j => j.aksi !== 'NO TRADE'), 'ada jendela trading setelah buka');
  assert.ok(w.proyeksi.at(-1).atas - w.proyeksi.at(-1).bawah > 5, 'rentang 24 jam tidak datar');
  assert.ok(w.gap.ambang_atas > w.gap.penutupan && w.gap.ambang_bawah < w.gap.penutupan);
  console.log('\n[akhir pekan]', w.ringkasan); console.log('  gap:', w.gap.kondisi, '|', w.gap.kecenderungan);
  console.log('  jadwal:', w.jadwal.map(j=>`${j.menit_mulai}-${j.menit_akhir} ${j.aksi}`).join(' | '));
}
const st = planState({tipe:'BUY',entry_bawah:10,entry_atas:12,sl:8,berlaku_menit:60}, 11, 0, 0);
assert.equal(st.kode, 'zone');
console.log('\nSEMUA TES LULUS');

// ekspor
const { buildEA, buildPine, mapSummary, makeZip } = await import('../app/exporters.js');
const res = analyze(synth(0.6, 7));
const ea = buildEA(res); assert.ok(ea.includes('int      P_TYPE[]') && ea.includes('OnTick'), 'EA terbentuk');
assert.ok(![...ea].some(c => c.charCodeAt(0) > 127), 'EA ASCII');
const pine = buildPine(res); assert.ok(pine.code.startsWith('//@version=6') && pine.code.includes('alertcondition'));
assert.ok(mapSummary(res).includes('MAPPING XAUUSD'));
const z = makeZip([{name:'a.txt', text:'hi'}]); assert.ok(z.size > 40);
const fs = await import('node:fs');
fs.writeFileSync('/tmp/kpx_sample.pine', pine.code); fs.writeFileSync('/tmp/kpx_sample.mq5', ea);
console.log('EKSPOR LULUS');
