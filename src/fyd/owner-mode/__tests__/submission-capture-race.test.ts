/** P0 characterization: these assertions expose CURRENT incorrect receipts. */
import { NextRequest } from 'next/server';
import { mkdtempSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let mockDirectory: string;
let mockStatePath: string;
let mockHeadCalls = 0;
let mockCreates = 0;
const mockRounds = new Map<number, { arrivals: number; promise: Promise<void>; release: () => void }>();
const mockSavedRecords: unknown[] = [];

jest.mock('@vercel/blob', () => {
  class BlobNotFoundError extends Error {}
  return {
    BlobNotFoundError,
    async head() {
      const existedAtRead = existsSync(mockStatePath);
      const ordinal = ++mockHeadCalls;
      if (ordinal <= 4) {
        const group = Math.floor((ordinal - 1) / 2);
        let round = mockRounds.get(group);
        if (!round) {
          let release!: () => void;
          const promise = new Promise<void>(resolve => { release = resolve; });
          round = { arrivals: 0, promise, release };
          mockRounds.set(group, round);
        }
        round.arrivals++;
        if (round.arrivals === 2) round.release();
        await round.promise;
      }
      if (!existedAtRead) throw new BlobNotFoundError();
      return {};
    },
    async get() {
      if (!existsSync(mockStatePath)) return null;
      return { stream: new Response(readFileSync(mockStatePath, 'utf8')).body };
    },
    async put(_pathname: string, body: string, options: { allowOverwrite: boolean }) {
      if (existsSync(mockStatePath) && !options.allowOverwrite) throw new Error('P0 concurrent create lost');
      mockCreates++;
      writeFileSync(mockStatePath + '.tmp', body, { mode: 0o600 });
      const fd = openSync(mockStatePath + '.tmp', 'r');
      try { fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(mockStatePath + '.tmp', mockStatePath);
      return {};
    },
  };
});
jest.mock('@/fyd/owner-mode/nomination-store', () => ({
  ...jest.requireActual('@/fyd/owner-mode/nomination-store'),
  findNominationByDedupeKey: () => null,
  saveNominationRecord: (record: unknown) => mockSavedRecords.push(record),
}));
jest.mock('@/fyd/owner-mode/featured-application-store', () => ({
  ...jest.requireActual('@/fyd/owner-mode/featured-application-store'),
  findFeaturedApplicationByDedupeKey: () => null,
  saveFeaturedApplicationRecord: (record: unknown) => mockSavedRecords.push(record),
}));

import { POST as nominate } from '@/app/api/fyd/nomination/route';
import { POST as apply } from '@/app/api/fyd/featured-application/route';

const keys = ['BLOB_READ_WRITE_TOKEN', 'VERCEL_ENV', 'FYD_SMTP_FROM', 'FYD_SMTP_USER', 'FYD_SMTP_PASS'] as const;
let savedEnvironment: Record<string, string | undefined>;
beforeEach(() => {
  const base = process.env.FYD_RELAY_P0_ARTIFACT_DIR ?? tmpdir();
  mkdirSync(base, { recursive: true });
  mockDirectory = mkdtempSync(join(base, 'capture-p0-'));
  mockStatePath = join(mockDirectory, 'stored-winner.json');
  mockHeadCalls = 0; mockCreates = 0; mockRounds.clear(); mockSavedRecords.length = 0;
  savedEnvironment = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.BLOB_READ_WRITE_TOKEN = 'P0_SYNTHETIC_TOKEN_NOT_REAL';
  process.env.VERCEL_ENV = 'production';
  process.env.FYD_SMTP_FROM = 'sender@example.invalid';
  delete process.env.FYD_SMTP_USER;
  delete process.env.FYD_SMTP_PASS;
});
afterEach(() => {
  for (const key of keys) {
    const value = savedEnvironment[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test.each([
  { kind: 'nomination', handler: nominate, payload: {
    businessName: 'P0 synthetic business', category: 'skilled', city: 'Synthetic city',
    exceptional: 'Synthetic characterization submission only.', nominatorName: 'Synthetic nominator',
    nominatorContact: 'synthetic@example.invalid', permissionFollowUp: true,
  } },
  { kind: 'featured-application', handler: apply, payload: {
    businessName: 'P0 synthetic business', collar: 'blue', trade: 'Synthetic trade',
    contactName: 'Synthetic applicant', serviceArea: 'Synthetic city',
    exceptional: 'Synthetic characterization submission only.', contactChannel: 'email',
    contactDetail: 'synthetic@example.invalid', permissionFollowUp: true,
  } },
])('P0 $kind race returns a receipt absent from its durable winning record', async ({ kind, handler, payload }) => {
  const request = () => new NextRequest(`http://127.0.0.1/api/fyd/${kind}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  // Real route, identity helpers, acceptSubmission and persistToOutbox run.
  // Only SDK storage and legacy file-store calls are fixture substitutions.
  const responses = await Promise.all([handler(request()), handler(request())]);
  const bodies = await Promise.all(responses.map(response => response.json()));
  const stored = JSON.parse(readFileSync(mockStatePath, 'utf8'));
  const evidence = {
    schema: 'fyd-capture-p0@1', kind, runtime: process.version,
    statusCodes: responses.map(response => response.status), responses: bodies,
    storedReceipt: stored.receipt, successfulBlobCreates: mockCreates,
    legacySecondaryStoreWrites: mockSavedRecords, sdkHeadCalls: mockHeadCalls,
    deviation: 'Real Blob replaced with deterministic durable filesystem-backed SDK fixture; local secondary store replaced with a call recorder.',
  };
  writeFileSync(join(mockDirectory, 'capture-result.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  expect(responses.map(response => response.status)).toEqual([200, 200]);
  expect(mockCreates).toBe(1);
  expect(new Set(bodies.map(body => body.receipt.receiptId)).size).toBe(2);
  expect(bodies.filter(body => body.receipt.receiptId === stored.receipt.receiptId)).toHaveLength(1);
  expect(bodies.map(body => body.replayed)).toEqual([false, false]);
  // These are baseline defect assertions, not assertions that P1 is fixed.
}, 15000);
