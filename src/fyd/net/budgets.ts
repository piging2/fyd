/**
 * Budgets for anonymous/server-side fetching (onboarding order G).
 *
 * Three budgets, all fail-closed:
 * - CrawlBudget: max pages and max total bytes per anonymous generation.
 * - OriginSemaphore: concurrency budget, per-origin and global.
 * - DedupCache: per-origin in-flight dedupe plus a bounded TTL cache keyed
 *   by normalized URL, so a repeated URL never causes a repeated fetch.
 *
 * All state is in-memory (single-instance). A restart resets the budgets;
 * that is acceptable for a tiny anonymous quota and is documented, not hidden.
 */

export interface CrawlBudget {
  maxPages: number;
  maxTotalBytes: number;
}

/** The tiny anonymous-generation crawl budget. */
export const ANONYMOUS_CRAWL_BUDGET: CrawlBudget = {
  maxPages: 6,
  maxTotalBytes: 8 * 1024 * 1024,
};

/** Tracks page/byte consumption against a CrawlBudget. Fail closed. */
export class CrawlLedger {
  pages = 0;
  bytes = 0;
  constructor(private readonly budget: CrawlBudget) {}

  /** Reserve one page slot. False when the page budget is exhausted. */
  takePage(): boolean {
    if (this.pages >= this.budget.maxPages) return false;
    this.pages += 1;
    return true;
  }

  /** Add bytes. False (and adds nothing) when the byte budget would break. */
  addBytes(n: number): boolean {
    if (n < 0) return false;
    if (this.bytes + n > this.budget.maxTotalBytes) return false;
    this.bytes += n;
    return true;
  }
}

/**
 * Concurrency budget: at most perOriginMax in flight per origin and
 * globalMax in flight overall. acquire() resolves with a release function;
 * waiters are FIFO. A double release is a no-op, never a negative count.
 */
export class OriginSemaphore {
  private perOrigin = new Map<string, number>();
  private global = 0;
  private waiters: Array<() => void> = [];

  constructor(
    private readonly perOriginMax = 2,
    private readonly globalMax = 6,
  ) {}

  private canRun(origin: string): boolean {
    return (
      this.global < this.globalMax && (this.perOrigin.get(origin) ?? 0) < this.perOriginMax
    );
  }

  private pump(): void {
    const w = this.waiters.shift();
    if (w) w();
  }

  async acquire(origin: string): Promise<() => void> {
    while (!this.canRun(origin)) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.global += 1;
    this.perOrigin.set(origin, (this.perOrigin.get(origin) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.global -= 1;
      const left = (this.perOrigin.get(origin) ?? 1) - 1;
      if (left <= 0) this.perOrigin.delete(origin);
      else this.perOrigin.set(origin, left);
      this.pump();
    };
  }

  /** Introspection for tests and monitoring. */
  inFlight(): number {
    return this.global;
  }
  inFlightFor(origin: string): number {
    return this.perOrigin.get(origin) ?? 0;
  }
}

export interface DedupCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
}

/**
 * In-flight dedupe + bounded TTL cache. Concurrent getOrFetch calls for the
 * same key share one underlying fetch; successes are cached for ttlMs.
 * Failures are never cached (a retry may succeed) but do release the
 * in-flight slot. Eviction is insertion-ordered (Map) with a hard cap.
 */
export class DedupCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number }>();
  private inflight = new Map<string, Promise<T>>();
  private readonly clock: () => number;

  constructor(
    private readonly opts: DedupCacheOptions = {},
    clock?: () => number,
  ) {
    this.clock = clock ?? Date.now;
  }

  async getOrFetch(key: string, fetchFn: () => Promise<T>): Promise<T> {
    const now = this.clock();
    const hit = this.entries.get(key);
    if (hit) {
      if (hit.expiresAt > now) return hit.value;
      this.entries.delete(key);
    }
    const ongoing = this.inflight.get(key);
    if (ongoing) return ongoing;
    const p = fetchFn().then(
      (value) => {
        this.inflight.delete(key);
        this.store(key, value);
        return value;
      },
      (err) => {
        this.inflight.delete(key);
        throw err;
      },
    );
    this.inflight.set(key, p);
    return p;
  }

  private store(key: string, value: T): void {
    const ttlMs = this.opts.ttlMs ?? 10 * 60 * 1000;
    this.entries.set(key, { value, expiresAt: this.clock() + ttlMs });
    const max = this.opts.maxEntries ?? 200;
    while (this.entries.size > max) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  size(): number {
    return this.entries.size;
  }
}

/**
 * Normalize a URL for dedupe/cache keys: lowercase host, drop default ports
 * and fragments. Two strings that fetch the same resource share a key.
 */
export function normalizeFetchKey(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (
      (u.protocol === "https:" && u.port === "443") ||
      (u.protocol === "http:" && u.port === "80")
    ) {
      u.port = "";
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}
