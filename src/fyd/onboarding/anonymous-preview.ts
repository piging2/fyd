/**
 * The anonymous preview service (onboarding order G).
 *
 * PASTE URL -> FYD UNDERSTANDS IT -> GENERATED PREVIEW, with value before
 * any authentication. This is the ONLY anonymous entry point that performs
 * network I/O, and it consumes the fyd/net abuse boundary:
 *
 * 1. AnonymousGate: per-minute token bucket + per-hour generation quota
 *    per client. check() runs before any work; record() consumes quota
 *    only after a fresh preview is generated (cache hits are not new
 *    generations). Rate-limited callers get retryAfterMs.
 * 2. safeFetchPage: the single SSRF gate. Bad schemes, credential-bearing
 *    URLs, private/loopback/link-local/CGNAT DNS destinations, and hostile
 *    redirects return { ok: false } and are never fetched.
 * 3. Crawl budget: page cap + total byte cap via CrawlLedger.
 * 4. Origin semaphore: bounded in-flight requests per origin and globally.
 * 5. Dedup cache: identical URLs within the TTL share one fetch; failures
 *    are never cached.
 *
 * The preview performs NO consequential action: it reads public HTML and
 * writes nothing except the OBSERVED claim record (public evidence with no
 * ownership claim) and the cache/ledger bookkeeping.
 */
import { safeFetchPage, type SafeFetchDeps, type SafeFetchResult } from "../net/safe-fetch";
import {
  ANONYMOUS_CRAWL_BUDGET,
  CrawlLedger,
  DedupCache,
  normalizeFetchKey,
  OriginSemaphore,
  type CrawlBudget,
} from "../net/budgets";
import { AnonymousGate, anonymousGate } from "../net/rate-limit";
import { claimResourceIdForUrl } from "../claim/resource-id";
import { ClaimError } from "../claim/types";
import { claimExists, writeClaim } from "../claim/store";
import { createObserved } from "../claim/machine";
import { extractPageEvidence, type PageEvidence } from "./extractor";

export interface PreviewDeps {
  /** Injected DNS/fetch for safeFetchPage (tests). */
  net?: SafeFetchDeps;
  /** Injected gate (tests). */
  gate?: AnonymousGate;
  /** Injected crawl budget config (tests). */
  crawlBudget?: CrawlBudget;
  /** Injected ledger (tests). */
  ledger?: CrawlLedger;
  /** Injected semaphore (tests). */
  semaphore?: OriginSemaphore;
  /** Injected cache (tests). */
  cache?: DedupCache<AnonymousPreview>;
  /** Injected clock (tests). */
  clock?: () => number;
}

let testDeps: PreviewDeps | null = null;
/** Test-only seam. Never call from production code. */
export function setPreviewDepsForTests(d: PreviewDeps | null): void {
  testDeps = d;
}

// Module singletons: the tiny anonymous boundary is intentionally
// in-memory and single-instance. Documented in fyd/net/budgets.ts.
const sharedCache = new DedupCache<AnonymousPreview>({ ttlMs: 600_000, maxEntries: 500 });
const sharedLedger = new CrawlLedger(ANONYMOUS_CRAWL_BUDGET);
const sharedSemaphore = new OriginSemaphore(2, 6);

interface ResolvedDeps {
  net?: SafeFetchDeps;
  gate: AnonymousGate;
  crawlBudget: CrawlBudget;
  ledger: CrawlLedger;
  semaphore: OriginSemaphore;
  cache: DedupCache<AnonymousPreview>;
  clock: () => number;
}

function resolved(): ResolvedDeps {
  return {
    net: testDeps?.net,
    gate: testDeps?.gate ?? anonymousGate,
    crawlBudget: testDeps?.crawlBudget ?? ANONYMOUS_CRAWL_BUDGET,
    ledger: testDeps?.ledger ?? sharedLedger,
    semaphore: testDeps?.semaphore ?? sharedSemaphore,
    cache: testDeps?.cache ?? sharedCache,
    clock: testDeps?.clock ?? (() => Date.now()),
  };
}

export interface AnonymousPreview {
  resourceId: string;
  sourceUrl: string;
  finalUrl: string;
  fetchedAt: string;
  /** The claim state a preview always leaves behind. */
  claimState: "observed";
  evidence: PageEvidence;
  crawl: { pagesFetched: number; bytesUsed: number; cacheHit: boolean };
}

export type PreviewFailureCode =
  | "rate-limited"
  | "invalid-url"
  | "fetch-failed"
  | "budget-exhausted";

export type PreviewOutcome =
  | { ok: true; preview: AnonymousPreview }
  | {
      ok: false;
      code: PreviewFailureCode;
      message: string;
      retryAfterMs?: number;
    };

export interface PreviewInput {
  url: string;
  /** Opaque client identifier (the route hashes the IP). */
  clientId: string;
}

const PAGE_FETCH_MAX_BYTES = 1024 * 1024; // 1 MiB per page for previews.

/** Internal throw carrying a user-facing failure code. Never cached. */
class PreviewFailure extends Error {
  constructor(
    readonly code: PreviewFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "PreviewFailure";
  }
}

export async function generateAnonymousPreview(input: PreviewInput): Promise<PreviewOutcome> {
  const d = resolved();
  const now = d.clock();

  // 1. Gate before any work.
  const g = d.gate.check(input.clientId);
  if (!g.ok) {
    return {
      ok: false,
      code: "rate-limited",
      message: g.reason,
      retryAfterMs: g.retryAfterMs,
    };
  }

  // 2. Validate the URL (http/https only; no credentials).
  let resourceId: string;
  let canonical: string;
  try {
    resourceId = claimResourceIdForUrl(input.url);
    canonical = new URL(input.url).toString();
  } catch (e) {
    const message =
      e instanceof ClaimError ? e.message : "That URL could not be understood.";
    return { ok: false, code: "invalid-url", message };
  }
  const cacheKey = normalizeFetchKey(canonical);

  // 3. Fetch-or-cache. getOrFetch dedupes concurrent callers and never
  //    caches failures, so a retry after a failure refetches.
  let cacheHit = true;
  const buildFresh = async (): Promise<AnonymousPreview> => {
    cacheHit = false;

    // 4. Budget pre-check (miss only).
    if (
      d.ledger.pages >= d.crawlBudget.maxPages ||
      d.ledger.bytes >= d.crawlBudget.maxTotalBytes
    ) {
      throw new PreviewFailure(
        "budget-exhausted",
        "The anonymous preview budget is spent for now. Please try again later.",
      );
    }
    const remaining = d.crawlBudget.maxTotalBytes - d.ledger.bytes;

    // 5. SSRF-safe fetch under the origin semaphore.
    const origin = new URL(canonical).origin;
    const release = await d.semaphore.acquire(origin);
    let res: SafeFetchResult;
    try {
      res = await safeFetchPage(
        canonical,
        { maxBytes: Math.min(PAGE_FETCH_MAX_BYTES, remaining) },
        d.net,
      );
    } finally {
      release();
    }
    if (!res.ok) {
      throw new PreviewFailure("fetch-failed", res.reason);
    }
    d.ledger.takePage();
    d.ledger.addBytes(res.bytes.length);

    // 6. Understand the page: observed evidence, never inferred facts.
    const evidence = extractPageEvidence(res.bytes.toString("utf8"), res.finalUrl);
    const preview: AnonymousPreview = {
      resourceId,
      sourceUrl: canonical,
      finalUrl: res.finalUrl,
      fetchedAt: new Date(now).toISOString(),
      claimState: "observed",
      evidence,
      crawl: { pagesFetched: 1, bytesUsed: res.bytes.length, cacheHit: false },
    };

    // 7. Leave the OBSERVED claim record (public evidence, no ownership).
    //    Idempotent: never overwrite an existing claim.
    try {
      if (!claimExists(resourceId)) {
        writeClaim(createObserved(resourceId, res.finalUrl));
      }
    } catch {
      // Claim bookkeeping must never break the preview itself.
    }

    // 8. A fresh preview is one generation of quota.
    d.gate.record(input.clientId);
    return preview;
  };

  let preview: AnonymousPreview;
  try {
    preview = await d.cache.getOrFetch(cacheKey, buildFresh);
  } catch (e) {
    if (e instanceof PreviewFailure) {
      return { ok: false, code: e.code, message: e.message };
    }
    throw e;
  }
  if (cacheHit) {
    preview = { ...preview, crawl: { ...preview.crawl, cacheHit: true } };
  }
  return { ok: true, preview };
}
