import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { durableJson } from './fixtures.mjs';

const args = ['--silent', 'test', '--', '--listTests', '--json', '--runInBand', '--no-cache'];
const result = spawnSync('npm', args, { encoding: 'utf8', timeout: 30000 });
assert.equal(result.status, 0, result.stderr);
const paths = JSON.parse(result.stdout);
assert.ok(Array.isArray(paths));
assert.equal(new Set(paths).size, paths.length, 'canonical discovery must not duplicate suites');
const expected = ['submission-mailer.test.ts', 'submission-outbox.test.ts', 'submission-capture-race.test.ts', 'relay-process.test.ts'];
const counts = Object.fromEntries(expected.map(name => [name, paths.filter(path => path.endsWith(`/owner-mode/__tests__/${name}`)).length]));
for (const [name, count] of Object.entries(counts)) assert.equal(count, 1, `${name} must be discovered once`);
const base = process.env.FYD_RELAY_P0_ARTIFACT_DIR ?? tmpdir();
mkdirSync(base, { recursive: true });
const output = mkdtempSync(join(base, 'discovery-p0-'));
durableJson(join(output, 'canonical-discovery.json'), {
  schema: 'fyd-relay-p0-discovery@1', command: `npm ${args.join(' ')}`, node: process.version,
  status: result.status, totalSuites: paths.length, counts, stdout: result.stdout, stderr: result.stderr, paths,
});
console.log(JSON.stringify({ totalSuites: paths.length, counts, evidence: join(output, 'canonical-discovery.json') }, null, 2));
