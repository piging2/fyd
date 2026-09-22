/**
 * Shared test helpers for the tenant-boundary adversarial suite.
 * REPO LANDING PATH: src/fyd/tenant/__tests__/helpers.ts
 */
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalize } from "@/lib/ping/ask-composer";

/** Fresh temp directory per test file. */
export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export interface SeedProjectionOpts {
  /** Override meta.siteId so it disagrees with the file name (integrity test). */
  metaSiteId?: string;
  /** Write a bogus graphDigest so digest verification fails. */
  tamperDigest?: boolean;
}

/**
 * Seed a PING projection file the read seam will accept:
 * <dir>/<siteId>.json with a valid meta block and a correct graphDigest,
 * computed with the repo's own canonicalize (same rule the dumper uses).
 */
export function seedProjection(
  dir: string,
  siteId: string,
  opts?: SeedProjectionOpts,
): string {
  const graph = {
    objects: [
      {
        id: "biz-1",
        schema: "LocalBusiness",
        visibility: "public",
        title: "Test Business " + siteId,
        provenance: { ref: "test:seed" },
        fields: { phone: "555-0100", locality: "Testville" },
      },
    ],
    relationships: [],
  };
  const digest = createHash("sha256")
    .update(canonicalize(graph as never), "utf8")
    .digest("hex");
  const meta = {
    siteId: opts?.metaSiteId ?? siteId,
    dumpedAt: "2026-09-21T00:00:00.000Z",
    dumperVersion: "tenant-boundary-test",
    baseDigest: "test",
    fixtureFileDigest: "test",
    graphDigest: opts?.tamperDigest ? "0".repeat(64) : digest,
    generatedAt: "2026-09-21T00:00:00.000Z",
    overlayEventIds: [],
  };
  const path = join(dir, siteId + ".json");
  writeFileSync(path, JSON.stringify({ graph, meta }));
  return path;
}

/**
 * Install FYD_* dir overrides for a test file. Call in beforeEach, and
 * restore in afterEach via the returned function.
 */
export function installDirOverrides(
  overrides: Record<string, string>,
): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(overrides)) {
    saved[k] = process.env[k];
    process.env[k] = overrides[k];
  }
  return () => {
    for (const k of Object.keys(overrides)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
}
