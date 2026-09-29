/**
 * GET /api/mc/trace-forward?eventId=<journal event id>
 *
 * FORWARD trace (the other half of the Sanity law):
 *   SOURCE CHANGE -> OBSERVATION -> AFFECTED EVIDENCE/CLAIM
 *   -> AFFECTED OBJECT -> AFFECTED PROJECTION -> AFFECTED WEBSITE/UI
 *
 * All data is real: the journal event envelope is the source change; tenant
 * graphs are rebuilt through the authorized seam; affected objects are found
 * by matching provenance refs (ping-event:<event_id>).
 */
import { NextResponse } from "next/server";
import { getFydTenantGraph, getFydTenantIds } from "@/fyd/data/fyd-tenant-graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOURNAL_BASE = "http://localhost:18199";

async function allOverlayEvents() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`${JOURNAL_BASE}/events/FYD_SITE_OVERLAY?limit=1000`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const b = (await r.json()) as { events?: unknown[] } | unknown[];
    return (Array.isArray(b) ? b : b.events ?? []) as Record<string, unknown>[];
  } catch {
    clearTimeout(t);
    return null;
  }
}

export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!eventId) {
    return NextResponse.json({
      ok: false,
      status: "PROVEN",
      error: "eventId required",
    });
  }
  const events = await allOverlayEvents();
  if (!events) {
    return NextResponse.json({
      ok: false,
      status: "DEGRADED",
      error: "journal gateway unreachable",
    });
  }
  const hit = events.find((e) => e.event_id === eventId);
  if (!hit) {
    return NextResponse.json({
      ok: false,
      status: "PROVEN",
      error: "event not in FYD_SITE_OVERLAY stream",
    });
  }
  const ref = `ping-event:${eventId}`;
  const affected: {
    siteId: string;
    graphDigest: string;
    objects: { id: string; schema: string; title: string; via: string }[];
    website: string;
  }[] = [];
  for (const t of getFydTenantIds()) {
    const { graph, meta } = await getFydTenantGraph(t as never);
    const objs: { id: string; schema: string; title: string; via: string }[] = [];
    for (const o of graph.objects) {
      const prov = (o.provenance ?? {}) as unknown as Record<string, unknown>;
      const refs: string[] = [
        ...(Array.isArray(prov.updatedRefs) ? (prov.updatedRefs as string[]) : []),
        ...(typeof prov.ref === "string" ? [prov.ref] : []),
      ];
      if (refs.includes(ref)) {
        objs.push({
          id: o.id,
          schema: o.schema,
          title: o.title,
          via: "provenance ref",
        });
      }
    }
    if (objs.length) {
      affected.push({
        siteId: t,
        graphDigest: meta.graphDigest.slice(0, 16),
        objects: objs,
        website: `/sites/${t}`,
      });
    }
  }
  return NextResponse.json({
    ok: true,
    status: "PROVEN",
    forward: {
      sourceChange: {
        event_id: hit.event_id,
        timestamp: hit.timestamp,
        event_type: hit.event_type,
        aggregate_id: hit.aggregate_id,
        event_data: hit.event_data,
      },
      observation: `Journal overlay op on ${hit.aggregate_id} at ${hit.timestamp}`,
      affectedEvidence: [{ ref, kind: "journal overlay event" }],
      affectedObjects: affected,
      affectedProjection: affected.map((a) => ({
        siteId: a.siteId,
        graphDigest: a.graphDigest,
        note: "The tenant graph (Ask FYD read model) rebuilds from this event on next read.",
      })),
      affectedWebsite: affected.map((a) => a.website),
    },
  });
}
