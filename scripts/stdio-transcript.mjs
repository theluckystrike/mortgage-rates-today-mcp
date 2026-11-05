// Raw stdio round trip: spawns the built server, sends initialize, notifications/initialized,
// tools/list and one live tools/call per entry in scripts/stdio-calls.json, and records every
// JSON-RPC line sent and received with a timestamp.
// Usage: node scripts/stdio-transcript.mjs [out-file]   (default .live/stdio-transcript.jsonl)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const out = process.argv[2] ?? '.live/stdio-transcript.jsonl';
const calls = JSON.parse(readFileSync(new URL('./stdio-calls.json', import.meta.url), 'utf8'));
const child = spawn(process.execPath, ['dist/stdio.js'], { stdio: ['pipe', 'pipe', 'inherit'] });
const log = [];
const pending = new Map();
let buf = '';
child.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    log.push({ t: new Date().toISOString(), dir: 'recv', msg: JSON.parse(line) });
    const m = JSON.parse(line);
    if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
let nextId = 1;
const send = (method, params, notify = false) => {
  const msg = notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: nextId++, method, params };
  log.push({ t: new Date().toISOString(), dir: 'send', msg });
  child.stdin.write(JSON.stringify(msg) + '\n');
  if (notify) return Promise.resolve(null);
  return new Promise((res, rej) => {
    pending.set(msg.id, res);
    setTimeout(() => rej(new Error(`timeout on ${method}`)), 60000);
  });
};

let bad = 0;
const init = await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stdio-transcript', version: '1.0.0' } });
console.log('initialize:', JSON.stringify(init.result.serverInfo));
await send('notifications/initialized', {}, true);
const list = await send('tools/list', {});
console.log('tools/list:', list.result.tools.map((t) => t.name).join(', '));
for (const [name, args] of calls) {
  const r = await send('tools/call', { name, arguments: args });
  const err = r.error || r.result?.isError;
  if (err) bad++;
  console.log(`tools/call ${name} ${err ? 'ERROR' : 'ok'}: ${(r.result?.content?.[0]?.text ?? JSON.stringify(r.error)).split('\n\n')[0].slice(0, 400)}`);
}
child.stdin.end();
child.kill();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, log.map((l) => JSON.stringify(l)).join('\n') + '\n');
console.log(`wrote ${log.length} lines to ${out}; tool errors: ${bad}`);
process.exit(bad ? 1 : 0);
