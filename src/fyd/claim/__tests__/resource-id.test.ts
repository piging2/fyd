/**
 * Regression tests for claim resource ids and the identity bridge.
 */
import { claimResourceIdForUrl } from "../resource-id";
import { resolveClaimIdentity } from "../identity";
import { ClaimError } from "../types";

describe("claimResourceIdForUrl", () => {
  test("is deterministic and origin-scoped", () => {
    const a = claimResourceIdForUrl("https://example.com/about");
    const b = claimResourceIdForUrl("https://example.com/services?x=1#frag");
    const c = claimResourceIdForUrl("https://other.com/");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^url-[0-9a-f]{16}$/);
  });
  test("normalizes case and default ports", () => {
    expect(claimResourceIdForUrl("https://Example.COM:443/")).toBe(
      claimResourceIdForUrl("https://example.com/"),
    );
  });
  test("rejects non-http(s) and unparseable urls", () => {
    expect(() => claimResourceIdForUrl("ftp://example.com/")).toThrow(ClaimError);
    expect(() => claimResourceIdForUrl("not a url")).toThrow(ClaimError);
  });
});

describe("resolveClaimIdentity", () => {
  const VAR = "NEXT_PUBLIC_FYD_DEMO_OWNER_MODE";
  const saved = process.env[VAR];
  afterEach(() => {
    if (saved === undefined) delete process.env[VAR];
    else process.env[VAR] = saved;
  });
  test("null when demo-owner mode is off: fail closed, never invent", () => {
    delete process.env[VAR];
    expect(resolveClaimIdentity()).toBeNull();
  });
  test("demo identity when demo-owner mode is on, honestly labeled", () => {
    process.env[VAR] = "1";
    const id = resolveClaimIdentity();
    expect(id).not.toBeNull();
    expect(id?.kind).toBe("demo-owner");
    expect(id?.authNote).toMatch(/not real authentication/);
  });
});
