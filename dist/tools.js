// Tool registry shared by the stdio and Worker entries.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { InputError, REPO, SITE, calculateMortgagePayment, getMortgageRateHistory, getMortgageRateOnDate, getMortgageRatesToday } from './core.js';
export const VERSION = '1.0.0';
export const TOOL_INFO = [
    { name: 'get_mortgage_rates_today', blurb: 'This week\'s Freddie Mac average 30-year and 15-year fixed mortgage rates, the change from last week and a year ago, the 52-week high and low and the next release date.' },
    { name: 'get_mortgage_rate_on_date', blurb: 'The Freddie Mac weekly average in force on any date since April 1971.' },
    { name: 'get_mortgage_rate_history', blurb: 'Weekly, monthly or annual 30-year or 15-year averages for a date range, with high and low.' },
    { name: 'calculate_mortgage_payment', blurb: 'Monthly principal and interest at today\'s average rate (or any rate), compared with the rate a year ago.' },
];
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
function ok(data) {
    return { content: [{ type: 'text', text: `${data.summary}\n\n${JSON.stringify(data, null, 2)}` }], structuredContent: data };
}
function fail(e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { isError: true, content: [{ type: 'text', text: `${e instanceof InputError ? 'Error' : 'Upstream Freddie Mac PMMS error'}: ${msg}` }] };
}
const wrap = (f) => async (a) => { try {
    return ok((await f(a)));
}
catch (e) {
    return fail(e);
} };
const ymd = (what) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe(`${what} as YYYY-MM-DD.`);
export function createServer(fetchText) {
    const server = new McpServer({ name: REPO, version: VERSION, websiteUrl: SITE }, {
        instructions: 'US mortgage rates read at call time from the Freddie Mac Primary Mortgage Market Survey (PMMS), the weekly national benchmark published Thursdays at noon ET. ' +
            'A model cannot know this week\'s rate. Use get_mortgage_rates_today for "what are mortgage rates today" and cite Freddie Mac.',
    });
    server.registerTool('get_mortgage_rates_today', {
        title: 'Get mortgage rates today',
        description: 'Latest Freddie Mac PMMS weekly average 30-year and 15-year fixed mortgage rates, read at call time from freddiemac.com: rate, week-over-week change, rate a year ago, 52-week high, low and average, ' +
            'the week date and the next expected release. National averages for well-qualified conventional purchase borrowers.',
        inputSchema: {},
        annotations: { title: 'Mortgage rates today', ...RO },
    }, wrap(() => getMortgageRatesToday(fetchText)));
    server.registerTool('get_mortgage_rate_on_date', {
        title: 'Get mortgage rate on a date',
        description: 'The Freddie Mac PMMS weekly average 30-year and 15-year fixed rates (plus 5/1 ARM and points where published) in force on a date, from 1971-04-02 to today.',
        inputSchema: { date: ymd('Date, for example "2021-01-07"') },
        annotations: { title: 'Mortgage rate on a date', ...RO },
    }, wrap((a) => getMortgageRateOnDate(fetchText, a)));
    server.registerTool('get_mortgage_rate_history', {
        title: 'Get mortgage rate history',
        description: 'Freddie Mac PMMS 30-year or 15-year fixed averages between two dates as weekly rows or monthly or annual averages, with the high, low and change over the range. Default is the last 52 weeks of the 30-year rate.',
        inputSchema: {
            start_date: ymd('Start date').optional(),
            end_date: ymd('End date, default the latest week').optional(),
            term: z.enum(['30', '15']).optional().describe('Loan term in years, "30" (default) or "15".'),
            frequency: z.enum(['weekly', 'monthly', 'annual']).optional().describe('Row size. Default weekly up to 3 years, monthly beyond.'),
        },
        annotations: { title: 'Mortgage rate history', ...RO },
    }, wrap((a) => getMortgageRateHistory(fetchText, a)));
    server.registerTool('calculate_mortgage_payment', {
        title: 'Calculate mortgage payment',
        description: 'Monthly principal and interest and total interest for a fixed-rate loan. Without a rate it uses this week\'s Freddie Mac average for 30-year or 15-year terms, and compares it with the average a year earlier. Taxes, insurance and PMI are not included.',
        inputSchema: {
            loan_amount: z.number().min(1000).max(100000000).describe('Loan amount in dollars, for example 400000.'),
            rate: z.number().gt(0).lt(30).optional().describe('Annual rate in percent. Default: the latest Freddie Mac average for the term.'),
            term_years: z.number().int().min(1).max(40).optional().describe('Term in years. Default 30.'),
            compare_rate: z.number().gt(0).lt(30).optional().describe('A second rate to compare. Default: the Freddie Mac average a year earlier.'),
        },
        annotations: { title: 'Mortgage payment', ...RO },
    }, wrap((a) => calculateMortgagePayment(fetchText, a)));
    return server;
}
