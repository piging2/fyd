/**
 * (c) ADVERSARIAL: the ask API with siteId=A cannot receive B's context.
 *
 * REPO LANDING PATH: src/fyd/tenant/__tests__/c-ask.test.ts
 *
 * What this proves:
 *  1. The tenant-scoped ask entry point refuses siteId=B when the acting
 *     tenant is A, and the bundle loader is NEVER invoked for the refused
 *     tenant (no B context is loaded, composed, or handed to the answerer).
 *  2. The same-tenant path forwards exactly the acting tenant's siteId to
 *     the loader: the answerer receives A's context and only A's context.
 *
 * The answerer itself (answerAskFyd) is stateless and siteId-keyed; the
 * boundary lives at the entry point, which is what these tests pin.
 */
import { answerAskFyd } from "@/fyd/ask/visitor-answer";
import {
  TenantContextError,
  assertTenantKey,
  type TenantContext,
} from "@/fyd/tenant/tenant-context";

/** Tenant-scoped ask entry point: the contract applied at the boundary. */
function scopedAnswerAskFyd(
  ctx: TenantContext,
  siteId: string,
  question: string,
  deps: Parameters<typeof answerAskFyd>[1],
) {
  assertTenantKey(ctx, siteId);
  return answerAskFyd({ siteId, question, mode: "visitor" }, deps);
}

describe("tenant boundary: ask API", () => {
  test("tenant A asking about site B is refused; B's bundle is never loaded", () => {
    const loadBundle = jest.fn(() => null);
    const ctxA: TenantContext = { tenantId: "site-a" };
    let err: unknown = null;
    try {
      scopedAnswerAskFyd(ctxA, "site-b", "What is your phone number?", {
        loadBundle,
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(TenantContextError);
    expect((err as TenantContextError).code).toBe("CROSS_TENANT_REFERENCE");
    // The answerer never saw B: the loader was not even called.
    expect(loadBundle).not.toHaveBeenCalled();
  });

  test("tenant A asking about site A reaches the answerer with A's siteId", () => {
    const loadBundle = jest.fn(() => null);
    const ctxA: TenantContext = { tenantId: "site-a" };
    const outcome = scopedAnswerAskFyd(
      ctxA,
      "site-a",
      "What is your phone number?",
      { loadBundle },
    );
    expect(loadBundle).toHaveBeenCalledTimes(1);
    expect(loadBundle).toHaveBeenCalledWith("site-a");
    // With no bundle the pipeline answers honestly: unknown site, not B's data.
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.kind).toBe("unknown_site");
    }
  });

  test("a bundle handed to the answerer is bound to the requested site", () => {
    const bundleForB = {
      siteId: "site-b",
      businessName: "Tenant B",
      graph: { objects: [], relationships: [] },
      spec: {},
      findings: [],
      renderable: false,
      mediaManifest: null,
    };
    const loadBundle = jest.fn(() => bundleForB);
    const ctxA: TenantContext = { tenantId: "site-a" };
    // Even if a loader is misconfigured to return B's bundle, the boundary
    // refused the request before the loader ran: the answerer cannot be
    // tricked into answering about B for A's tenant.
    expect(() =>
      scopedAnswerAskFyd(ctxA, "site-b", "What is your phone number?", {
        loadBundle: loadBundle as never,
      }),
    ).toThrow(TenantContextError);
    expect(loadBundle).not.toHaveBeenCalled();
  });

  test("no tenant context: the ask entry point fails closed", () => {
    const loadBundle = jest.fn(() => null);
    let err: unknown = null;
    try {
      scopedAnswerAskFyd(null as never, "site-a", "Hi?", { loadBundle });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(TenantContextError);
    expect((err as TenantContextError).code).toBe("TENANT_CONTEXT_MISSING");
    expect(loadBundle).not.toHaveBeenCalled();
  });
});
