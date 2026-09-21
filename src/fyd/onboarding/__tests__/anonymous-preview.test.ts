/**
 * Regression tests for the anonymous preview service: the full order-G
 * boundary with injected DNS/fetch. Proves the preview consumes the gate,
 * the SSRF gate, the crawl budget, and the dedupe cache, and leaves an
 * OBSERVED claim record with no ownership.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateAnonymousPreview,
  setPreviewDepsForTests,
  type PreviewDeps,
} from "../anonymous-preview";
import {
  AnonymousGate,
  GenerationQuota,
  TokenBucket,
} from "../../net/rate-limit";
import {
  CrawlLedger,
  DedupCache,
  OriginSemaphore,
  type CrawlBudget,
} from "../../net/budgets";
import type { SafeFetchDeps } from "../../net/safe-fetch";
import { readClaim } from "../../claim/store";

const HTML =
  "<html><head><title>Acme Plumbing</title>" +
  '<meta name="description" content="Family-owned since 1998."></head>' +
  "<body><h1>Acme Plumbing</h1><p>Call (970) 555-0142</p></body></html>";

function netFor(publicHosts: string[], calls: { n: number }): SafeFetchDeps {
  return {
    dnsLookup: async (host: string) =>
      publicHosts.includes(host) ? [{ address: "93.184.216.34" }] : [{ address: "10.0.0.5" }],
    fetchImpl: (async () => {
      calls.n += 1;
      return new Response(HTML, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }) as typeof fetch,
  };
}

function generousGate(clock: () => number): AnonymousGate {
  return new AnonymousGate(
    clock,
    new TokenBucket(1000, 1000, clock),
    new GenerationQuota(1000, 3_600_000, clock),
  );
}

const BUDGET: CrawlBudget = { maxPages: 6, maxTotalBytes: 8 * 1024 * 1024 };

function deps(net: SafeFetchDeps, clock: () => number, gate?: AnonymousGate): PreviewDeps {
  return {
    net,
    gate: gate ?? generousGate(clock),
    crawlBudget: BUDGET,
    ledger: new CrawlLedger(BUDGET),
    semaphore: new OriginSemaphore(2, 6),
    cache: new DedupCache({ ttlMs: 600_000, maxEntries: 500 }),
    clock,
  };
}

describe("generateAnonymousPreview", () => {
  const VAR = "FYD_CLAIM_DIR";
  const saved = process.env[VAR];
  let now = 1_000_000;
  beforeEach(() => {
    now = 1_000_000;
    process.env[VAR] = mkdtempSync(join(tmpdir(), "fyd-claims-"));
  });
  afterEach(() => {
    setPreviewDepsForTests(null);
    if (saved === undefined) delete process.env[VAR];
    else process.env[VAR] = saved;
  });

  test("a public URL yields a value preview and an OBSERVED record", async () => {
    const calls = { n: 0 };
    setPreviewDepsForTests(deps(netFor(["acmeplumb.example"], calls), () => now));
    const out = await generateAnonymousPreview({
      url: "https://acmeplumb.example/",
      clientId: "client-a",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.preview.evidence.title).toBe("Acme Plumbing");
    expect(out.preview.evidence.description).toBe("Family-owned since 1998.");
    expect(out.preview.evidence.phone).toBe("(970) 555-0142");
    expect(out.preview.claimState).toBe("observed");
    expect(out.preview.crawl.cacheHit).toBe(false);
    expect(out.preview.resourceId).toMatch(/^url-[0-9a-f]{16}$/);
    const stored = readClaim(out.preview.resourceId);
    expect(stored?.state).toBe("observed");
    expect(stored?.claimedBy).toBeNull();
  });

  test("identical URL within TTL is a cache hit: no second fetch", async () => {
    const calls = { n: 0 };
    setPreviewDepsForTests(deps(netFor(["acmeplumb.example"], calls), () => now));
    const first = await generateAnonymousPreview({ url: "https://acmeplumb.example/", clientId: "client-a" });
    const second = await generateAnonymousPreview({ url: "https://acmeplumb.example/", clientId: "client-a" });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(calls.n).toBe(1);
    expect(second.preview.crawl.cacheHit).toBe(true);
    expect(second.preview.evidence.title).toBe("Acme Plumbing");
  });

  test("bad scheme is invalid-url, never fetched", async () => {
    const calls = { n: 0 };
    setPreviewDepsForTests(deps(netFor([], calls), () => now));
    const out = await generateAnonymousPreview({ url: "file:///etc/passwd", clientId: "client-a" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("invalid-url");
    expect(calls.n).toBe(0);
  });

  test("private DNS destination is fetch-failed, never fetched", async () => {
    const calls = { n: 0 };
    setPreviewDepsForTests(deps(netFor(["acmeplumb.example"], calls), () => now));
    const out = await generateAnonymousPreview({ url: "https://internal.example/", clientId: "client-a" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("fetch-failed");
    expect(out.message).toMatch(/DNS rejected/);
    expect(calls.n).toBe(0);
  });

  test("quota exhaustion is rate-limited with retryAfterMs", async () => {
    const calls = { n: 0 };
    const clock = () => now;
    const gate = new AnonymousGate(
      clock,
      new TokenBucket(1000, 1000, clock),
      new GenerationQuota(2, 3_600_000, clock),
    );
    setPreviewDepsForTests(deps(netFor(["acmeplumb.example", "other.example", "third.example"], calls), clock, gate));
    const mk = (host: string) =>
      generateAnonymousPreview({ url: "https://" + host + "/", clientId: "client-q" });
    expect((await mk("acmeplumb.example")).ok).toBe(true);
    expect((await mk("other.example")).ok).toBe(true);
    const third = await mk("third.example");
    expect(third.ok).toBe(false);
    if (third.ok) return;
    expect(third.code).toBe("rate-limited");
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  test("page budget exhaustion fails closed", async () => {
    const calls = { n: 0 };
    const clock = () => now;
    const onePage: CrawlBudget = { maxPages: 1, maxTotalBytes: 8 * 1024 * 1024 };
    setPreviewDepsForTests({
      ...deps(netFor(["acmeplumb.example", "other.example"], calls), clock),
      crawlBudget: onePage,
      ledger: new CrawlLedger(onePage),
    });
    const first = await generateAnonymousPreview({ url: "https://acmeplumb.example/", clientId: "client-b" });
    expect(first.ok).toBe(true);
    const second = await generateAnonymousPreview({ url: "https://other.example/", clientId: "client-b" });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("budget-exhausted");
    expect(calls.n).toBe(1);
  });
});
