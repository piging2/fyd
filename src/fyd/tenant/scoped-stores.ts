/**
 * Tenant-scoped runtime entry points: the Phase 0 tenant contract applied
 * to the REAL store modules (not local test doubles).
 *
 * Every function asserts the tenant key BEFORE the underlying store's I/O
 * executes. Cross-tenant access throws TenantContextError
 * (CROSS_TENANT_REFERENCE); missing context throws TENANT_CONTEXT_MISSING.
 * Refusal is never null, [], or a successful-looking empty result.
 *
 * Tenant key model: the acting tenant's id IS the store key (the owner
 * object's id for owner state, the projection's siteId for projections and
 * Ask FYD). assertTenantKey enforces key === tenantId.
 *
 * The underlying stores themselves remain unscoped; these wrappers are the
 * only sanctioned consumption path for request/worker code.
 */
import {
  answerAskFyd,
  type AnswerAskFydDeps,
  type AnswerAskFydInput,
  type AskFydOutcome,
} from "@/fyd/ask/visitor-answer";
import {
  getPingObjectGraphSync,
  type PingProjection,
  type PingSourceOpts,
} from "@/fyd/data/ping-object-source";
import {
  applyOwnerCommand,
  readOverrides,
  type ApplyCommandOpts,
} from "@/fyd/object/owner-store";
import type { OwnerCommand, OwnerOverrides } from "@/fyd/object/types";
import {
  emitOverlayEvent,
} from "@/fyd/customize/server";
import type { PresentationIntentOverlayOp } from "@/fyd/customize/types";
import {
  TenantContextError,
  assertTenantKey,
  type TenantContext,
} from "./tenant-context";

/** Scoped owner-override read: tenant A can never read tenant B's overrides. */
export function scopedReadOverrides(
  ctx: TenantContext,
  objectId: string,
): OwnerOverrides {
  assertTenantKey(ctx, objectId);
  return readOverrides(objectId);
}

/** Scoped owner command/patch: cross-tenant patches are refused before I/O. */
export function scopedApplyOwnerCommand(
  ctx: TenantContext,
  objectId: string,
  cmd: OwnerCommand,
  knownServiceIds: string[],
  knownServiceNames: Map<string, string>,
  opts?: ApplyCommandOpts,
): OwnerOverrides {
  assertTenantKey(ctx, objectId);
  return applyOwnerCommand(objectId, cmd, knownServiceIds, knownServiceNames, opts);
}

/**
 * Scoped projection read. Asserts the tenant key, loads through the
 * verifying source, then rechecks meta.siteId: a projection file whose
 * metadata disagrees with its key is refused even under the right context.
 */
export function scopedGetProjection(
  ctx: TenantContext,
  siteId: string,
  opts?: PingSourceOpts,
): PingProjection {
  assertTenantKey(ctx, siteId);
  let projection: PingProjection;
  try {
    projection = getPingObjectGraphSync(siteId, opts);
  } catch (err) {
    // The source verifies what it loads; when its verification refuses the
    // document (e.g. a meta.siteId disagreement), that refusal is a
    // cross-tenant boundary signal. Reclassify it so callers see the tenant
    // contract error, never a bare source error.
    throw new TenantContextError(
      "CROSS_TENANT_REFERENCE",
      "Refusing: the underlying projection source would not attest this document to the tenant key.",
      { tenantId: siteId, cause: err instanceof Error ? err.message : String(err) },
    );
  }
  const metaSiteId = (projection as { meta?: { siteId?: unknown } }).meta?.siteId;
  if (metaSiteId !== siteId) {
    throw new TenantContextError(
      "CROSS_TENANT_REFERENCE",
      "Refusing: the projection's metadata disagrees with the requested tenant key.",
      { tenantId: siteId, attemptedKey: String(metaSiteId) },
    );
  }
  return projection;
}

/**
 * Scoped Ask FYD: the question's siteId must equal the acting tenant.
 * The bundle loader inside answerAskFyd then loads only that tenant's data.
 */
export function scopedAnswerAskFyd(
  ctx: TenantContext,
  input: AnswerAskFydInput,
  deps?: AnswerAskFydDeps,
): AskFydOutcome {
  assertTenantKey(ctx, input.siteId);
  return answerAskFyd(input, deps);
}

/**
 * Scoped approval/apply: an owner approval (presentation-intent overlay
 * ops) is recorded against exactly the tenant that approved it. The tenant
 * key is asserted BEFORE the gateway emit: a context for tenant A can
 * never record an approval event for tenant B.
 *
 * Note: with no gateway reachable in unit tests, the success path throws
 * the gateway's own unreachable error AFTER the tenant gate passes. That
 * is the honest assertion: the tenant boundary held, the downstream was
 * absent.
 */
export async function scopedEmitOverlayEvent(
  ctx: TenantContext,
  siteId: string,
  ops: PresentationIntentOverlayOp[],
): Promise<string> {
  assertTenantKey(ctx, siteId);
  const { eventId } = await emitOverlayEvent(siteId, ops);
  return eventId;
}
