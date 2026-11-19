// Node tests for app.js with Twelve Data and Claude mocked.  Run: node test/test_app.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const App = require('../app.js');

const agentFromDisk = async n => fs.readFileSync(path.join(__dirname, '..', 'agents', n + '.md'), 'utf8');
const SNAP = { price: { last: 4012.5, time_utc: '2026-11-19 06:00' } };
const SETTINGS = { claudeKey: 'k', tdKey: 'td', model: 'm' };

function fakeClaude(log, fail = new Set()) {
  return async (key, model, system, user, opts = {}) => {
    const name = App.STEPS.slice(1).find(n => system.includes(`name: ${n}`) || system.includes(marker[n]));
    log.push({ name, web: !!opts.webSearch, user });
    if (fail.has(name)) throw new Error('boom');
    return `## ${name} section`;
  };
}
const marker = {
  'xau-macro': 'You are the macro desk', 'xau-technical': 'You are the chart reader',
  'xau-liquidity': 'You map liquidity', 'xau-quant': 'You are the quant',
  'xau-risk': 'You are the risk desk', 'xau-chief-strategist': 'You run the XAUUSD desk',
};

const tests = {
  async fullStage() {
    const log = [], saved = [];
    const job = App.newJob('london');
    await App.runStage(job, SETTINGS, () => {}, {
      snapshot: async k => { assert.strictEqual(k, 'td'); return SNAP; },
      claude: fakeClaude(log), agent: n => App.loadAgent(n, agentFromDisk), reports: {},
      save: (...a) => saved.push(a),
    });
    assert.strictEqual(job.status, 'done', job.error);
    assert.strictEqual(job.report, '## xau-chief-strategist section');
    assert.deepStrictEqual(log.slice(4).map(x => x.name), ['xau-risk', 'xau-chief-strategist']);
    assert.deepStrictEqual(new Set(log.slice(0, 4).map(x => x.name)), new Set(App.SPECIALISTS));
    assert.deepStrictEqual(log.filter(x => x.web).map(x => x.name), ['xau-macro']);
    assert.ok(log[5].user.includes('## xau-quant section') && log[5].user.includes('## xau-risk section'));
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(job.price, 4012.5);
  },
  async earlierReportsFeedLaterStage() {
    const log = [], job = App.newJob('asia');
    await App.runStage(job, SETTINGS, () => {}, {
      snapshot: async () => SNAP, claude: fakeClaude(log), agent: n => App.loadAgent(n, agentFromDisk),
      reports: { [job.date]: { prep: { report: 'PREP MAP TEXT' } } }, save: () => {},
    });
    assert.ok(log[0].user.includes('PREP MAP TEXT'));
  },
  async oneSpecialistFails() {
    const log = [], job = App.newJob('newyork');
    await App.runStage(job, SETTINGS, () => {}, {
      snapshot: async () => SNAP, claude: fakeClaude(log, new Set(['xau-macro'])),
      agent: n => App.loadAgent(n, agentFromDisk), reports: {}, save: () => {},
    });
    assert.strictEqual(job.status, 'done');
    assert.strictEqual(job.steps['xau-macro'].status, 'error');
    assert.ok(log[log.length - 1].user.includes('xau-macro: unavailable'));
  },
  async allSpecialistsFail() {
    const job = App.newJob('asia');
    await App.runStage(job, SETTINGS, () => {}, {
      snapshot: async () => SNAP, claude: fakeClaude([], new Set(App.SPECIALISTS)),
      agent: n => App.loadAgent(n, agentFromDisk), reports: {}, save: () => {},
    });
    assert.strictEqual(job.status, 'error');
    assert.ok(job.error.includes('All specialists failed'));
  },
  async snapshotFailureStopsRun() {
    const job = App.newJob('asia');
    await App.runStage(job, SETTINGS, () => {}, {
      snapshot: async () => { throw new Error('Twelve Data (5min): bad key'); }, reports: {}, save: () => {},
    });
    assert.strictEqual(job.status, 'error');
    assert.strictEqual(job.steps.snapshot.status, 'error');
  },
  async tradingDateCloseAfterMidnight() {
    const t = new Date(Date.parse('2026-11-20T03:30:00Z')); // read as WIB clock
    assert.strictEqual(App.tradingDate('close', t), '2026-11-19');
    assert.strictEqual(App.tradingDate('prep', t), '2026-11-20');
  },
  async parseTwelveDataDates() {
    assert.strictEqual(App.parseTD('2026-11-19 05:15:00'), Date.parse('2026-11-19T05:15:00Z') / 1000);
    assert.strictEqual(App.parseTD('2026-11-01'), Date.parse('2026-11-01T00:00:00Z') / 1000);
  },
  async parityWithPython() {
    // fixtures written by parity_fixture.py using the Python snapshot code on the same candles
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'parity.json'), 'utf8'));
    const js = App.buildSnapshot(fx.data, fx.day);
    for (const tf of Object.keys(fx.data))
      for (const k of ['ema20', 'ema50', 'ema200', 'rsi14', 'atr14', 'high_20', 'low_20'])
        assert.strictEqual(js.timeframes[tf][k], fx.expected.timeframes[tf][k], `${tf}.${k}`);
    assert.deepStrictEqual(js.sessions_today, fx.expected.sessions_today);
    assert.deepStrictEqual(js.avg_session_range_prev_days, fx.expected.avg_session_range_prev_days);
    assert.deepStrictEqual(js.key_levels, fx.expected.key_levels);
  },
};

(async () => {
  for (const [name, fn] of Object.entries(tests)) { await fn(); console.log('ok  ', name); }
  console.log(Object.keys(tests).length + ' tests passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
