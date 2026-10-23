/**
 * GET /api/readyz route behavior (FYD-READYZ-FIX-20261023):
 * - Snapshot mode (Vercel serverless): 200 ready, mode reported, and the
 *   build block attests the platform-provided commit.
 * - Journal mode (self-hosted): 503 with the gateway reason preserved,
 *   commit null when no seam observes one.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET } from "../route";

const ENV_KEYS = [
  "VERCEL",
  "VERCEL_GIT_COMMIT_SHA",
  "FYD_BUILD_SHA",
  "FYD_OVERLAY_SNAPSHOT",
  "FYD_READYZ_MODE",
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
  dir = mkdtempSync(join(tmpdir(), "readyz-route-"));
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

describe("GET /api/readyz", () => {
  it("snapshot mode: 200, ready, attests the platform commit", async () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_GIT_COMMIT_SHA = "850419672aa1d9f4a41ca91b291a5fff3e0e46f6";
    const p = join(dir, "snap.json");
    writeFileSync(p, JSON.stringify({ events: [{ id: 1 }, { id: 2 }] }), "utf8");
    process.env.FYD_OVERLAY_SNAPSHOT = p;

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(true);
    expect(body.mode).toBe("snapshot");
    expect(body.build.commitSha).toBe("850419672aa1d9f4a41ca91b291a5fff3e0e46f6");
    expect(body.checks.snapshot).toMatchObject({ available: true, eventCount: 2 });
  });

  it("journal mode: 503 with the gateway reason when no gateway answers", async () => {
    global.fetch = jest.fn(async () => {
      throw Object.assign(new Error("fetch failed"), {
        cause: { code: "ECONNREFUSED" },
      });
    }) as unknown as typeof fetch;

    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.ready).toBe(false);
    expect(body.mode).toBe("journal");
    expect(body.reason).toContain("demo gateway unreachable");
    expect(body.build.commitSha).toBeNull();
  });
});
