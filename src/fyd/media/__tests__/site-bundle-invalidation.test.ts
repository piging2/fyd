/**
 * Site-bundle cache invalidation (2026-10-08, P0).
 *
 * Contract: an authoritative write that commits must invalidate the
 * affected site's cached bundle immediately, so the next read rebuilds
 * from the new truth. TTL is a safety fallback, not consistency.
 *
 * Verifies:
 *  1. READ V1 -> CACHE V1 (second read returns the cached instance).
 *  2. OWNER WRITE V2 -> COMMIT -> INVALIDATE (applyOwnerCommand commits
 *     and drops the cache entry).
 *  3. NEXT READ -> V2 IMMEDIATELY (rebuilt bundle, correction visible,
 *     not the stale V1).
 *  4. SURGICAL: a write to site A does not flush site B's cached bundle.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSiteBundle, invalidateSiteBundle } from "../site-bundle";
import { applyOwnerCommand } from "@/fyd/object/owner-store";
import { startStubJournal, type StubJournal } from "@/app/api/fyd/ask/__tests__/stub-journal";

const SITE_A = "happy-place";
const SITE_B = "coppersmith-plumbing";

let journal: StubJournal;
const originalOwnerDir = process.env.FYD_OWNER_DIR;

beforeEach(async () => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-inv-test-"));
  journal = await startStubJournal([]);
  // Start each test with a clean slate: no cross-test cache leakage.
  invalidateSiteBundle(SITE_A);
  invalidateSiteBundle(SITE_B);
});

afterEach(async () => {
  await journal.close();
  invalidateSiteBundle(SITE_A);
  invalidateSiteBundle(SITE_B);
  if (originalOwnerDir === undefined) delete process.env.FYD_OWNER_DIR;
  else process.env.FYD_OWNER_DIR = originalOwnerDir;
});

test("second read returns the cached instance (V1)", async () => {
  const v1a = await getSiteBundle(SITE_A);
  expect(v1a).not.toBeNull();
  const v1b = await getSiteBundle(SITE_A);
  expect(v1b).toBe(v1a); // same reference: cache hit
});

test("owner write invalidates: next read rebuilds with the correction (V2)", async () => {
  const v1 = await getSiteBundle(SITE_A);
  expect(v1).not.toBeNull();

  // Authoritative write commits. applyOwnerCommand throws on failure, so
  // reaching the next line means the owner log committed -> the cache
  // entry for SITE_A must be dropped by the write path itself.
  applyOwnerCommand(
    SITE_A,
    { type: "set-contact-field", field: "phone", value: "+1 555 000 1234" },
    [],
    new Map(),
  );

  const v2 = await getSiteBundle(SITE_A);
  expect(v2).not.toBeNull();
  expect(v2).not.toBe(v1); // rebuilt, not the stale cached V1

  // The correction is visible in the rebuilt bundle immediately.
  const corrected = v2!.graph.objects.find(
    (o) => o.schema === "ping.social.business@1" && o.visibility === "public",
  );
  // Owner overlay applies over the source graph; the bundle's readOwner
  // reflects the committed correction.
  const overrides = v2!.readOwner!(SITE_A);
  expect(overrides.fieldCorrections["phone"]?.ownerValue).toBe("+1 555 000 1234");
  expect(corrected).toBeDefined();
});

test("invalidation is surgical: site B cache survives a site A write", async () => {
  const b1 = await getSiteBundle(SITE_B);
  expect(b1).not.toBeNull();
  const a1 = await getSiteBundle(SITE_A);
  expect(a1).not.toBeNull();

  applyOwnerCommand(
    SITE_A,
    { type: "set-contact-field", field: "phone", value: "+1 555 000 9999" },
    [],
    new Map(),
  );

  const a2 = await getSiteBundle(SITE_A);
  expect(a2).not.toBe(a1); // site A rebuilt

  const b2 = await getSiteBundle(SITE_B);
  expect(b2).toBe(b1); // site B untouched: same cached instance
});

test("invalidateSiteBundle on an unknown/empty key is a safe no-op", async () => {
  expect(() => invalidateSiteBundle("no-such-site")).not.toThrow();
  expect(() => invalidateSiteBundle("")).not.toThrow();
});
