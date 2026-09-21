/**
 * Regression tests for server-side anonymous quotas: token bucket,
 * generation quota, and the combined AnonymousGate. Deterministic via
 * injected clocks.
 */
import { AnonymousGate, GenerationQuota, TokenBucket } from "../rate-limit";

function manualClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("TokenBucket", () => {
  test("burst then rate-limits, then refills", () => {
    const c = manualClock();
    const b = new TokenBucket(2, 1 / 1000, c.now);
    expect(b.take("k")).toBe(true);
    expect(b.take("k")).toBe(true);
    expect(b.take("k")).toBe(false);
    c.advance(1000);
    expect(b.take("k")).toBe(true);
    expect(b.take("k")).toBe(false);
  });
  test("buckets are per key", () => {
    const c = manualClock();
    const b = new TokenBucket(1, 0, c.now);
    expect(b.take("a")).toBe(true);
    expect(b.take("a")).toBe(false);
    expect(b.take("b")).toBe(true);
  });
});

describe("GenerationQuota", () => {
  test("exhausts within the window and recovers after", () => {
    const c = manualClock();
    const q = new GenerationQuota(2, 60_000, c.now);
    expect(q.check("k")).toEqual({ ok: true, remaining: 2 });
    q.record("k");
    expect(q.check("k")).toEqual({ ok: true, remaining: 1 });
    q.record("k");
    const exhausted = q.check("k");
    expect(exhausted.ok).toBe(false);
    if (!exhausted.ok) expect(exhausted.retryAfterMs).toBeGreaterThan(0);
    c.advance(60_001);
    expect(q.check("k")).toEqual({ ok: true, remaining: 2 });
  });
});

describe("AnonymousGate", () => {
  test("allows then rate-limits bursts", () => {
    const c = manualClock();
    const gate = new AnonymousGate(c.now);
    // Burst of 3 passes (bucket capacity 3), 4th is rate limited.
    expect(gate.check("ip").ok).toBe(true);
    gate.record("ip");
    expect(gate.check("ip").ok).toBe(true);
    gate.record("ip");
    expect(gate.check("ip").ok).toBe(true);
    gate.record("ip");
    const limited = gate.check("ip");
    expect(limited.ok).toBe(false);
    if (!limited.ok) expect(limited.retryAfterMs).toBeGreaterThan(0);
  });
  test("quota exhaustion reports retryAfterMs", () => {
    const c = manualClock();
    // Generous bucket so the quota (not the bucket) binds in this test.
    const gate = new AnonymousGate(
      c.now,
      new TokenBucket(100, 0, c.now),
      new GenerationQuota(2, 60_000, c.now),
    );
    expect(gate.check("ip").ok).toBe(true);
    gate.record("ip");
    expect(gate.check("ip").ok).toBe(true);
    gate.record("ip");
    const r = gate.check("ip");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/quota exhausted/);
      expect(r.retryAfterMs).toBeGreaterThan(0);
    }
  });
  test("one client being limited does not affect another", () => {
    const c = manualClock();
    const gate = new AnonymousGate(c.now);
    for (let i = 0; i < 3; i++) {
      gate.check("evil");
      gate.record("evil");
    }
    expect(gate.check("evil").ok).toBe(false);
    expect(gate.check("innocent").ok).toBe(true);
  });
});
