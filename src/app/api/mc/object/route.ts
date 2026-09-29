/**
 * GET /api/mc/object?siteId=happy-place&id=<objectId>
 *
 * The Sanity law trace, computed from real backend state:
 *   RENDERED VALUE -> OBJECT -> CLAIM/OBSERVATION -> EVIDENCE -> ORIGINAL SOURCE
 * plus:
 *   OWNER CORRECTION -> SUPERSEDING CLAIM/OVERRIDE -> EVIDENCE/HISTORY
 *
 * Chain assembly:
 * - OBJECT: the composed tenant graph object (same seam as Ask FYD).
 * - CLAIM/OBSERVATION: the object's fields and owner-field-correction records.
 * - EVIDENCE: provenance.kind (procedural-fixture / canonical-journal) plus
 *   journal event lookup when provenance refs a ping-event:<event_id>.
 * - ORIGINAL SOURCE: the journal event envelope (timestamp, event_data),
 *   or the pinned fixture module when provenance is fixture-based.
 *
 * Where evidence is absent, the field is marked unbound/UNKNOWN, never invented.
 */
import { NextResponse } from "next/server";
import {
  getFydTenantGraph,
  getFydTenantIds,
  FydTenantGraphError,
} from "@/fyd/data/fyd-tenant-graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOURNAL_BASE = "http://localhost:18199";

async function findJournalEvent(eventId: string) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(
      `${JOURNAL_BASE}/events/FYD_SITE_OVERLAY?limit=1000`,
      { signal: ctrl.signal, cache: "no-store" }
    );
    clearTimeout(t);
    if (!r.ok) return { found: false as const, reason: `gateway ${r.status}` };
    const body = (await r.json()) as { events?: unknown[] } | unknown[];
    const events = (Array.isArray(body) ? body : body.events ?? []) as Record<
      string,
      unknown
    >[];
    const hit = events.find((e) => e.event_id === eventId);
    if (!hit)
      return { found: false as const, reason: "event id not in gateway stream" };
    return {
      found: true as const,
      event: {
        event_id: hit.event_id,
        timestamp: hit.timestamp,
        event_type: hit.event_type,
        aggregate_id: hit.aggregate_id,
        event_data: hit.event_data,
      },
    };
  } catch (e) {
    return {
      found: false as const,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId") ?? "";
  const id = searchParams.get("id") ?? "";
  const tenants = getFydTenantIds();
  if (!tenants.includes(siteId)) {
    return NextResponse.json(
      { ok: false, error: "unknown_tenant", tenants, status: "PROVEN" },
      { status: 404 }
    );
  }
  try {
    const { graph, meta } = await getFydTenantGraph(siteId as never);
    const obj = graph.objects.find((o) => o.id === id);
    if (!obj) {
      return NextResponse.json(
        { ok: false, error: "object_not_found", siteId, status: "PROVEN" },
        { status: 404 }
      );
    }
    const prov = (obj.provenance ?? {}) as unknown as Record<string, unknown>;
    const refs: string[] = [
      ...(Array.isArray(prov.updatedRefs) ? (prov.updatedRefs as string[]) : []),
      ...(typeof prov.ref === "string" ? [prov.ref] : []),
    ];
    const journalRefs = refs.filter((r) => r.startsWith("ping-event:"));
    const evidence: Record<string, unknown>[] = [];
    for (const ref of journalRefs) {
      const eventId = ref.slice("ping-event:".length);
      const lookup = await findJournalEvent(eventId);
      evidence.push({ ref, lookup });
    }

    const related = graph.relationships.filter(
      (r) => r.subject === id || r.object === id
    );

    return NextResponse.json({
      ok: true,
      status: "PROVEN",
      siteId,
      graphDigest: meta.graphDigest.slice(0, 16),
      trace: {
        object: {
          id: obj.id,
          schema: obj.schema,
          title: obj.title,
          visibility: obj.visibility,
          fields: obj.fields,
        },
        claims: {
          effectiveFields: obj.fields,
          ownerCorrections:
            obj.ownerFieldCorrections?.map((c) => {
              const cc = c as unknown as Record<string, unknown>;
              return {
                field: cc.field ?? null,
                sourceValue: cc.sourceValue ?? null,
                ownerValue: cc.ownerValue ?? null,
                provenance: cc.provenance ?? null,
              };
            }) ?? [],
          note: "OWNER CORRECTION -> SUPERSEDING CLAIM/OVERRIDE -> EVIDENCE/HISTORY. fields[] carries the effective (owner-winning) value; sourceValue is preserved, never erased.",
        },
        evidence: {
          provenanceKind: prov.kind ?? "unbound",
          refs,
          journalEvidence: evidence,
          fixtureSource:
            prov.kind === "procedural-fixture"
              ? `pinned fixture module, base digest ${meta.baseDigest.slice(0, 16)}`
              : null,
          unbound:
            prov.kind === "unknown" || (!refs.length && prov.kind !== "procedural-fixture")
              ? "no evidence bound to this object: UNKNOWN, not assumed"
              : null,
        },
        relationships: related.map((r) => ({
          subject: r.subject,
          predicate: r.predicate,
          object: r.object,
        })),
      },
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
