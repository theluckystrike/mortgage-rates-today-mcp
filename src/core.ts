// Pure core for mortgage-rates-today-mcp. The only I/O is a keyless read of the Freddie Mac Primary Mortgage Market
// Survey (PMMS) history file, done through an injected fetchText. Freddie Mac allows use of PMMS with attribution.
import type { FetchText } from './types.js';

export const REPO = 'mortgage-rates-today-mcp';
export const SITE = 'https://www.mcpstamp.com';
export const UTM = `utm_source=mcp&utm_medium=${REPO}`;
export const PMMS_CSV = 'https://www.freddiemac.com/pmms/docs/PMMS_history.csv';
export const PMMS_PAGE = 'https://www.freddiemac.com/pmms';
export const ATTRIBUTION = 'Source: Freddie Mac Primary Mortgage Market Survey (PMMS), U.S. weekly averages.';
export const more = () => `${SITE}/servers/?${UTM}`;

export class InputError extends Error {}
export class UpstreamError extends Error {}

export interface Week { date: string; r30: number | null; p30: number | null; r15: number | null; p15: number | null; arm51: number | null }
export type Term = '30' | '15';

const num = (s: string | undefined) => {
  const t = (s ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Parse PMMS_history.csv (date,pmms30,pmms30p,pmms15,pmms15p,pmms51,...; dates M/D/YYYY), oldest first. */
export function parsePmms(csv: string): Week[] {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || !/^date,pmms30/i.test(lines[0])) throw new UpstreamError('the Freddie Mac PMMS file did not have the expected header (date,pmms30,...)');
  const out: Week[] = [];
  for (const l of lines.slice(1)) {
    const c = l.split(',');
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(c[0].trim());
    if (!m) continue;
    out.push({ date: `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`, r30: num(c[1]), p30: num(c[2]), r15: num(c[3]), p15: num(c[4]), arm51: num(c[5]) });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (out.length < 100) throw new UpstreamError('the Freddie Mac PMMS file had too few rows');
  return out;
}

export async function loadPmms(fetchText: FetchText): Promise<Week[]> {
  return parsePmms(await fetchText(PMMS_CSV, { cacheTtl: 3600, timeoutMs: 15000, accept: 'text/csv,text/plain,*/*' }));
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const rate = (w: Week, t: Term) => (t === '30' ? w.r30 : w.r15);
const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const signed = (n: number) => `${n > 0 ? 'up' : n < 0 ? 'down' : 'unchanged'}${n ? ` ${Math.abs(n).toFixed(2)} points` : ''}`;

export function parseDay(s: string, what = 'date'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m || Number.isNaN(day(s.trim())) || isoDay(day(s.trim())) !== s.trim()) throw new InputError(`"${s}" is not a ${what}. Use YYYY-MM-DD, for example 2024-06-13.`);
  return s.trim();
}

/** The latest PMMS week dated on or before `d`. */
export function weekOn(weeks: Week[], d: string, t?: Term): Week | null {
  let hit: Week | null = null;
  for (const w of weeks) { if (w.date > d) break; if (!t || rate(w, t) !== null) hit = w; }
  return hit;
}

/** PMMS is released Thursdays at noon Eastern. The next release after the latest week, unless that is already past. */
export function nextRelease(latest: string, nowMs: number): string {
  let t = day(latest) + 7 * 86400000;
  while (t + 17 * 3600000 < nowMs) t += 7 * 86400000;
  return isoDay(t);
}

// ---------------------------------------------------------------- tools

export async function getMortgageRatesToday(fetchText: FetchText, nowMs = Date.now()) {
  const weeks = await loadPmms(fetchText);
  const last = weeks[weeks.length - 1];
  const prev = weeks[weeks.length - 2];
  const yearAgo = weekNearest(weeks, isoDay(day(last.date) - 364 * 86400000));
  const since = isoDay(day(last.date) - 364 * 86400000);
  const year = weeks.filter((w) => w.date > since);
  const stats = (t: Term) => {
    const v = year.map((w) => rate(w, t)).filter((x): x is number => x !== null);
    return { high_52_week: Math.max(...v), low_52_week: Math.min(...v), average_52_week: r2(v.reduce((a, b) => a + b, 0) / v.length) };
  };
  const ageDays = Math.floor((nowMs - day(last.date)) / 86400000);
  const term = (t: Term) => {
    const cur = rate(last, t), p = rate(prev, t), y = yearAgo ? rate(yearAgo, t) : null;
    return { rate: cur, week_change: cur !== null && p !== null ? r2(cur - p) : null, year_ago: y, year_change: cur !== null && y !== null ? r2(cur - y) : null, ...stats(t) };
  };
  const t30 = term('30'), t15 = term('15');
  return {
    summary:
      `The Freddie Mac average 30-year fixed mortgage rate is ${t30.rate?.toFixed(2)}% for the week of ${last.date} (${signed(t30.week_change ?? 0)} from the week before, ${t30.year_ago?.toFixed(2)}% a year ago). ` +
      `The 15-year fixed average is ${t15.rate?.toFixed(2)}%. These are national averages for well-qualified borrowers, released on Thursdays; the next release is due ${nextRelease(last.date, nowMs)}. ` +
      `${ATTRIBUTION}`,
    week_of: last.date,
    data_age_days: ageDays,
    thirty_year_fixed: t30,
    fifteen_year_fixed: t15,
    year_ago_week: yearAgo?.date ?? null,
    next_release_expected: nextRelease(last.date, nowMs),
    note: 'PMMS is a national average of rates on purchase applications submitted to Freddie Mac: conventional, conforming, good to excellent credit, 20 percent down, owner-occupied single-family homes. A quoted rate depends on credit, down payment, points, loan type and lender. In November 2022 Freddie Mac stopped publishing the 5/1 ARM and fees and points. When a US holiday falls on a Thursday, PMMS publishes on the Wednesday.',
    as_of: new Date(nowMs).toISOString(),
    source: PMMS_PAGE,
    data_file: PMMS_CSV,
    more: more(),
  };
}

function weekNearest(weeks: Week[], d: string): Week | null {
  let best: Week | null = null, bd = Infinity;
  for (const w of weeks) { const x = Math.abs(day(w.date) - day(d)); if (x < bd) { bd = x; best = w; } }
  return best && bd <= 7 * 86400000 ? best : null;
}

export async function getMortgageRateOnDate(fetchText: FetchText, a: { date: string }) {
  const d = parseDay(a.date);
  const weeks = await loadPmms(fetchText);
  if (d < weeks[0].date) throw new InputError(`PMMS starts with the week of ${weeks[0].date}.`);
  const w = weekOn(weeks, d)!;
  const w15 = weekOn(weeks, d, '15');
  const stale = Math.floor((day(d) - day(w.date)) / 86400000);
  return {
    summary:
      `On ${d} the latest Freddie Mac weekly average (week of ${w.date}) was ${w.r30}% for a 30-year fixed mortgage` +
      `${w.r15 !== null ? ` and ${w.r15}% for a 15-year fixed` : w15 ? `; the 15-year series started later (${w15.date})` : '; the 15-year series started in 1991'}` +
      `${w.arm51 !== null ? `, with the 5/1 ARM at ${w.arm51}%` : ''}${w.p30 !== null ? `. Average points on the 30-year were ${w.p30}` : ''}. ${ATTRIBUTION}`,
    date: d,
    week_of: w.date,
    days_after_release: stale,
    thirty_year_fixed: w.r30,
    thirty_year_points: w.p30,
    fifteen_year_fixed: w.r15,
    fifteen_year_points: w.p15,
    five_one_arm: w.arm51,
    note: stale > 14 ? 'The date is after the latest PMMS week, so the latest available week is shown.' : null,
    as_of: new Date().toISOString(),
    source: PMMS_PAGE,
    data_file: PMMS_CSV,
    more: more(),
  };
}

export async function getMortgageRateHistory(fetchText: FetchText, a: { start_date?: string; end_date?: string; term?: Term; frequency?: 'weekly' | 'monthly' | 'annual' }, nowMs = Date.now()) {
  const weeks = await loadPmms(fetchText);
  const t: Term = a.term ?? '30';
  const end = a.end_date ? parseDay(a.end_date, 'end date') : weeks[weeks.length - 1].date;
  const start = a.start_date ? parseDay(a.start_date, 'start date') : isoDay(day(end) - 364 * 86400000);
  if (start > end) throw new InputError('start_date is after end_date.');
  const rows = weeks.filter((w) => w.date >= start && w.date <= end && rate(w, t) !== null);
  if (!rows.length) throw new InputError(`No ${t}-year PMMS weeks between ${start} and ${end}. The 30-year series starts 1971-04-02 and the 15-year series 1991-08-30.`);
  const freq = a.frequency ?? (rows.length > 156 ? 'monthly' : 'weekly');
  const group = (k: (d: string) => string) => {
    const m = new Map<string, number[]>();
    for (const w of rows) { const g = k(w.date); m.set(g, [...(m.get(g) ?? []), rate(w, t)!]); }
    return [...m].map(([period, v]) => ({ period, average: r2(v.reduce((x, y) => x + y, 0) / v.length), high: Math.max(...v), low: Math.min(...v), weeks: v.length }));
  };
  const series = freq === 'weekly' ? rows.map((w) => ({ week_of: w.date, rate: rate(w, t)! })) : group(freq === 'monthly' ? (d) => d.slice(0, 7) : (d) => d.slice(0, 4));
  if (series.length > 600) throw new InputError(`That is ${series.length} ${freq} rows. Use a shorter range or frequency "annual".`);
  const vals = rows.map((w) => rate(w, t)!);
  const hi = rows.reduce((b, w) => (rate(w, t)! > rate(b, t)! ? w : b)), lo = rows.reduce((b, w) => (rate(w, t)! < rate(b, t)! ? w : b));
  const first = vals[0], last = vals[vals.length - 1];
  return {
    summary:
      `Freddie Mac ${t}-year fixed average from ${rows[0].date} to ${rows[rows.length - 1].date}: ${first}% to ${last}% (${signed(r2(last - first))}). ` +
      `High ${rate(hi, t)}% (week of ${hi.date}), low ${rate(lo, t)}% (week of ${lo.date}), average ${r2(vals.reduce((x, y) => x + y, 0) / vals.length)}% over ${vals.length} weeks. ${ATTRIBUTION}`,
    term_years: Number(t),
    frequency: freq,
    start: rows[0].date,
    end: rows[rows.length - 1].date,
    weeks: vals.length,
    high: { rate: rate(hi, t), week_of: hi.date },
    low: { rate: rate(lo, t), week_of: lo.date },
    series,
    as_of: new Date(nowMs).toISOString(),
    source: PMMS_PAGE,
    data_file: PMMS_CSV,
    more: more(),
  };
}

/** Standard amortizing payment: P r / (1 - (1 + r)^-n), r = annual / 12. */
export function monthlyPayment(principal: number, annualPct: number, years: number): number {
  const n = years * 12, r = annualPct / 100 / 12;
  return r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
}

export async function calculateMortgagePayment(fetchText: FetchText | null, a: { loan_amount: number; rate?: number; term_years?: number; compare_rate?: number }) {
  if (!(a.loan_amount >= 1000 && a.loan_amount <= 1e8)) throw new InputError('loan_amount must be between $1,000 and $100,000,000.');
  const years = a.term_years ?? 30;
  if (!Number.isInteger(years) || years < 1 || years > 40) throw new InputError('term_years must be a whole number from 1 to 40.');
  let used = a.rate, from = 'given rate', week: string | null = null, yearAgoRate: number | null = null;
  if (used === undefined || a.compare_rate === undefined) {
    if (fetchText && (years === 30 || years === 15)) {
      const weeks = await loadPmms(fetchText);
      const t: Term = years === 15 ? '15' : '30';
      const last = weekOn(weeks, '9999-12-31', t)!;
      if (used === undefined) { used = rate(last, t)!; from = `Freddie Mac PMMS ${t}-year average, week of ${last.date}`; week = last.date; }
      const ya = weekNearest(weeks, isoDay(day(last.date) - 364 * 86400000));
      yearAgoRate = ya ? rate(ya, t) : null;
    } else if (used === undefined) {
      throw new InputError('Give a rate, or use term_years 30 or 15 to use the latest Freddie Mac average.');
    }
  }
  if (!(used! > 0 && used! < 30)) throw new InputError('rate is an annual percent between 0 and 30, for example 6.5.');
  const pay = monthlyPayment(a.loan_amount, used!, years);
  const total = pay * years * 12;
  const cmpRate = a.compare_rate ?? yearAgoRate;
  const cmp = cmpRate !== null && cmpRate !== undefined ? monthlyPayment(a.loan_amount, cmpRate, years) : null;
  const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return {
    summary:
      `A ${usd(a.loan_amount)} ${years}-year fixed loan at ${used}% (${from}) costs ${usd(r2(pay))} a month in principal and interest, ${usd(r2(total - a.loan_amount))} of interest over the full term.` +
      (cmp !== null ? ` At ${cmpRate}%${a.compare_rate === undefined ? ' (the average a year earlier)' : ''} it would be ${usd(r2(cmp))}, a difference of ${usd(r2(pay - cmp))} a month.` : '') +
      ' Taxes, insurance and PMI are not included.',
    loan_amount: a.loan_amount,
    rate: used,
    rate_source: from,
    pmms_week: week,
    term_years: years,
    monthly_principal_and_interest: r2(pay),
    total_paid: r2(total),
    total_interest: r2(total - a.loan_amount),
    compare_rate: cmpRate ?? null,
    compare_monthly_payment: cmp !== null ? r2(cmp) : null,
    monthly_difference: cmp !== null ? r2(pay - cmp) : null,
    as_of: new Date().toISOString(),
    source: week ? PMMS_PAGE : 'standard amortization formula',
    more: more(),
  };
}
