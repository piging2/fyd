/**
 * /readyz readiness: mode selection, commit attestation seam, and the
 * deployment-aware probe (FYD-READYZ-FIX-20261023).
 *
 * Journal mode must behave exactly like the historical probe (gateway
 * reachable + identity marker). Snapshot mode (Vercel serverless) must
 * NOT fail on the absent localhost gateway; it requires the bundled
 * overlay snapshot and the tenant manifest instead.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCommitSha, deploymentReadiness, readinessMode } from "../server";

const ENV_KEYS = [
  "VERCEL",
  "FYD_READYZ_MODE",
  "FYD_OVERLAY_SNAPSHOT",
  "FYD_BUILD_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "FYD_CUSTOMIZE_GATEWAY_URL",
];

let saved: Record<string, string | undefined> = {};
let dir = "";
const realFetch = global.fetch;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = mkdtempSync(join(tmpdir(), "readyz-"));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

function snapshotFixture(events: unknown[]): string {
  const p = join(dir, "snap.json");
  writeFileSync(p, JSON.stringify({ events }), "utf8");
  return p;
}

describe("readinessMode", () => {
  it("defaults to journal (self-hosted demo deployment)", () => {
    expect(readinessMode({})).toBe("journal");
  });

  it("selects snapshot on the Vercel runtime", () => {
    expect(readinessMode({ VERCEL: "1" })).toBe("snapshot");
  });

  it("honors the FYD_READYZ_MODE override in both directions", () => {
    expect(readinessMode({ VERCEL: "1", FYD_READYZ_MODE: "journal" })).toBe("journal");
    expect(readinessMode({ FYD_READYZ_MODE: "snapshot" })).toBe("snapshot");
  });

  it("ignores an unrecognized override", () => {
    expect(readinessMode({ FYD_READYZ_MODE: "bogus" })).toBe("journal");
  });
});

describe("buildCommitSha", () => {
  it("prefers the serve-script FYD_BUILD_SHA", () => {
    expect(
      buildCommitSha({ FYD_BUILD_SHA: "aaa", VERCEL_GIT_COMMIT_SHA: "bbb" }),
    ).toBe("aaa");
  });

  it("falls back to the platform VERCEL_GIT_COMMIT_SHA", () => {
    expect(buildCommitSha({ VERCEL_GIT_COMMIT_SHA: "bbb" })).toBe("bbb");
  });

  it("returns null when neither seam observes a commit", () => {
    expect(buildCommitSha({})).toBeNull();
    expect(buildCommitSha({ FYD_BUILD_SHA: "  ", VERCEL_GIT_COMMIT_SHA: "" })).toBeNull();
  });
});

describe("deploymentReadiness in journal mode", () => {
  it("is ready when the gateway answers with the journal marker", async () => {
    global.fetch = jest.fn(async () => ({
      json: async () => ({ journal: "fyd-demo-journal@derived1" }),
    })) as unknown as typeof fetch;
    const r = await deploymentReadiness();
    expect(r.mode).toBe("journal");
    expect(r.ready).toBe(true);
    expect(r.checks.journal).toBe("ready");
    expect(r.checks.snapshot).toBe("not_applicable");
  });

  it("is not ready when the gateway is unreachable, reason preserved", async () => {
    global.fetch = jest.fn(async () => {
      throw Object.assign(new Error("fetch failed"), {
        cause: { code: "ECONNREFUSED" },
      });
    }) as unknown as typeof fetch;
    const r = await deploymentReadiness();
    expect(r.mode).toBe("journal");
    expect(r.ready).toBe(false);
    expect(r.reason).toContain("demo gateway unreachable");
    expect(r.checks.journal).toBe("not_ready");
  });
});

describe("deploymentReadiness in snapshot mode", () => {
  beforeEach(() => {
    process.env.VERCEL = "1";
  });

  it("is ready when the bundled snapshot parses and the tenant manifest loads", async () => {
    process.env.FYD_OVERLAY_SNAPSHOT = snapshotFixture([{ a: 1 }, { b: 2 }, { c: 3 }]);
    const r = await deploymentReadiness();
    expect(r.mode).toBe("snapshot");
    expect(r.ready).toBe(true);
    expect(r.checks.journal).toBe("not_applicable");
    expect(r.checks.snapshot).toMatchObject({ available: true, eventCount: 3 });
    expect(r.checks.tenant).toMatchObject({ loaded: true });
  });

  it("is not ready, with the path named, when the snapshot is missing", async () => {
    process.env.FYD_OVERLAY_SNAPSHOT = join(dir, "does-not-exist.json");
    const r = await deploymentReadiness();
    expect(r.mode).toBe("snapshot");
    expect(r.ready).toBe(false);
    expect(r.reason).toContain("does-not-exist.json");
    expect(r.checks.snapshot).toMatchObject({ available: false });
  });

  it("is not ready when the snapshot is malformed", async () => {
    const p = join(dir, "bad.json");
    writeFileSync(p, "{ not json", "utf8");
    process.env.FYD_OVERLAY_SNAPSHOT = p;
    const r = await deploymentReadiness();
    expect(r.ready).toBe(false);
    expect(r.checks.snapshot).toMatchObject({ available: false });
  });
});
