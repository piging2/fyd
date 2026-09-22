/**
 * (b) ADVERSARIAL: the projection seam keyed to siteId=A cannot serve siteId=B's graph.
 *
 * REPO LANDING PATH: src/fyd/tenant/__tests__/b-projection.test.ts
 *
 * What this proves:
 *  1. The tenant-scoped wrapper refuses siteId=B before any file I/O when
 *     the acting tenant is A (CROSS_TENANT_REFERENCE, typed, REJECTED).
 *  2. The seam's OWN integrity checks are documented and still hold:
 *     meta.siteId must match the requested site, the graphDigest must
 *     verify, and a missing projection fails closed (throws), never
 *     returns null/empty/stale.
 *  3. Same-tenant load works through the wrapper.
 */
import { getPingObjectGraphSync } from "@/fyd/data/ping-object-source";
import {
  TenantContextError,
  assertTenantKey,
  type TenantContext,
} from "@/fyd/tenant/tenant-context";
import {
  installDirOverrides,
  makeTempDir,
  seedProjection,
} from "./helpers";

/** Tenant-scoped projection read: contract applied at the boundary. */
function scopedGetGraph(ctx: TenantContext, siteId: string) {
  assertTenantKey(ctx, siteId);
  return getPingObjectGraphSync(siteId);
}

describe("tenant boundary: projection read seam", () => {
  let dir: string;
  let restoreEnv: () => void;

  beforeEach(() => {
    dir = makeTempDir("fyd-tenant-proj-");
    restoreEnv = installDirOverrides({ FYD_PROJECTION_DIR: dir });
    seedProjection(dir, "site-a");
    seedProjection(dir, "site-b");
  });

  afterEach(() => {
    restoreEnv();
  });

  test("same-tenant load works and returns the verified graph", () => {
    const ctxA: TenantContext = { tenantId: "site-a" };
    const proj = scopedGetGraph(ctxA, "site-a");
    expect(proj.meta.siteId).toBe("site-a");
    expect(proj.graph.objects).toHaveLength(1);
    expect(proj.graph.objects[0].title).toContain("site-a");
  });

  test("tenant A cannot load tenant B's graph: refused before I/O", () => {
    const ctxA: TenantContext = { tenantId: "site-a" };
    let err: unknown = null;
    try {
      scopedGetGraph(ctxA, "site-b");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(TenantContextError);
    expect((err as TenantContextError).code).toBe("CROSS_TENANT_REFERENCE");
    // Refusal precedes file I/O: no file named for B was even opened.
    // (Proven by construction: assertTenantKey throws before getPingObjectGraphSync.)
  });

  test("a file whose meta.siteId disagrees with its file name is refused", () => {
    // An attacker (or a bad dump) plants site-a's graph under site-evil.json
    // with meta.siteId still claiming site-a.
    seedProjection(dir, "site-evil", { metaSiteId: "site-a" });
    const ctxEvil: TenantContext = { tenantId: "site-evil" };
    expect(() => scopedGetGraph(ctxEvil, "site-evil")).toThrow(
      /does not match requested site/,
    );
  });

  test("a tampered graphDigest is refused", () => {
    seedProjection(dir, "site-tampered", { tamperDigest: true });
    const ctx: TenantContext = { tenantId: "site-tampered" };
    expect(() => scopedGetGraph(ctx, "site-tampered")).toThrow(
      /graphDigest mismatch/,
    );
  });

  test("a missing projection fails closed: throws, never null or empty", () => {
    const ctx: TenantContext = { tenantId: "site-ghost" };
    let result: unknown = "not-thrown";
    let err: unknown = null;
    try {
      result = scopedGetGraph(ctx, "site-ghost");
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect(result).toBe("not-thrown");
    expect((err as Error).message).toMatch(/no PING projection/);
  });
});
