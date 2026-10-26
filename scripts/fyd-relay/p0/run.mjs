import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { fixtures, reference, referenceHash, hash, durableJson } from './fixtures.mjs';

const args = process.argv.slice(2);
function argument(name, fallback) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}
const repetitions = Number(argument('--repetitions', '1'));
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 1000) throw new Error('repetitions must be 1..1000');
const cases = ['simultaneous-claims', 'accepted-state-write-failure', 'crash-after-acceptance', 'crash-before-smtp', 'crash-after-durable-success'];
const selected = argument('--case', 'all');
if (selected !== 'all' && !cases.includes(selected)) throw new Error('unknown P0 case');
assert.equal(hash(readFileSync(reference)), referenceHash, 'archived reference must remain byte-identical');
const base = process.env.FYD_RELAY_P0_ARTIFACT_DIR ?? tmpdir();
mkdirSync(base, { recursive: true });
const output = mkdtempSync(join(base, 'relay-p0-'));
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const rootLock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const referenceLock = JSON.parse(readFileSync(join(root, 'scripts/fyd-relay/reference/package-lock.json'), 'utf8'));
const metadata = {
  schema: 'fyd-relay-p0-results@1', startedAt: new Date().toISOString(),
  node: process.version, execPath: process.execPath, platform: process.platform, arch: process.arch,
  referenceSha256: referenceHash, rootLockSha256: hash(readFileSync(join(root, 'package-lock.json'))),
  referenceLockSha256: hash(readFileSync(join(root, 'scripts/fyd-relay/reference/package-lock.json'))),
  nodemailerExecuted: require('nodemailer/package.json').version,
  fydBlobLocked: rootLock.packages['node_modules/@vercel/blob'].version,
  externalWorkerBlobLocked: referenceLock.packages['node_modules/@vercel/blob'].version,
  blobExecuted: 'test-only HTTP durable-storage facade; real Blob SDK and production Blob NOT executed',
  smtpExecuted: 'locked Nodemailer over synthetic plaintext loopback SMTP; production TLS/auth NOT exercised',
  repetitions, results: [],
};
durableJson(join(output, 'results.json'), metadata);
const idle = child => child.wait(message => message.kind === 'idle');
const barrier = (child, name) => child.wait(message => message.kind === 'barrier' && message.name === name);
try {
  for (let iteration = 1; iteration <= repetitions; iteration++) {
    for (const scenario of selected === 'all' ? cases : [selected]) {
      const fixture = await fixtures(join(output, `${scenario}-${String(iteration).padStart(3, '0')}`), scenario);
      const evidence = { scenario, iteration, directory: fixture.directory, status: 'pending', pids: [] };
      try {
        if (scenario === 'simultaneous-claims') {
          const a = fixture.worker('A', { barrier: 'after-acceptance' });
          const b = fixture.worker('B', { time: 1 });
          evidence.pids = [a.child.pid, b.child.pid];
          await barrier(a, 'after-acceptance');
          assert.equal(fixture.ledger.length, 1);
          fixture.snapshot('a-accepted-before-b-claim');
          fixture.releaseRaceB();
          await idle(b);
          fixture.snapshot('b-delivered-before-a-outcome');
          a.release('after-acceptance');
          await idle(a);
          assert.equal(fixture.ledger.length, 2, 'both stale claimants actually reached SMTP acceptance');
          assert.equal(new Set(fixture.ledger.map(entry => entry.fingerprint)).size, 1);
          assert.equal(fixture.readState().delivery.claimedAt, '2026-01-01T00:00:00.000Z', 'A overwrote newer B outcome');
        } else if (scenario === 'accepted-state-write-failure') {
          const a = fixture.worker('A');
          evidence.pids.push(a.child.pid);
          await idle(a);
          assert.equal(fixture.ledger.length, 1);
          const failed = fixture.snapshot('accepted-but-failed-durably');
          assert.equal(failed.delivery.state, 'failed');
          assert.equal(failed.delivery.attempts, 1);
          await a.kill();
          const b = fixture.worker('B', { time: 2 * 60000 });
          evidence.pids.push(b.child.pid);
          await idle(b);
          assert.equal(fixture.ledger.length, 2, 'success-write failure led to a second actual acceptance');
          assert.equal(fixture.readState().delivery.attempts, 2);
        } else if (scenario === 'crash-after-acceptance') {
          const a = fixture.worker('A', { barrier: 'after-acceptance' });
          evidence.pids.push(a.child.pid);
          await barrier(a, 'after-acceptance');
          assert.equal(fixture.ledger.length, 1);
          const interrupted = fixture.snapshot('after-acceptance-before-kill');
          assert.equal(interrupted.delivery.state, 'claimed');
          assert.equal(interrupted.delivery.attempts, 0);
          assert.equal((await a.kill()).signal, 'SIGKILL');
          fixture.snapshot('after-kill-before-restart');
          const b = fixture.worker('B', { time: 16 * 60000 });
          evidence.pids.push(b.child.pid);
          assert.notEqual(a.child.pid, b.child.pid);
          await idle(b);
          assert.equal(fixture.ledger.length, 2, 'fresh worker resent the already accepted notification');
          assert.equal(new Set(fixture.ledger.map(entry => entry.fingerprint)).size, 1);
          assert.equal(fixture.readState().delivery.attempts, 1, 'crashed first send was not counted');
        } else if (scenario === 'crash-before-smtp') {
          const a = fixture.worker('A', { barrier: 'before-smtp' });
          evidence.pids.push(a.child.pid);
          await barrier(a, 'before-smtp');
          assert.equal(fixture.ledger.length, 0);
          fixture.snapshot('claimed-before-kill');
          assert.equal((await a.kill()).signal, 'SIGKILL');
          const b = fixture.worker('B', { time: 16 * 60000 });
          evidence.pids.push(b.child.pid);
          await idle(b);
          assert.equal(fixture.ledger.length, 1);
        } else {
          const a = fixture.worker('A');
          evidence.pids.push(a.child.pid);
          await idle(a);
          fixture.snapshot('delivered-before-kill');
          assert.equal(fixture.ledger.length, 1);
          assert.equal((await a.kill()).signal, 'SIGKILL');
          const b = fixture.worker('B', { time: 16 * 60000 });
          evidence.pids.push(b.child.pid);
          await idle(b);
          assert.equal(fixture.ledger.length, 1);
        }
        fixture.assertIsolation();
        const final = fixture.snapshot('final-state');
        assert.equal(final.delivery.state, 'delivered');
        const onDiskLedger = readFileSync(join(fixture.directory, 'smtp-acceptance.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
        assert.deepEqual(onDiskLedger, fixture.ledger);
        evidence.status = 'pass';
        evidence.smtpAcceptanceCount = onDiskLedger.length;
        evidence.durableAttempts = final.delivery.attempts;
        evidence.observedSemantics = onDiskLedger.length > 1 ? 'duplicate SMTP acceptance reproduced for one durable outbox record' : 'control: one SMTP acceptance';
        console.log(`PASS ${scenario} #${iteration}: accepted=${onDiskLedger.length}, durableAttempts=${final.delivery.attempts}`);
      } catch (error) {
        evidence.status = 'fail'; evidence.error = error.stack;
        fixture.snapshot('failure-state');
        throw error;
      } finally {
        await fixture.close();
        metadata.results.push(evidence);
        durableJson(join(output, 'results.json'), metadata);
      }
    }
  }
  metadata.completedAt = new Date().toISOString();
  metadata.status = 'pass';
} catch (error) {
  metadata.status = 'fail'; metadata.error = error.stack;
  process.exitCode = 1;
} finally {
  durableJson(join(output, 'results.json'), metadata);
  console.log(`P0_RESULTS=${join(output, 'results.json')}`);
}
