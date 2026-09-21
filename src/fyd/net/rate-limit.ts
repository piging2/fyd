/**
 * Server-side quotas for anonymous generation (onboarding order G).
 *
 * - TokenBucket: burst-tolerant rate limiting per client key.
 * - GenerationQuota: max anonymous generations per client key per window.
 * - AnonymousGate: the combined tiny abuse boundary. check() before work,
 *   record() after the gate passes.
 *
 * Client key is the caller IP (or a session token when one exists). The
 * key source is untrusted when it comes from X-Forwarded-For without a
 * trusted proxy in front; that limitation is documented on
 * anonymousPreviewUrl and is the known next boundary, not a silent hole.
 *
 * In-memory, single-instance: a restart resets counters. For a tiny
 * anonymous quota that fail-open direction is acceptable and documented.
 * Promote to durable storage only on demonstrated abuse evidence.
 */

export type Clock = () => number;

const DEFAULT_CLOCK: Clock = Date.now;

/** Token bucket with injectable clock for deterministic tests. */
export class TokenBucket {
  private buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(
    private readonly capacity: number,
    /** Tokens refilled per millisecond. */
    private readonly refillPerMs: number,
    private readonly clock: Clock = DEFAULT_CLOCK,
  ) {}

  /** Consume one token. False when the bucket is empty (rate limited). */
  take(key: string): boolean {
    const now = this.clock();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const elapsed = Math.max(0, now - b.updatedAt);
    const tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerMs);
    if (tokens < 1) {
      this.buckets.set(key, { tokens, updatedAt: now });
      return false;
    }
    this.buckets.set(key, { tokens: tokens - 1, updatedAt: now });
    return true;
  }

  /** Introspection for tests. */
  tokensFor(key: string): number {
    const b = this.buckets.get(key);
    return b ? b.tokens : this.capacity;
  }
}

/** Max N generations per client key per fixed window. */
export class GenerationQuota {
  private counts = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
    private readonly clock: Clock = DEFAULT_CLOCK,
  ) {}

  check(key: string): { ok: true; remaining: number } | { ok: false; retryAfterMs: number } {
    const now = this.clock();
    const c = this.counts.get(key);
    if (!c || now - c.windowStart >= this.windowMs) {
      return { ok: true, remaining: this.maxPerWindow };
    }
    if (c.count >= this.maxPerWindow) {
      return { ok: false, retryAfterMs: c.windowStart + this.windowMs - now };
    }
    return { ok: true, remaining: this.maxPerWindow - c.count };
  }

  record(key: string): void {
    const now = this.clock();
    const c = this.counts.get(key);
    if (!c || now - c.windowStart >= this.windowMs) {
      this.counts.set(key, { count: 1, windowStart: now });
    } else {
      c.count += 1;
    }
  }
}

export type AnonymousGateResult =
  | { ok: true }
  | { ok: false; reason: string; retryAfterMs?: number };

/**
 * The combined tiny abuse boundary for anonymous generation.
 * Defaults: burst 3, sustained 3/hour token rate, 10 generations/hour/client.
 * Optional bucket/quota injection is for deterministic tests.
 */
export class AnonymousGate {
  private readonly bucket: TokenBucket;
  private readonly quota: GenerationQuota;

  constructor(clock: Clock = DEFAULT_CLOCK, bucket?: TokenBucket, quota?: GenerationQuota) {
    this.bucket = bucket ?? new TokenBucket(3, 3 / 3_600_000, clock);
    this.quota = quota ?? new GenerationQuota(10, 3_600_000, clock);
  }

  check(clientKey: string): AnonymousGateResult {
    const q = this.quota.check(clientKey);
    if (!q.ok) {
      return {
        ok: false,
        reason: "Anonymous generation quota exhausted for this client.",
        retryAfterMs: q.retryAfterMs,
      };
    }
    if (!this.bucket.take(clientKey)) {
      return {
        ok: false,
        reason: "Rate limited: too many anonymous generations in a short period.",
        retryAfterMs: 60_000,
      };
    }
    return { ok: true };
  }

  /** Consume one generation of quota. Call after check() passes. */
  record(clientKey: string): void {
    this.quota.record(clientKey);
  }
}

/** A module-level gate for the API route. Single instance by design. */
export const anonymousGate = new AnonymousGate();
