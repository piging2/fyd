/**
 * GET /api/mc/graph?siteId=happy-place
 *
 * Business object graph summary through the AUTHORIZED seam:
 * getFydTenantGraph (pinned fixture base + journal overlays, digest-verified).
 * This is the same read path Ask FYD uses. Fail-closed on unknown tenant.
 *
 * Returns per-object: id, schema, title, visibility, provenance kind,
 * owner corrections, and relationship predicate breakdown.
 *
 * Caller entitlement (MC read-authorization repair, staged candidate
 * 2026-11-20): this route previously trusted the siteId parameter on
 * its own and disclosed the full tenant inventory in its 404 and
 * success bodies. The read scope is now resolved from the caller's
 * credential (resolveReadScope semantics, via callerScope) BEFORE any
 * graph read: the requested tenant is served only when it is inside
 * the caller's credential-derived scope; a known tenant outside scope
 * is refused 403 cross_tenant_denied carrying the requested siteId
 * only; an unknown tenant is 404 unknown_tenant. No response from
 * this route carries the tenant inventory any longer. No key and no
 * asserted header keeps the operator view (the loopback MC surface).
 */
import { NextResponse } from "next/server";
import {
  getFydTenantGraph,
  getFydTenantIds,
  FydTenantGraphError,
} from "@/fyd/data/fyd-tenant-graph";
import { callerScope } from "../_lib/mc-tenant-gate";
import { inReadScope, readAuthResponse } from "../_lib/mc-read-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  let scope;
  try {
    scope = callerScope(request);
  } catch (e) {
    return readAuthResponse(e);
  }
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId") ?? "";
  const tenants = getFydTenantIds();
  if (!tenants.includes(siteId)) {
    return NextResponse.json(
      { ok: false, error: "unknown_tenant", status: "PROVEN" },
      { status: 404 }
    );
  }
  if (!inReadScope(scope, siteId)) {
    // Typed deny, zero disclosure: only the tenant the caller itself
    // named, never any other tenant's data or the inventory.
    return NextResponse.json(
      { ok: false, error: "cross_tenant_denied", siteId, status: "PROVEN" },
      { status: 403 }
    );
  }
  try {
    const { graph, meta } = await getFydTenantGraph(siteId as never);
    const predicates: Record<string, number> = {};
    for (const r of graph.relationships) {
      predicates[r.predicate] = (predicates[r.predicate] ?? 0) + 1;
    }
    const provenanceKinds: Record<string, number> = {};
    let ownerCorrected = 0;
    const objects = graph.objects.map((o) => {
      const kind = (o.provenance as { kind?: string })?.kind ?? "unknown";
      provenanceKinds[kind] = (provenanceKinds[kind] ?? 0) + 1;
      if (o.ownerFieldCorrections?.length) ownerCorrected++;
      return {
        id: o.id,
        schema: o.schema,
        title: o.title,
        visibility: o.visibility,
        provenanceKind: kind,
        ownerCorrectionCount: o.ownerFieldCorrections?.length ?? 0,
        fieldKeys: Object.keys(o.fields ?? {}),
      };
    });
    return NextResponse.json({
      ok: true,
      status: "PROVEN",
      siteId,
      meta: {
        baseDigest: meta.baseDigest.slice(0, 16),
        graphDigest: meta.graphDigest.slice(0, 16),
        eventIds: meta.eventIds,
        generatedAt: meta.generatedAt,
      },
      objectCount: objects.length,
      relationshipCount: graph.relationships.length,
      provenanceKinds,
      predicates,
      ownerCorrectedCount: ownerCorrected,
      objects,
    });
  } catch (e) {
    if (e instanceof FydTenantGraphError) {
      return NextResponse.json(
        { ok: false, error: e.code, message: e.message, status: "PROVEN" },
        { status: 503 }
      );
    }
    throw e;
  }
}
