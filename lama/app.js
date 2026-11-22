/* XAU Mapper PWA: data (Twelve Data), snapshot maths, and the agent pipeline (Claude API).
   Runs in the browser; also loadable in Node for tests (module.exports at the bottom).
   Wrapped so the only global it creates is `App`. */
(() => {
'use strict';

const STAGES = {
  prep: 'Review yesterday, plan the day, event calendar, overnight levels',
  asia: 'Asia open: opening drift, range forming, levels for London',
  london: 'Asia range done: London sweep or breakout of the Asia high/low',
  newyork: 'London result, US data risk, NY continuation or reversal',
  close: "Grade the day's maps against what happened; carry levels to tomorrow",
};
const SPECIALISTS = ['xau-macro', 'xau-technical', 'xau-liquidity', 'xau-quant'];
const STEPS = ['snapshot', ...SPECIALISTS, 'xau-risk', 'xau-chief-strategist'];

// Session windows in UTC hours [start, end). WIB = UTC+7.
const SESSIONS_UTC = { asia: [0, 8], london: [7, 16], new_york: [12, 21] };
// name -> [Twelve Data interval, candles]. 7 requests = 7 credits (free tier: 8/min).
const TIMEFRAMES = {
  MN1: ['1month', 36], W1: ['1week', 104], D1: ['1day', 260], H4: ['4h', 300],
  H1: ['1h', 300], M15: ['15min', 400], M5: ['5min', 1800],
};
const RAW_CANDLES = { D1: 20, H4: 30, H1: 48, M15: 96, M5: 72 };

/* ---------- indicators and snapshot (same maths as mt5_snapshot.py) ---------- */

function ema(values, n) {
  if (values.length < n) return null;
  const k = 2 / (n + 1);
  let e = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (const v of values.slice(n)) e = v * k + e * (1 - k);
  return e;
}

function rsi(closes, n = 14) {
  if (closes.length <= n) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; g += Math.max(d, 0); l += Math.max(-d, 0); }
  let ag = g / n, al = l / n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + Math.max(d, 0)) / n;
    al = (al * (n - 1) + Math.max(-d, 0)) / n;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function atr(c, n = 14) {
  if (c.length <= n) return null;
  const trs = [];
  for (let i = 1; i < c.length; i++) {
    const h = c[i].high, lo = c[i].low, pc = c[i - 1].close;
    trs.push(Math.max(h - lo, Math.abs(h - pc), Math.abs(lo - pc)));
  }
  let a = trs.slice(0, n).reduce((x, y) => x + y, 0) / n;
  for (const tr of trs.slice(n)) a = (a * (n - 1) + tr) / n;
  return a;
}

const rnd = (x, p = 2) => (x == null ? null : Math.round(x * 10 ** p) / 10 ** p);
const iso = ts => new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' ');
const max = a => Math.max(...a), min = a => Math.min(...a);

function tfSummary(c) {
  const closes = c.map(x => x.close), last = c[c.length - 1], recent = c.slice(-20);
  return {
    last_close: last.close, last_candle_utc: iso(last.time),
    ema20: rnd(ema(closes, 20)), ema50: rnd(ema(closes, 50)), ema200: rnd(ema(closes, 200)),
    rsi14: rnd(rsi(closes)), atr14: rnd(atr(c)),
    high_20: max(recent.map(x => x.high)), low_20: min(recent.map(x => x.low)),
  };
}

function sessionRanges(c, day) { // day = 'YYYY-MM-DD' (UTC)
  const out = {}, base = Date.parse(day + 'T00:00:00Z') / 1000;
  for (const [name, [s, e]] of Object.entries(SESSIONS_UTC)) {
    const t0 = base + s * 3600, t1 = base + e * 3600;
    const inside = c.filter(x => x.time >= t0 && x.time < t1);
    if (!inside.length) { out[name] = { status: 'not_started' }; continue; }
    const hi = max(inside.map(x => x.high)), lo = min(inside.map(x => x.low));
    out[name] = {
      status: c[c.length - 1].time >= t1 - 1 ? 'complete' : 'in_progress',
      open: inside[0].open, high: hi, low: lo, close: inside[inside.length - 1].close, range: rnd(hi - lo),
    };
  }
  return out;
}

function avgSessionRanges(c, days) {
  const out = {};
  for (const name of Object.keys(SESSIONS_UTC)) {
    const rs = days.map(d => sessionRanges(c, d)[name].range).filter(r => r != null);
    out[name] = rs.length ? rnd(rs.reduce((a, b) => a + b, 0) / rs.length) : null;
  }
  return out;
}

function keyLevels(d1, w1) { // last candle is the current, unfinished one
  const pd = d1[d1.length - 2], pw = w1[w1.length - 2];
  return {
    prev_day_high: pd.high, prev_day_low: pd.low, prev_day_close: pd.close,
    prev_week_high: pw.high, prev_week_low: pw.low,
    today_open: d1[d1.length - 1].open, week_open: w1[w1.length - 1].open,
  };
}

function buildSnapshot(data, day) {
  const m5 = data.M5, last = m5[m5.length - 1];
  const prior = [1, 2, 3, 4, 5].map(i => new Date(Date.parse(day + 'T00:00:00Z') - i * 864e5).toISOString().slice(0, 10));
  const raw = {};
  for (const [n, k] of Object.entries(RAW_CANDLES)) raw[n] = data[n].slice(-k).map(x => ({ ...x, time: iso(x.time) }));
  const tfs = {};
  for (const [n, c] of Object.entries(data)) tfs[n] = tfSummary(c);
  return {
    symbol: 'XAU/USD',
    source: 'Twelve Data spot composite (no volume or spread; may differ slightly from your broker)',
    generated_utc: iso(Date.now() / 1000),
    session_day_utc: day,
    price: { last: last.close, time_utc: iso(last.time) },
    key_levels: keyLevels(data.D1, data.W1),
    sessions_today: sessionRanges(m5, day),
    avg_session_range_prev_days: avgSessionRanges(m5, prior),
    timeframes: tfs,
    raw_candles: raw,
  };
}

/* ---------- Twelve Data ---------- */

function parseTD(dt) { // '2026-11-19 05:15:00' or '2026-11-01' (UTC)
  return Date.parse((dt.length === 10 ? dt + 'T00:00:00' : dt.replace(' ', 'T')) + 'Z') / 1000;
}

async function fetchTF(key, interval, size) {
  const u = 'https://api.twelvedata.com/time_series?symbol=XAU/USD&timezone=UTC&order=asc'
    + `&interval=${interval}&outputsize=${size}&apikey=${encodeURIComponent(key)}`;
  let j;
  try { j = await (await fetch(u)).json(); }
  catch (e) { throw new Error('Cannot reach Twelve Data (internet?)'); }
  if (j.status === 'error' || !j.values) throw new Error(`Twelve Data (${interval}): ${j.message || 'no data'}`);
  return j.values.map(v => ({ time: parseTD(v.datetime), open: +v.open, high: +v.high, low: +v.low, close: +v.close }));
}

async function takeSnapshot(tdKey) {
  const names = Object.keys(TIMEFRAMES);
  const series = await Promise.all(names.map(n => fetchTF(tdKey, ...TIMEFRAMES[n])));
  const data = Object.fromEntries(names.map((n, i) => [n, series[i]]));
  const day = new Date(data.M5[data.M5.length - 1].time * 1000).toISOString().slice(0, 10);
  return buildSnapshot(data, day);
}

/* ---------- Claude API ---------- */

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function postClaude(key, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
    } catch (e) { throw new Error('Cannot reach Claude API (internet?)'); }
    if (r.ok) return r.json();
    const msg = await r.text();
    if ([429, 500, 529].includes(r.status) && attempt < 2) { await sleep(15000 * (attempt + 1)); continue; }
    throw new Error(`Claude API error ${r.status}: ${msg.slice(0, 300)}`);
  }
}

async function callClaude(key, model, system, user, { webSearch = false, maxTokens = 2500 } = {}) {
  const messages = [{ role: 'user', content: user }];
  const body = { model, max_tokens: maxTokens, system, messages };
  if (webSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  const texts = [];
  for (let i = 0; i < 4; i++) { // web search may return pause_turn and need continuing
    const d = await postClaude(key, body);
    texts.push(...d.content.filter(b => b.type === 'text').map(b => b.text));
    if (d.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: d.content });
  }
  return texts.join('').trim();
}

/* ---------- agent prompts ---------- */

const APP_NOTE = `

## Running inside XAU Mapper (web app)
The snapshot JSON and today's earlier reports are included in the user message. You have
no file or shell access: compute from the numbers given and show brief working. Wherever
these instructions say to read a file, read it from the message; wherever they say to write
a file, just return the content and the app will save it. The data comes from a spot gold
feed, not MT5: there is no tick volume, bid/ask or spread, and prices can differ slightly
from the user's broker. Say "not available" for those fields instead of guessing.`;

const promptCache = {};
async function loadAgent(name, fetchText = n => fetch(`agents/${n}.md`).then(r => r.text())) {
  if (!promptCache[name]) {
    const text = await fetchText(name);
    promptCache[name] = text.replace(/^---\n[\s\S]*?\n---\n/, '').trim() + APP_NOTE;
  }
  return promptCache[name];
}

/* ---------- reports (localStorage) ---------- */

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};
const DEFAULT_SETTINGS = { claudeKey: '', tdKey: '', model: 'claude-sonnet-5-5' };
const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...store.get('xau.settings', {}) });
const saveSettings = s => store.set('xau.settings', s);
const allReports = () => store.get('xau.reports', {});

function saveReport(date, stage, report, desk) {
  const all = allReports();
  (all[date] = all[date] || {})[stage] = { report, desk, saved: Date.now() };
  if (!store.set('xau.reports', all)) throw new Error('Browser storage is full: delete old reports.');
}

function listReports() {
  const all = allReports();
  return Object.keys(all).sort().reverse()
    .map(d => ({ date: d, stages: Object.keys(STAGES).filter(s => all[d][s]) }))
    .filter(d => d.stages.length);
}

/* ---------- pipeline ---------- */

function wibNow() { return new Date(Date.now() + 7 * 3600e3); } // read with getUTC*
function tradingDate(stage, now = wibNow()) {
  if (stage === 'close' && now.getUTCHours() < 12) now = new Date(now - 864e5); // closing yesterday
  return now.toISOString().slice(0, 10);
}

function newJob(stage) {
  const steps = {};
  for (const n of STEPS) steps[n] = { status: 'waiting', output: null, error: null, started: null, ended: null };
  return { stage, date: tradingDate(stage), status: 'running', error: null, report: null, price: null, steps };
}

function buildContext(stage, date, snap, earlier) {
  const now = wibNow().toISOString().slice(0, 16).replace('T', ' ');
  return `Stage: ${stage}\nTrading date (WIB): ${date}\nTime now (WIB): ${now}\n`
    + `Stage focus: ${STAGES[stage]}\n\n## Snapshot JSON\n\`\`\`json\n${JSON.stringify(snap)}\n\`\`\`\n\n`
    + `## Earlier reports today\n${earlier || 'none'}\n`;
}

function earlierReports(date, stage, reports = allReports()) {
  const day = reports[date] || {}, parts = [];
  for (const s of Object.keys(STAGES)) { if (s === stage) break; if (day[s]) parts.push(day[s].report); }
  return parts.join('\n\n---\n\n');
}

// deps lets tests swap the network: {snapshot, claude, agent, reports, save}
async function runStage(job, settings, onUpdate = () => {}, deps = {}) {
  const snapshot = deps.snapshot || takeSnapshot, claude = deps.claude || callClaude;
  const agent = deps.agent || loadAgent, save = deps.save || saveReport;
  const { claudeKey, model, tdKey } = settings;

  async function step(name, fn) {
    const s = job.steps[name];
    Object.assign(s, { status: 'running', started: Date.now() / 1000 }); onUpdate(job);
    try { s.output = await fn(); s.status = 'done'; return s.output; }
    catch (e) { Object.assign(s, { status: 'error', error: e.message }); throw e; }
    finally { s.ended = Date.now() / 1000; onUpdate(job); }
  }

  try {
    const snap = await step('snapshot', () => snapshot(tdKey));
    job.steps.snapshot.output = `Price ${snap.price.last} at ${snap.price.time_utc} UTC (Twelve Data XAU/USD)`;
    job.price = snap.price.last;
    const ctx = buildContext(job.stage, job.date, snap, earlierReports(job.date, job.stage, deps.reports));

    const sections = await Promise.all(SPECIALISTS.map(async n => {
      try {
        return await step(n, async () => claude(claudeKey, model, await agent(n), ctx, { webSearch: n === 'xau-macro' }));
      } catch (e) { return `## ${n}: unavailable (${e.message})`; }
    }));
    if (SPECIALISTS.every(n => job.steps[n].status === 'error'))
      throw new Error('All specialists failed: ' + job.steps['xau-macro'].error);

    const desk = sections.join('\n\n');
    const riskSys = await agent('xau-risk'), chiefSys = await agent('xau-chief-strategist');
    const risk = await step('xau-risk', () => claude(claudeKey, model, riskSys, ctx + '\n## Specialist sections\n' + desk));
    const report = await step('xau-chief-strategist', () => claude(claudeKey, model, chiefSys,
      ctx + '\n## Specialist sections\n' + desk + '\n\n' + risk, { maxTokens: 3000 }));

    save(job.date, job.stage, report, desk + '\n\n' + risk);
    Object.assign(job, { report, status: 'done' });
  } catch (e) {
    Object.assign(job, { status: 'error', error: e.message });
  }
  onUpdate(job);
  return job;
}

const App = {
  STAGES, STEPS, SPECIALISTS, TIMEFRAMES, ema, rsi, atr, tfSummary, sessionRanges, keyLevels,
  buildSnapshot, parseTD, loadAgent, loadSettings, saveSettings, listReports, allReports, saveReport,
  tradingDate, newJob, runStage, wibNow,
};
if (typeof module !== 'undefined') module.exports = App;
else globalThis.App = App;
})();
