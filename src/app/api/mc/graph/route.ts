/**
 * GET /api/mc/graph?siteId=happy-place
 *
 * Business object graph summary through the AUTHORIZED seam:
 * getFydTenantGraph (pinned fixture base + journal overlays, digest-verified).
 * This is the same read path Ask FYD uses. Fail-closed on unknown tenant.
 *
 * Returns per-object: id, schema, title, visibility, provenance kind,
 * owner corrections, and relationship predicate breakdown.
 */
import { NextResponse } from "next/server";
import {
  getFydTenantGraph,
  getFydTenantIds,
  FydTenantGraphError,
} from "@/fyd/data/fyd-tenant-graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId") ?? "";
  const tenants = getFydTenantIds();
  if (!tenants.includes(siteId)) {
    return NextResponse.json(
      { ok: false, error: "unknown_tenant", tenants, status: "PROVEN" },
      { status: 404 }
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
      tenants,
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
