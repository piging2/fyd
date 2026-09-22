/**
 * (a) ADVERSARIAL: tenant A cannot read or write tenant B's owner overrides.
 *
 * REPO LANDING PATH: src/fyd/tenant/__tests__/a-owner.test.ts
 *
 * What this proves:
 *  1. BASELINE GAP (documents the current state): the unscoped owner store
 *     has NO tenant boundary. readOverrides("site-b") and
 *     applyOwnerCommand("site-b", ...) succeed for any caller. This is the
 *     gap the tenant-context contract closes; the test pins it so a future
 *     regression cannot silently reintroduce unscoped call sites.
 *  2. CONTRACT ENFORCEMENT: the tenant-scoped wrappers refuse cross-tenant
 *     keys with a typed TenantContextError (REJECTED), never an empty
 *     result, and the refusal message never leaks the other tenant's data.
 *  3. SAME-TENANT PATH STILL WORKS: a scoped write for the acting tenant
 *     round-trips through the real store.
 *
 * NOTE: this suite tests the contract wrappers (the tenant-boundary lane's
 * deliverable) over the real store modules. When the composition runtime
 * adopts tenant-context as a first-class parameter, these wrappers collapse
 * into the store signatures themselves; the assertions stay valid.
 */
import { readdirSync } from "node:fs";
import { applyOwnerCommand, readOverrides } from "@/fyd/object/owner-store";
import {
  TenantContextError,
  assertTenantKey,
  requireTenantContext,
  type TenantContext,
} from "@/fyd/tenant/tenant-context";
import { installDirOverrides, makeTempDir } from "./helpers";

const SECRET_PHONE = "555-019-2837"; // tenant B's "secret": must never leak to A

/** Tenant-scoped owner-store wrappers: the contract applied at the boundary. */
function scopedReadOverrides(ctx: TenantContext, objectId: string) {
  assertTenantKey(ctx, objectId);
  return readOverrides(objectId);
}

function scopedApplyOwnerCommand(
  ctx: TenantContext,
  objectId: string,
  cmd: Parameters<typeof applyOwnerCommand>[1],
) {
  assertTenantKey(ctx, objectId);
  return applyOwnerCommand(objectId, cmd, [], new Map(), {
    actorLabel: "tenant-boundary-test",
  });
}

describe("tenant boundary: owner overrides", () => {
  let dir: string;
  let restoreEnv: () => void;

  beforeEach(() => {
    dir = makeTempDir("fyd-tenant-owner-");
    restoreEnv = installDirOverrides({ FYD_OWNER_DIR: dir });
    // Seed tenant B's owner state through the real public API.
    applyOwnerCommand(
      "site-b",
      { type: "set-contact-field", field: "phone", value: SECRET_PHONE },
      [],
      new Map(),
      { actorLabel: "tenant-boundary-test" },
    );
  });

  afterEach(() => {
    restoreEnv();
  });

  test("BASELINE GAP: unscoped store serves tenant B to any caller (the gap)", () => {
    const overrides = readOverrides("site-b");
    expect(overrides.fieldCorrections?.["phone"]?.ownerValue).toBe(SECRET_PHONE);
  });

  test("tenant A cannot READ tenant B's overrides: refused, typed, no leak", () => {
    const ctxA: TenantContext = { tenantId: "site-a" };
    let err: unknown = null;
    try {
      scopedReadOverrides(ctxA, "site-b");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(TenantContextError);
    const tce = err as TenantContextError;
    expect(tce.code).toBe("CROSS_TENANT_REFERENCE");
    expect(tce.tenantId).toBe("site-a");
    expect(tce.attemptedKey).toBe("site-b");
    // The refusal names the boundary, never the other tenant's data.
    expect(tce.message).not.toContain(SECRET_PHONE);
    expect(tce.message).not.toContain("site-b\" attempted");
  });

  test("tenant A cannot WRITE tenant B's overrides: refused before any I/O", () => {
    const ctxA: TenantContext = { tenantId: "site-a" };
    expect(() =>
      scopedApplyOwnerCommand(ctxA, "site-b", {
        type: "set-contact-field",
        field: "phone",
        value: "555-000-0000",
      }),
    ).toThrow(TenantContextError);
    // Tenant B's value is untouched.
    expect(readOverrides("site-b").fieldCorrections?.["phone"]?.ownerValue).toBe(
      SECRET_PHONE,
    );
    // No file was created for a key outside the acting tenant.
    expect(readdirSync(dir)).toEqual(["site-b.json"]);
  });

  test("tenant B CAN read and write its own overrides (same-tenant path works)", () => {
    const ctxB: TenantContext = { tenantId: "site-b" };
    const read = scopedReadOverrides(ctxB, "site-b");
    expect(read.fieldCorrections?.["phone"]?.ownerValue).toBe(SECRET_PHONE);
    const after = scopedApplyOwnerCommand(ctxB, "site-b", {
      type: "set-contact-field",
      field: "email",
      value: "owner@example.com",
    });
    expect(after.fieldCorrections?.["email"]?.ownerValue).toBe("owner@example.com");
  });

  test("a caller with NO tenant context cannot read or write anything", () => {
    expect(() => requireTenantContext(null)).toThrow(TenantContextError);
    expect(() => requireTenantContext(undefined)).toThrow(TenantContextError);
    expect(() => scopedReadOverrides(null as never, "site-b")).toThrow(
      TenantContextError,
    );
    try {
      scopedReadOverrides(null as never, "site-b");
    } catch (e) {
      expect((e as TenantContextError).code).toBe("TENANT_CONTEXT_MISSING");
    }
  });
});
