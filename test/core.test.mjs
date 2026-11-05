// Fixtures: test/fixtures/PMMS_history-2026-11-05.csv is the Freddie Mac PMMS history file downloaded 2026-11-05
// (2,901 weekly rows, latest week 2026-10-29). Expected rates are read off that file and the freddiemac.com/pmms page
// the same day (30-year 7.24%, 15-year 6.60%, a year ago 6.17% and 5.41%). Payments are hand-checked amortization.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  parsePmms, weekOn, nextRelease, monthlyPayment, parseDay, getMortgageRatesToday, getMortgageRateOnDate, getMortgageRateHistory,
  calculateMortgagePayment, InputError, UpstreamError, UTM, PMMS_CSV,
} from '../dist/core.js';

const csv = readFileSync(new URL('./fixtures/PMMS_history-2026-11-05.csv', import.meta.url), 'utf8');
const f = async (url) => { assert.equal(url, PMMS_CSV); return csv; };
const NOV5 = Date.UTC(2026, 10, 5, 12);

test('parse: 2,901 weeks from 1971-04-02 to 2026-10-29, blanks as null', () => {
  const w = parsePmms(csv);
  assert.equal(w.length, 2901); assert.equal(w[0].date, '1971-04-02'); assert.equal(w[0].r30, 7.33); assert.equal(w[0].r15, null);
  assert.deepEqual(w[w.length - 1], { date: '2026-10-29', r30: 7.24, p30: null, r15: 6.6, p15: null, arm51: null });
});
test('parse: bad header and short file are upstream errors', () => {
  assert.throws(() => parsePmms('<html>blocked</html>'), UpstreamError);
  assert.throws(() => parsePmms('date,pmms30\n1/1/2020,3.7\n'), UpstreamError);
});
test('today: 7.24% 30-year, down 0.08 from 7.32, 6.17% a year ago; 15-year 6.60%, 5.41% a year ago', async () => {
  const r = await getMortgageRatesToday(f, NOV5);
  assert.equal(r.week_of, '2026-10-29'); assert.equal(r.thirty_year_fixed.rate, 7.24); assert.equal(r.thirty_year_fixed.week_change, -0.08);
  assert.equal(r.thirty_year_fixed.year_ago, 6.17); assert.equal(r.year_ago_week, '2025-10-30'); assert.equal(r.fifteen_year_fixed.rate, 6.6);
  assert.equal(r.fifteen_year_fixed.year_ago, 5.41); assert.equal(r.fifteen_year_fixed.week_change, -0.08);
  assert.ok(r.more.includes(UTM)); assert.match(r.summary, /Freddie Mac/);
});
test('today: 52-week high 7.40 and low 5.98', async () => {
  const r = await getMortgageRatesToday(f, NOV5);
  assert.equal(r.thirty_year_fixed.high_52_week, 7.4); assert.equal(r.thirty_year_fixed.low_52_week, 5.98);
});
test('next release: Thursday after the latest week, rolled forward once noon ET has passed', () => {
  assert.equal(nextRelease('2026-10-29', NOV5), '2026-11-05');
  assert.equal(nextRelease('2026-10-29', Date.UTC(2026, 10, 6, 0)), '2026-11-12');
});
test('on date: 2021-01-07 is the record low 2.65% (15-year 2.16%, 5/1 ARM 2.75%, 0.7 points)', async () => {
  const r = await getMortgageRateOnDate(f, { date: '2021-01-07' });
  assert.equal(r.thirty_year_fixed, 2.65); assert.equal(r.fifteen_year_fixed, 2.16); assert.equal(r.five_one_arm, 2.75); assert.equal(r.thirty_year_points, 0.7);
});
test('on date: 1981-10-15 falls in the week of 1981-10-09 at 18.63%, before the 15-year series', async () => {
  const r = await getMortgageRateOnDate(f, { date: '1981-10-15' });
  assert.equal(r.week_of, '1981-10-09'); assert.equal(r.thirty_year_fixed, 18.63); assert.equal(r.fifteen_year_fixed, null);
  await assert.rejects(getMortgageRateOnDate(f, { date: '1970-01-01' }), InputError);
});
test('weekOn finds the 15-year start 1991-08-30; parseDay rejects bad dates', () => {
  const w = parsePmms(csv);
  assert.equal(weekOn(w, '1991-09-01', '15').date, '1991-08-30'); assert.equal(weekOn(w, '1991-08-29', '15'), null);
  assert.throws(() => parseDay('2024-02-30'), InputError);
});
test('history 2020 to 2026 annual: high 7.79% week of 2023-10-26, low 2.65% week of 2021-01-07, 7 years', async () => {
  const r = await getMortgageRateHistory(f, { start_date: '2020-01-01', end_date: '2026-12-31', frequency: 'annual' });
  assert.equal(r.high.rate, 7.79); assert.equal(r.high.week_of, '2023-10-26'); assert.equal(r.low.rate, 2.65); assert.equal(r.series.length, 7);
  assert.equal(r.series[0].period, '2020');
});
test('history default: last 52 weeks of the 30-year, weekly rows ending 2026-10-29', async () => {
  const r = await getMortgageRateHistory(f, {}, NOV5);
  assert.equal(r.frequency, 'weekly'); assert.equal(r.end, '2026-10-29'); assert.ok(r.series.length >= 50 && r.series.length <= 53);
  await assert.rejects(getMortgageRateHistory(f, { start_date: '2025-01-01', end_date: '2024-01-01' }), InputError);
});
test('payment math: $200,000 at 6% for 30 years is $1,199.10; at 0% is principal / n', () => {
  assert.equal(Math.round(monthlyPayment(200000, 6, 30) * 100) / 100, 1199.1);
  assert.equal(Math.round(monthlyPayment(300000, 5, 15) * 100) / 100, 2372.38);
  assert.equal(monthlyPayment(120000, 0, 10), 1000);
});
test('payment at today\'s average: $400,000 at 7.24% is $2,725.99 vs $2,442.09 at 6.17%', async () => {
  const r = await calculateMortgagePayment(f, { loan_amount: 400000 });
  assert.equal(r.rate, 7.24); assert.equal(r.pmms_week, '2026-10-29'); assert.equal(r.monthly_principal_and_interest, 2725.99);
  assert.equal(r.compare_rate, 6.17); assert.equal(r.compare_monthly_payment, 2442.09); assert.equal(r.monthly_difference, 283.9);
  const r15 = await calculateMortgagePayment(f, { loan_amount: 400000, term_years: 15 });
  assert.equal(r15.rate, 6.6);
  await assert.rejects(calculateMortgagePayment(null, { loan_amount: 400000, term_years: 20 }), InputError);
});
test('stdio: initialize, tools/list and an offline tools/call over JSON-RPC', async () => {
  const child = spawn(process.execPath, [new URL('../dist/stdio.js', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = []; let buf = '';
  const got = (id) => new Promise((res) => { const iv = setInterval(() => { const m = lines.find((l) => l.id === id); if (m) { clearInterval(iv); res(m); } }, 10); });
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
  send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal((await got(1)).result.serverInfo.name, 'mortgage-rates-today-mcp');
  send({ method: 'notifications/initialized' });
  send({ id: 2, method: 'tools/list' });
  assert.deepEqual((await got(2)).result.tools.map((t) => t.name), ['get_mortgage_rates_today', 'get_mortgage_rate_on_date', 'get_mortgage_rate_history', 'calculate_mortgage_payment']);
  send({ id: 3, method: 'tools/call', params: { name: 'calculate_mortgage_payment', arguments: { loan_amount: 200000, rate: 6, compare_rate: 5 } } });
  assert.equal((await got(3)).result.structuredContent.monthly_principal_and_interest, 1199.1);
  child.kill();
});
