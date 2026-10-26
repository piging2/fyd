import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, fsyncSync, renameSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const reference = join(here, '../reference/worker-20261025.mjs');
export const referenceHash = 'ef705ec76e609f6d72ac0707076c124cee5b46d03f3b5e4a5343025abdcadb46';
export function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
export function durableJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  let fd = openSync(temporary, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
  fd = openSync(dirname(path), 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function durableAppend(path, data) {
  appendFileSync(path, JSON.stringify(data) + '\n', { mode: 0o600 });
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
const clone = value => JSON.parse(JSON.stringify(value));
const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

export async function fixtures(directory, scenario) {
  mkdirSync(directory, { recursive: true });
  const statePath = join(directory, 'state.json');
  const ledgerPath = join(directory, 'smtp-acceptance.jsonl');
  const operationsPath = join(directory, 'storage-operations.jsonl');
  writeFileSync(ledgerPath, '', { mode: 0o600 });
  writeFileSync(operationsPath, '', { mode: 0o600 });
  const pathname = `outbox/v1/production/ping-fyd/nomination/${hash(scenario)}.json`;
  durableJson(statePath, {
    version: 1, tenantId: 'ping-fyd', environment: 'production', kind: 'nomination', key: hash(scenario),
    receipt: { receiptId: 'nm-p0-synthetic', refId: 'nom-p0-synthetic', businessName: 'Synthetic fixture', receivedAt: '2026-01-01T00:00:00.000Z' },
    payload: { synthetic: true },
    mail: { from: 'sender@example.invalid', to: 'operator@example.invalid', subject: 'P0 synthetic notification', text: 'logical-submission=nm-p0-synthetic\nSynthetic data only.\n' },
    persistence: { state: 'persisted', at: '2026-01-01T00:00:00.000Z', store: 'vercel-blob', pathname },
    delivery: { state: 'pending', attempts: 0, claimedAt: null, claimedBy: null, messageId: null, deliveredAt: null, lastError: null, nextRetryAt: null },
  });
  durableJson(join(directory, 'initial-state.json'), JSON.parse(readFileSync(statePath, 'utf8')));
  const readState = () => JSON.parse(readFileSync(statePath, 'utf8'));
  const ledger = [];
  const getCounts = new Map();
  let failDelivered = scenario === 'accepted-state-write-failure';
  const raceResponses = new Map();
  let raceB;
  const storage = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || request.url !== '/rpc') throw new Error('invalid fixture endpoint');
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const { actor, op } = input;
      const answer = (data, status = 200) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(data));
      };
      if (!['A', 'B'].includes(actor)) throw new Error('unknown fixture actor');
      if (op !== 'list' && input.pathname !== pathname) throw new Error('wrong fixture key');
      if (op === 'list') {
        durableAppend(operationsPath, { actor, op });
        return answer({ blobs: [{ pathname }], hasMore: false });
      }
      if (op === 'get') {
        const ordinal = (getCounts.get(actor) ?? 0) + 1;
        getCounts.set(actor, ordinal);
        const record = readState();
        durableAppend(operationsPath, { actor, op, ordinal, delivery: record.delivery });
        // Both delivery reads observe pending; A claims/sends first, then B
        // receives its earlier snapshot. This is an allowed stale-read race.
        if (scenario === 'simultaneous-claims' && ordinal === 2) {
          if (actor === 'B') raceB = () => answer({ record });
          else raceResponses.set('A', () => answer({ record }));
          if (raceB && raceResponses.has('A')) raceResponses.get('A')();
          return;
        }
        return answer({ record });
      }
      if (op === 'put') {
        if (input.options.allowOverwrite !== true) throw new Error('reference overwrite behavior changed');
        if (failDelivered && input.body.delivery.state === 'delivered') {
          failDelivered = false;
          durableAppend(operationsPath, { actor, op, rejected: true, reason: 'injected-success-persistence-failure', delivery: input.body.delivery });
          return answer({ error: 'P0 injected failure persisting accepted SMTP result' }, 503);
        }
        durableJson(statePath, input.body);
        durableAppend(operationsPath, { actor, op, committed: true, delivery: input.body.delivery });
        return answer({ pathname });
      }
      throw new Error('unknown fixture operation');
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  const sockets = new Set();
  const smtp = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.write('220 p0.local synthetic SMTP fixture\r\n');
    let buffer = '', inData = false, lines = [];
    socket.on('data', bytes => {
      buffer += bytes.toString('utf8');
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n');
        const line = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);
        if (inData) {
          if (line !== '.') { lines.push(line.replace(/^\.\./, '.')); continue; }
          const wire = lines.join('\n');
          const logicalId = wire.match(/logical-submission=([a-z0-9-]+)/)?.[1];
          if (logicalId !== 'nm-p0-synthetic') {
            socket.write('550 fixture accepts synthetic notification only\r\n');
          } else {
            const entry = { sequence: ledger.length + 1, logicalId, fingerprint: hash(logicalId), messageId: wire.match(/^Message-ID:\s*(.+)$/im)?.[1] ?? null, wireSha256: hash(wire), endOfDataAccepted: true };
            durableAppend(ledgerPath, entry); // independent durable acceptance BEFORE 250
            ledger.push(entry);
            socket.write(`250 2.0.0 P0-accepted-${entry.sequence}\r\n`);
          }
          inData = false; lines = [];
        } else if (/^(EHLO|HELO) /i.test(line)) socket.write('250-p0.local\r\n250 SIZE 1048576\r\n');
        else if (/^MAIL FROM:/i.test(line)) socket.write('250 2.1.0 OK\r\n');
        else if (/^RCPT TO:<operator@example.invalid>$/i.test(line)) socket.write('250 2.1.5 OK\r\n');
        else if (/^RCPT TO:/i.test(line)) socket.write('550 fixture recipient only\r\n');
        else if (/^DATA$/i.test(line)) { inData = true; lines = []; socket.write('354 End with dot\r\n'); }
        else if (/^QUIT$/i.test(line)) socket.end('221 Bye\r\n');
        else if (/^RSET$/i.test(line)) socket.write('250 Reset\r\n');
        else socket.write('502 command not implemented by P0 fixture\r\n');
      }
    });
  });
  const storagePort = await listen(storage);
  const smtpPort = await listen(smtp);
  const children = [];

  function worker(actor, { time = 0, barrier = '' } = {}) {
    const child = spawn(process.execPath, ['--import', join(here, 'bootstrap.mjs'), reference], {
      cwd: directory, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        PATH: dirname(process.execPath), FYD_P0_CHILD: '1', FYD_P0_DIR: directory,
        FYD_P0_ACTOR: actor, FYD_P0_STORAGE_PORT: String(storagePort), FYD_P0_SMTP_PORT: String(smtpPort),
        FYD_P0_TIME_MS: String(time), FYD_P0_BARRIER: barrier,
        BLOB_READ_WRITE_TOKEN: 'P0_SYNTHETIC_TOKEN_NOT_REAL',
        YAHOO_EMAIL: 'sender@example.invalid', YAHOO_APP_PASSWORD: 'P0_SYNTHETIC_PASSWORD_NOT_REAL',
      },
    });
    const messages = [], waiters = [];
    let stdout = '', stderr = '', exit = null;
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('message', message => {
      messages.push(message);
      for (const waiter of [...waiters]) if (waiter.predicate(message)) waiter.resolve(message);
    });
    const exited = new Promise(resolve => child.on('exit', (code, signal) => {
      exit = { code, signal }; resolve(exit);
    }));
    const handle = {
      actor, child, messages,
      async wait(predicate) {
        const found = messages.find(predicate);
        if (found) return found;
        return new Promise((resolve, reject) => {
          const waiter = { predicate, resolve: message => { clearTimeout(timer); waiters.splice(waiters.indexOf(waiter), 1); resolve(message); } };
          const timer = setTimeout(() => {
            const index = waiters.indexOf(waiter); if (index >= 0) waiters.splice(index, 1);
            reject(new Error(`P0 ${scenario}/${actor} timeout; exit=${JSON.stringify(exit)} stderr=${stderr} stdout=${stdout}`));
          }, 12000);
          waiters.push(waiter);
        });
      },
      release(name) { child.send({ kind: 'release', name }); },
      async kill() {
        if (!exit) child.kill('SIGKILL');
        await exited;
        durableJson(join(directory, `worker-${actor}.json`), { actor, pid: child.pid, exit, messages, stdout, stderr });
        return exit;
      },
    };
    children.push(handle);
    return handle;
  }
  return {
    directory, pathname, readState, ledger, worker,
    releaseRaceB() {
      if (!raceB) throw new Error('B did not reach its pending-read barrier');
      raceB(); raceB = null;
    },
    snapshot(name) { const state = readState(); durableJson(join(directory, `${name}.json`), state); return clone(state); },
    async close() {
      await Promise.all(children.map(child => child.kill()));
      storage.closeAllConnections();
      for (const socket of sockets) socket.destroy();
      await Promise.all([new Promise(resolve => storage.close(resolve)), new Promise(resolve => smtp.close(resolve))]);
    },
    assertIsolation() {
      for (const child of children) {
        if (child.messages.some(event => event.kind === 'isolation-block')) throw new Error('unexpected isolation violation');
        if (child.messages.filter(event => event.kind === 'credential-read-blocked').length !== 2) throw new Error('reference credential reads did not use denial shim');
        if (!child.messages.some(event => event.kind === 'isolation-ready')) throw new Error('isolation bootstrap did not run');
        if (!child.messages.some(event => event.kind === 'isolation-self-check' && event.rejectedDestinations === 3 && event.rejectedDns && event.rejectedFetch)) throw new Error('isolation self-check did not pass');
      }
    },
  };
}
