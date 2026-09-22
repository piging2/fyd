/**
 * Tenant context contract for the FYD composition runtime.
 *
 * REPO LANDING PATH: src/fyd/tenant/tenant-context.ts
 * (This file lives at tests/tenant-context.ts in the Lane T work area;
 * copy the whole tests/ tree into src/fyd/tenant/ when landing.)
 *
 * Nolan's directive: the tenant boundary is a HARD requirement. The FYD
 * composition runtime stores are file-backed (see TENANT-BOUNDARY.md), so
 * there is no database to push enforcement into. This module is the
 * file-system analog of the required patterns:
 *
 *   - tenant_id on tenant-owned rows        -> tenantId in every store key
 *                                              and in tenant-scoped paths
 *   - RLS with force where applicable       -> the contract REFUSES before
 *                                              any I/O; there is no bypass
 *                                              path that skips requireTenant
 *   - transaction-local tenant context      -> withTenantContext binds the
 *                                              context to one execution
 *                                              scope; absence fails closed
 *   - privileged-column protection          -> key material and private
 *                                              stores resolve paths only
 *                                              through safeIdentityDir /
 *                                              tenantScopedDir, never raw
 *                                              string interpolation
 *   - service-role separation               -> worker paths carry an
 *                                              explicit context or they do
 *                                              not run at all
 *
 * Rejection semantics (hard rule): a cross-tenant reference is REFUSED
 * with a typed TenantContextError (REJECTED). It is NEVER answered with
 * an empty result, null, or a silent fallback: an empty answer must not
 * become a hiding place for a boundary violation (SOUL.md #11).
 */

export interface TenantContext {
  /**
   * The tenant this execution acts for. In the FYD composition runtime
   * today the tenant id IS the site id (one site per business).
   */
  tenantId: string;
  /**
   * The authenticated actor the context was issued to, when known.
   * Audit only: authentication alone never grants mutation.
   */
  actorId?: string;
}

/** Tenant ids are DNS-safe slugs, matching the siteId convention. */
export const TENANT_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

export type TenantRejectionCode =
  | "TENANT_CONTEXT_MISSING"
  | "CROSS_TENANT_REFERENCE";

/**
 * Typed refusal for every tenant-boundary violation. Thrown, never
 * returned as a value, so callers cannot accidentally treat a refusal
 * as a usable result. The message names the boundary, never the
 * other tenant's data.
 */
export class TenantContextError extends Error {
  readonly code: TenantRejectionCode;
  /** The acting tenant, when a context was present. */
  readonly tenantId: string | null;
  /** The key that was refused, when a cross-tenant reference was attempted. */
  readonly attemptedKey: string | null;

  constructor(
    code: TenantRejectionCode,
    message: string,
    opts?: { tenantId?: string | null; attemptedKey?: string | null },
  ) {
    super(message);
    this.name = "TenantContextError";
    this.code = code;
    this.tenantId = opts?.tenantId ?? null;
    this.attemptedKey = opts?.attemptedKey ?? null;
  }
}

function isValidTenantId(v: unknown): v is string {
  return typeof v === "string" && TENANT_ID_PATTERN.test(v);
}

/**
 * Extract the acting tenant id from a context, or fail closed.
 * Throws TenantContextError(TENANT_CONTEXT_MISSING) when the context is
 * absent, malformed, or carries an invalid tenant id. Every store
 * read/write path must call this (directly or via withTenantContext /
 * assertTenantKey) before touching storage.
 */
export function requireTenantContext(
  ctx: TenantContext | null | undefined,
): string {
  if (ctx == null || typeof ctx !== "object") {
    throw new TenantContextError(
      "TENANT_CONTEXT_MISSING",
      "Refusing to act: no tenant context was provided. " +
        "Background and request paths must carry an explicit tenant context.",
    );
  }
  if (!isValidTenantId(ctx.tenantId)) {
    throw new TenantContextError(
      "TENANT_CONTEXT_MISSING",
      "Refusing to act: the tenant context carries no valid tenant id.",
    );
  }
  return ctx.tenantId;
}

/**
 * Refuse a cross-tenant reference. The key a caller wants to read or
 * write MUST belong to the acting tenant; anything else throws
 * TenantContextError(CROSS_TENANT_REFERENCE). Returns the tenant id on
 * success so wrappers can proceed with the verified key.
 *
 * This is the REJECTED-never-empty rule: the caller gets an exception,
 * not null, not [].
 */
export function assertTenantKey(
  ctx: TenantContext | null | undefined,
  key: string,
): string {
  const tenantId = requireTenantContext(ctx);
  if (typeof key !== "string" || key.length === 0) {
    throw new TenantContextError(
      "CROSS_TENANT_REFERENCE",
      `Refusing: tenant "${tenantId}" presented an empty store key.`,
      { tenantId, attemptedKey: key },
    );
  }
  if (key !== tenantId) {
    throw new TenantContextError(
      "CROSS_TENANT_REFERENCE",
      `Refusing: tenant "${tenantId}" attempted to reference ` +
        `a key belonging to another tenant.`,
      { tenantId, attemptedKey: key },
    );
  }
  return tenantId;
}

/**
 * Resolve the tenant-scoped subdirectory of a store base dir:
 * <baseDir>/<tenantId>. The tenant id is validated against
 * TENANT_ID_PATTERN, which also kills path traversal (.. , /, absolute
 * paths) at the boundary. Stores that keep one file per tenant MUST
 * build paths through here, never by raw string interpolation.
 */
export function tenantScopedDir(baseDir: string, tenantId: string): string {
  if (!isValidTenantId(tenantId)) {
    throw new TenantContextError(
      "TENANT_CONTEXT_MISSING",
      "Refusing to resolve a tenant directory for an invalid tenant id.",
      { attemptedKey: tenantId },
    );
  }
  // join() with a validated slug cannot escape baseDir.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { join } = require("node:path") as typeof import("node:path");
  return join(baseDir, tenantId);
}

/**
 * Run fn with a verified tenant context. The context is checked FIRST;
 * fn never executes when the context is missing or invalid, which is
 * what makes background/worker paths fail closed instead of running
 * unscoped. The verified tenant id is handed to fn so the inner path
 * can key storage without re-validating.
 */
export function withTenantContext<R>(
  ctx: TenantContext | null | undefined,
  fn: (tenantId: string) => R,
): R {
  const tenantId = requireTenantContext(ctx);
  return fn(tenantId);
}
