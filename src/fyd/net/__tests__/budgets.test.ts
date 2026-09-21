/**
 * Regression tests for the tiny abuse boundary: crawl ledger, origin
 * semaphore (concurrency budget), dedupe cache, and URL key normalization.
 */
import {
  ANONYMOUS_CRAWL_BUDGET,
  CrawlLedger,
  DedupCache,
  OriginSemaphore,
  normalizeFetchKey,
} from "../budgets";

describe("CrawlLedger", () => {
  test("page budget exhausts fail-closed", () => {
    const ledger = new CrawlLedger({ maxPages: 2, maxTotalBytes: 1000 });
    expect(ledger.takePage()).toBe(true);
    expect(ledger.takePage()).toBe(true);
    expect(ledger.takePage()).toBe(false);
    expect(ledger.pages).toBe(2);
  });
  test("byte budget rejects overflow without adding", () => {
    const ledger = new CrawlLedger({ maxPages: 10, maxTotalBytes: 100 });
    expect(ledger.addBytes(60)).toBe(true);
    expect(ledger.addBytes(50)).toBe(false);
    expect(ledger.bytes).toBe(60);
    expect(ledger.addBytes(-1)).toBe(false);
  });
  test("anonymous defaults are tiny", () => {
    expect(ANONYMOUS_CRAWL_BUDGET.maxPages).toBeLessThanOrEqual(6);
    expect(ANONYMOUS_CRAWL_BUDGET.maxTotalBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  });
});

describe("OriginSemaphore", () => {
  test("enforces per-origin concurrency", async () => {
    const sem = new OriginSemaphore(1, 10);
    const release1 = await sem.acquire("a.com");
    expect(sem.inFlightFor("a.com")).toBe(1);
    let secondAcquired = false;
    const p2 = sem.acquire("a.com").then((r) => {
      secondAcquired = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(secondAcquired).toBe(false);
    release1();
    const release2 = await p2;
    expect(secondAcquired).toBe(true);
    expect(sem.inFlightFor("a.com")).toBe(1);
    release2();
    expect(sem.inFlight()).toBe(0);
  });
  test("enforces the global cap across origins", async () => {
    const sem = new OriginSemaphore(10, 2);
    const r1 = await sem.acquire("a.com");
    const r2 = await sem.acquire("b.com");
    let third = false;
    const p3 = sem.acquire("c.com").then((r) => {
      third = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(third).toBe(false);
    r1();
    const r3 = await p3;
    expect(third).toBe(true);
    r2();
    r3();
    expect(sem.inFlight()).toBe(0);
  });
  test("double release is a safe no-op", async () => {
    const sem = new OriginSemaphore(2, 4);
    const release = await sem.acquire("a.com");
    release();
    release();
    expect(sem.inFlight()).toBe(0);
    expect(sem.inFlightFor("a.com")).toBe(0);
  });
});

describe("DedupCache", () => {
  test("concurrent fetches for one key share a single underlying fetch", async () => {
    const cache = new DedupCache<string>();
    let calls = 0;
    const fn = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return "v";
    };
    const [a, b, c] = await Promise.all([
      cache.getOrFetch("k", fn),
      cache.getOrFetch("k", fn),
      cache.getOrFetch("k", fn),
    ]);
    expect([a, b, c]).toEqual(["v", "v", "v"]);
    expect(calls).toBe(1);
  });
  test("successes are cached; failures are not", async () => {
    let now = 0;
    const cache = new DedupCache<string>({ ttlMs: 1000 }, () => now);
    let calls = 0;
    const ok = await cache.getOrFetch("k", async () => {
      calls++;
      return "v";
    });
    expect(ok).toBe("v");
    await cache.getOrFetch("k", async () => {
      calls++;
      return "v2";
    });
    expect(calls).toBe(1);
    now += 2000;
    await cache.getOrFetch("k", async () => {
      calls++;
      return "v3";
    });
    expect(calls).toBe(2);
  });
  test("a failed fetch releases the in-flight slot for retry", async () => {
    const cache = new DedupCache<string>();
    let calls = 0;
    await expect(
      cache.getOrFetch("k", async () => {
        calls++;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const v = await cache.getOrFetch("k", async () => {
      calls++;
      return "recovered";
    });
    expect(v).toBe("recovered");
    expect(calls).toBe(2);
  });
  test("hard entry cap evicts oldest", async () => {
    const cache = new DedupCache<string>({ maxEntries: 2 });
    await cache.getOrFetch("a", async () => "a");
    await cache.getOrFetch("b", async () => "b");
    await cache.getOrFetch("c", async () => "c");
    expect(cache.size()).toBe(2);
  });
});

describe("normalizeFetchKey", () => {
  test("drops fragments, default ports, and case", () => {
    expect(normalizeFetchKey("https://Example.COM:443/a#frag")).toBe("https://example.com/a");
    expect(normalizeFetchKey("http://example.com:80/a")).toBe("http://example.com/a");
  });
  test("keeps meaningful differences", () => {
    expect(normalizeFetchKey("https://example.com/a?x=1")).not.toBe(normalizeFetchKey("https://example.com/a?x=2"));
  });
});
