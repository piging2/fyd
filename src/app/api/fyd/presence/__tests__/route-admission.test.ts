/**
 * D9-F1 regression suite: admission control on POST /api/fyd/presence.
 *
 * The defect class (D9 quota census, point 6): the presence compiler was
 * the repo's only completely ungated heavy path. POST validates a URL,
 * derives a deterministic tenantId, and launches a background compile
 * (crawl + durable tenant writes) with no AnonymousGate check, no rate
 * limit, and no concurrency cap, so one unauthenticated script POSTing
 * distinct URLs could mint unbounded tenants and launch unbounded
 * concurrent compiles. The route must consult the shared AnonymousGate
 * before the compiler launches, record quota exactly once per admitted
 * submit, refuse with HTTP 429 (carrying retryAfterMs) both when the
 * gate refuses and when the in-flight compile cap is full, and create
 * NO tenant state on refusal. Removing the wiring must fail this suite
 * (see the route-pin test at the bottom), not just a code review.
 *
 * The compiler's network is fully mocked through the same preview-deps
 * seam the compiler suite uses; the filesystem seam asserted on is the
 * projection dir the route itself resolves (FYD_PROJECTION_DIR): a
 * launched compile's first durable acts are the _compiler directory and
 * the per-tenant checkpoint inside it.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import {
  setPreviewDepsForTests,
  type PreviewDeps,
} from "@/fyd/onboarding/anonymous-preview";
import {
  AnonymousGate,
  GenerationQuota,
  TokenBucket,
  anonymousGate,
} from "@/fyd/net/rate-limit";
import {
  CrawlLedger,
  DedupCache,
  OriginSemaphore,
  type CrawlBudget,
} from "@/fyd/net/budgets";
import type { SafeFetchDeps } from "@/fyd/net/safe-fetch";
import { tenantIdForUrl } from "@/fyd/onboarding/compile-tenant";
import { POST } from "../route";
import { inFlightCompileCountForTests } from "../in-flight-compiles";

const HTML =
  "<html><head><title>Alpha Biz</title>" +
  '<meta name="description" content="Family-owned since 2004."></head>' +
  "<body><h1>Alpha Biz</h1>" +
  "<p>Call (303) 555-0119 or write hello@alpha.example</p>" +
  "</body></html>";

const HOSTS = ["alpha.example", "beta.example", "gamma.example"];

interface Latch {
  promise: Promise<void>;
  release: () => void;
}

function latch(): Latch {
  let release!: () => void;
  const promise = new Promise<void>((res) => {
    release = res;
  });
  return { promise, release };
}

function netFor(
  publicHosts: string[],
  calls: { n: number },
  gateLatch: Latch | null,
): SafeFetchDeps {
  return {
    dnsLookup: async (host: string) =>
      publicHosts.includes(host)
        ? [{ address: "93.184.216.34" }]
        : [{ address: "10.0.0.5" }],
    fetchImpl: (async () => {
      calls.n += 1;
      if (gateLatch) await gateLatch.promise;
      return new Response(HTML, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }) as typeof fetch,
  };
}

function previewDeps(net: SafeFetchDeps, clock: () => number): PreviewDeps {
  const budget: CrawlBudget = { maxPages: 6, maxTotalBytes: 8 * 1024 * 1024 };
  return {
    net,
    // A fresh, permissive gate for the preview layer: the boundary under
    // test is the ROUTE's use of the shared singleton, and the preview's
    // own internal gate must not consume or refuse on it.
    gate: new AnonymousGate(
      clock,
      new TokenBucket(1000, 1000, clock),
      new GenerationQuota(1000, 3_600_000, clock),
    ),
    crawlBudget: budget,
    ledger: new CrawlLedger(budget),
    semaphore: new OriginSemaphore(2, 6),
    cache: new DedupCache({ ttlMs: 600_000, maxEntries: 500 }),
    clock,
  };
}

const FIXED_NOW = 1_786_000_000_000;

function harness(opts?: { latch?: Latch | null }): {
  dir: string;
  calls: { n: number };
} {
  const dir = mkdtempSync(join(tmpdir(), "fyd-presence-proj-"));
  const claims = mkdtempSync(join(tmpdir(), "fyd-presence-claims-"));
  process.env.FYD_PROJECTION_DIR = dir;
  process.env.FYD_CLAIM_DIR = claims;
  const calls = { n: 0 };
  setPreviewDepsForTests(
    previewDeps(netFor(HOSTS, calls, opts?.latch ?? null), () => FIXED_NOW),
  );
  return { dir, calls };
}

function makeRequest(ip: string, url: string): NextRequest {
  return new NextRequest("http://localhost/api/fyd/presence", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ url }),
  });
}

function expectedClientKey(ip: string): string {
  return createHash("sha256").update("fyd-preview-v1:" + ip).digest("hex");
}

async function until(cond: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("until() timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

let checkSpy: jest.SpyInstance;
let recordSpy: jest.SpyInstance;

const savedProj = process.env.FYD_PROJECTION_DIR;
const savedClaims = process.env.FYD_CLAIM_DIR;

beforeEach(() => {
  checkSpy = jest.spyOn(anonymousGate, "check").mockReturnValue({ ok: true });
  recordSpy = jest
    .spyOn(anonymousGate, "record")
    .mockImplementation(() => undefined);
});

afterEach(async () => {
  jest.restoreAllMocks();
  setPreviewDepsForTests(null);
  // Drain any background compile a test launched so slots never leak
  // into a sibling test (a stuck counter here is itself a failure).
  await until(() => inFlightCompileCountForTests() === 0);
  if (savedProj === undefined) delete process.env.FYD_PROJECTION_DIR;
  else process.env.FYD_PROJECTION_DIR = savedProj;
  if (savedClaims === undefined) delete process.env.FYD_CLAIM_DIR;
  else process.env.FYD_CLAIM_DIR = savedClaims;
});

describe("POST /api/fyd/presence admission (D9-F1)", () => {
  it("refuses a gate-exhausted client with 429 + retryAfterMs and launches no compile, creates no tenant state", async () => {
    const { dir, calls } = harness();
    checkSpy.mockReturnValue({
      ok: false,
      reason: "Anonymous generation quota exhausted for this client.",
      retryAfterMs: 4321,
    });
    const res = await POST(makeRequest("203.0.113.20", "https://alpha.example/"));
    expect(res.status).toBe(429);
    const body = (await res.json()) as {
      ok: boolean;
      code?: string;
      message?: string;
      error?: string;
      retryAfterMs?: number;
    };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("rate-limited");
    expect(body.message).toContain("quota exhausted");
    expect(body.error).toContain("quota exhausted");
    expect(body.retryAfterMs).toBe(4321);
    // No compile launched: the mocked network was never touched and the
    // route's own filesystem seam (the projection dir) shows no tenant
    // compiler state at all.
    expect(calls.n).toBe(0);
    expect(existsSync(join(dir, "_compiler"))).toBe(false);
    expect(recordSpy).not.toHaveBeenCalled();
    expect(inFlightCompileCountForTests()).toBe(0);
  });

  it("admits a submit: 202 contract unchanged, gate recorded exactly once, compile completes and writes the projection", async () => {
    const { dir, calls } = harness();
    const ip = "203.0.113.21";
    const res = await POST(makeRequest(ip, "https://alpha.example/"));
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      ok: boolean;
      tenantId?: string;
      state?: string;
    };
    expect(body.ok).toBe(true);
    expect(body.tenantId).toMatch(/^url-[0-9a-f]{16}$/);
    expect(typeof body.state).toBe("string");
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(expectedClientKey(ip));
    // The background compile settles and frees its slot.
    await until(() => inFlightCompileCountForTests() === 0);
    expect(calls.n).toBeGreaterThanOrEqual(1);
    const checkpoint = join(dir, "_compiler", body.tenantId! + ".json");
    expect(existsSync(checkpoint)).toBe(true);
    const projections = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(projections.length).toBeGreaterThanOrEqual(1);
  }, 15000);

  it("refuses the (cap+1)th concurrent submit with the 429 cap shape and admits again after a compile completes", async () => {
    const gateLatch = latch();
    const { dir, calls } = harness({ latch: gateLatch });
    const ip = "203.0.113.22";
    const res1 = await POST(makeRequest(ip, "https://alpha.example/"));
    const res2 = await POST(makeRequest(ip, "https://beta.example/"));
    expect(res1.status).toBe(202);
    expect(res2.status).toBe(202);
    // Both compiles are in flight, blocked inside their first fetch.
    await until(() => calls.n === 2);
    expect(inFlightCompileCountForTests()).toBe(2);
    expect(recordSpy).toHaveBeenCalledTimes(2);

    const gammaId = tenantIdForUrl("https://gamma.example/");
    const res3 = await POST(makeRequest(ip, "https://gamma.example/"));
    expect(res3.status).toBe(429);
    const body3 = (await res3.json()) as {
      ok: boolean;
      code?: string;
      message?: string;
      error?: string;
      retryAfterMs?: number;
    };
    expect(body3.ok).toBe(false);
    expect(body3.code).toBe("too-many-compiles");
    expect(typeof body3.error).toBe("string");
    expect(body3.retryAfterMs).toBe(60_000);
    // The refused submit recorded no quota and created no tenant state.
    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(existsSync(join(dir, "_compiler", gammaId! + ".json"))).toBe(false);
    expect(calls.n).toBe(2);

    // Let the two compiles finish; their slots free and admission reopens.
    gateLatch.release();
    await until(() => inFlightCompileCountForTests() === 0);
    const res4 = await POST(makeRequest(ip, "https://gamma.example/"));
    expect(res4.status).toBe(202);
    expect(recordSpy).toHaveBeenCalledTimes(3);
    await until(() => inFlightCompileCountForTests() === 0);
    expect(existsSync(join(dir, "_compiler", gammaId! + ".json"))).toBe(true);
  }, 20000);

  it("returns the in-flight counter to zero after the compile fail-closes", async () => {
    const { dir } = harness();
    // A host outside the public set resolves to a private address, the
    // SSRF gate refuses the fetch, and the compiler records a FAILED
    // checkpoint (buildTenant resolves; the slot must still free).
    const res = await POST(makeRequest("203.0.113.23", "https://private.example/"));
    expect(res.status).toBe(202);
    const body = (await res.json()) as { tenantId?: string };
    await until(() => inFlightCompileCountForTests() === 0);
    const checkpoint = join(dir, "_compiler", body.tenantId! + ".json");
    expect(existsSync(checkpoint)).toBe(true);
    const parsed = JSON.parse(readFileSync(checkpoint, "utf8")) as {
      failure: unknown;
    };
    expect(parsed.failure).not.toBeNull();
  }, 15000);

  it("route pin: the presence route consults the gate and takes a slot before the compiler launches", () => {
    const source = readFileSync(join(__dirname, "..", "route.ts"), "utf8");
    expect(source).toContain('from "@/fyd/net/rate-limit"');
    const checkAt = source.indexOf("anonymousGate.check(");
    const recordAt = source.indexOf("anonymousGate.record(");
    const acquireAt = source.indexOf("acquireInFlightCompile(");
    const launchAt = source.indexOf("void buildTenant(");
    expect(checkAt).toBeGreaterThan(-1);
    expect(recordAt).toBeGreaterThan(-1);
    expect(acquireAt).toBeGreaterThan(-1);
    expect(launchAt).toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(launchAt);
    expect(recordAt).toBeLessThan(launchAt);
    expect(acquireAt).toBeLessThan(launchAt);
  });
});
