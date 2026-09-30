/**
 * GET /api/mc/crm?view=companies|people|leads|opportunities
 *
 * CRM PROJECTION, read-only. Companies, people, leads and opportunities are
 * rendered as projections of EXISTING state only:
 *   - the FYD tenant object graph (the same getFydTenantGraph seam Ask FYD
 *     uses; the PING object graph owns the semantics)
 *   - the FYD journal gateway (FYD_VISITOR_INTENT events)
 * No new authorities, no new stores, no new engines, no new buses.
 * People and opportunities have no live source wired; they answer honestly
 * UNKNOWN rather than inventing rows. Leads whose event_data.siteId is not
 * a known tenant are QUARANTINED by Common Room entity binding, never shown
 * as leads.
 */
import { NextResponse } from "next/server";
import {
  getFydTenantGraph,
  getFydTenantIds,
  FydTenantGraphError,
} from "@/fyd/data/fyd-tenant-graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOURNAL_BASE =
  process.env.FYD_JOURNAL_GATEWAY_URL ?? "http://127.0.0.1:18200";
const OWNER =
  "convergence lane block 10-20 (projection only; PING object graph owns semantics)";
const KNOWN_VIEWS = ["companies", "people", "leads", "opportunities"] as const;
type View = (typeof KNOWN_VIEWS)[number];
type Truth = "OBSERVED" | "UNKNOWN" | "QUARANTINED";

/** Card-level provenance, mirroring the MC shell provenance-line contract. */
interface CardProvenance {
  source: string;
  owner: string;
  truth: Truth;
  canDo: string;
  approval: string;
  happened: string;
}

interface JournalEvent {
  event_id?: string;
  timestamp?: string;
  event_type?: string;
  aggregate_id?: string;
  event_data?: Record<string, unknown>;
}

interface ViewResult {
  view: View;
  source: string;
  items: Record<string, unknown>[];
  truth?: Truth;
  unknown?: string;
  meta: Record<string, unknown>;
}

interface TenantGraph {
  objects: {
    id: string;
    schema?: string;
    title?: string;
    fields?: Record<string, unknown>;
    provenance?: unknown;
  }[];
  relationships: { subject: string; predicate: string; object: string }[];
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

async function readJournalEvents(
  eventType: string,
  limit: number
): Promise<JournalEvent[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(
      `${JOURNAL_BASE}/events/${eventType}?limit=${limit}`,
      { signal: ctrl.signal, cache: "no-store" }
    );
    if (!r.ok) throw new Error(`journal gateway returned ${r.status}`);
    const body = (await r.json()) as { events?: unknown[] } | unknown[];
    return (Array.isArray(body) ? body : body.events ?? []) as JournalEvent[];
  } finally {
    clearTimeout(t);
  }
}

function cardProvenance(
  source: string,
  truth: Truth,
  canDo: string,
  approval: string,
  happened: string
): CardProvenance {
  return { source, owner: OWNER, truth, canDo, approval, happened };
}

const graphs = new Map<string, { graph: TenantGraph; digest16: string }>();

async function tenantGraph(siteId: string) {
  const cached = graphs.get(siteId);
  if (cached) return cached;
  const { graph, meta } = await getFydTenantGraph(siteId as never);
  const entry = {
    graph: graph as unknown as TenantGraph,
    digest16: String(meta.graphDigest).slice(0, 16),
  };
  graphs.set(siteId, entry);
  return entry;
}

async function companiesView(): Promise<ViewResult> {
  const tenants = getFydTenantIds();
  const items: Record<string, unknown>[] = [];
  const sites: Record<string, unknown>[] = [];
  for (const siteId of tenants) {
    const { graph, digest16 } = await tenantGraph(siteId);
    const byId = new Map(graph.objects.map((o) => [o.id, o]));
    sites.push({
      siteId,
      objectCount: graph.objects.length,
      graphDigest16: digest16,
    });
    for (const o of graph.objects) {
      if (!String(o.schema ?? "").startsWith("ping.social.business")) continue;
      const located = graph.relationships.filter(
        (r) => r.subject === o.id && r.predicate === "located_at"
      );
      const offers = graph.relationships.filter(
        (r) => r.subject === o.id && r.predicate === "offers"
      );
      const locationTitle =
        located.length > 0
          ? (byId.get(located[0].object)?.title ?? located[0].object)
          : null;
      const serviceTitles = offers.map(
        (r) => byId.get(r.object)?.title ?? r.object
      );
      const provKind =
        (o.provenance as { kind?: string } | undefined)?.kind ?? "unknown";
      items.push({
        id: `${siteId}:${o.id}`,
        siteId,
        name: o.title ?? null,
        schema: o.schema ?? null,
        fieldKeys: Object.keys(o.fields ?? {}),
        locationTitle,
        serviceTitles,
        provenanceKind: provKind,
        graphDigest16: digest16,
        truth: "OBSERVED",
        provenance: cardProvenance(
          "fyd tenant graph seam (Ask FYD read path)",
          "OBSERVED",
          "owner may review the company card; read-only",
          "no approval involved; this is a projection",
          `projected from graph digest ${digest16}`
        ),
      });
    }
  }
  return {
    view: "companies",
    source: "fyd tenant graph seam (Ask FYD read path)",
    items,
    meta: { sites },
  };
}

function peopleView(): ViewResult {
  return {
    view: "people",
    source: "none: no live person source wired",
    items: [],
    truth: "UNKNOWN",
    unknown:
      "no live person source wired: no visitor identity capture and no contact ingest; the outreach pipeline is a separate machine and PING is not a prospect database",
    meta: {},
  };
}

function findService(
  graph: TenantGraph,
  serviceId: string | null,
  serviceTitle: string | null
) {
  const services = graph.objects.filter((o) =>
    String(o.schema ?? "").startsWith("ping.social.service")
  );
  if (serviceId) {
    const hit = services.find((o) => o.id === serviceId);
    if (hit) return hit;
  }
  if (serviceTitle) {
    const want = serviceTitle.toLowerCase();
    const hit = services.find((o) => (o.title ?? "").toLowerCase() === want);
    if (hit) return hit;
  }
  return null;
}

async function leadsView(): Promise<ViewResult> {
  const tenants = getFydTenantIds();
  const events = await readJournalEvents("FYD_VISITOR_INTENT", 200);
  if (events.length === 0) {
    return {
      view: "leads",
      source: "fyd journal gateway (FYD_VISITOR_INTENT)",
      items: [],
      truth: "UNKNOWN",
      unknown: "no visitor-intent events in the journal",
      meta: { journalBase: JOURNAL_BASE, eventType: "FYD_VISITOR_INTENT" },
    };
  }
  const items: Record<string, unknown>[] = [];
  for (const ev of events) {
    const eventId = str(ev.event_id) ?? "unknown";
    const data: Record<string, unknown> =
      (ev.event_data as Record<string, unknown> | undefined) ?? {};
    const siteId = str(data.siteId) ?? "";
    const when = str(ev.timestamp) ?? null;
    const source = str(data.source) ?? null;
    if (!tenants.includes(siteId)) {
      items.push({
        id: `lead:${eventId}`,
        truth: "QUARANTINED",
        quarantinedReason: `event_data.siteId "${siteId}" is not a known FYD tenant; Common Room entity binding requires a known tenant, so this event is never projected as a lead`,
        when,
        source,
        evidence: [{ ref: `journal:${eventId}`, kind: "event" }],
        provenance: cardProvenance(
          "fyd journal gateway (FYD_VISITOR_INTENT)",
          "QUARANTINED",
          "none: quarantined, not projected as a lead",
          "not applicable: withheld by entity binding",
          when ?? "timestamp not recorded"
        ),
      });
      continue;
    }
    const { graph, digest16 } = await tenantGraph(siteId);
    const biz = graph.objects.find((o) =>
      String(o.schema ?? "").startsWith("ping.social.business")
    );
    const svc = findService(graph, str(data.serviceId), str(data.serviceTitle));
    const evidence: Record<string, unknown>[] = [
      { ref: `journal:${eventId}`, kind: "event" },
    ];
    if (biz) evidence.push({ ref: `graph:${siteId}:${biz.id}`, kind: "object" });
    if (svc) evidence.push({ ref: `graph:${siteId}:${svc.id}`, kind: "object" });
    const provKind =
      (data.provenance as { kind?: string } | undefined)?.kind ?? "observed";
    items.push({
      id: `lead:${eventId}`,
      who: str(data.visitorRef) ?? "anonymous",
      what: str(data.intent) ?? "unknown_intent",
      message: str(data.message),
      business: biz ? { siteId, name: biz.title ?? null } : { siteId, name: null },
      service: svc ? { id: svc.id, title: svc.title ?? null } : null,
      when,
      source,
      evidence,
      status: "NEW",
      nextAction:
        "owner review; contact WITHHELD until owner approval (outreach held)",
      truth: "OBSERVED",
      provenanceKind: provKind,
      graphDigest16: digest16,
      provenance: cardProvenance(
        "fyd journal gateway (FYD_VISITOR_INTENT) + fyd tenant graph seam",
        "OBSERVED",
        "owner may review intent and evidence; no contact route is engaged",
        "owner approval required before any contact; outreach held",
        when ?? "timestamp not recorded"
      ),
    });
  }
  return {
    view: "leads",
    source:
      "fyd journal gateway (FYD_VISITOR_INTENT) + fyd tenant graph seam (Ask FYD read path)",
    items,
    meta: {
      journalBase: JOURNAL_BASE,
      eventType: "FYD_VISITOR_INTENT",
      eventsSeen: events.length,
    },
  };
}

function opportunitiesView(): ViewResult {
  return {
    view: "opportunities",
    source: "none: no pipeline/deal source wired",
    items: [],
    truth: "UNKNOWN",
    unknown: "no pipeline/deal source wired",
    meta: {},
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const viewParam = searchParams.get("view") ?? "";
  if (!(KNOWN_VIEWS as readonly string[]).includes(viewParam)) {
    return NextResponse.json(
      { ok: false, error: "unknown_view", views: KNOWN_VIEWS, status: "PROVEN" },
      { status: 400 }
    );
  }
  const view = viewParam as View;
  try {
    let built: ViewResult;
    switch (view) {
      case "companies":
        built = await companiesView();
        break;
      case "people":
        built = peopleView();
        break;
      case "leads":
        built = await leadsView();
        break;
      case "opportunities":
        built = opportunitiesView();
        break;
    }
    return NextResponse.json({
      ok: true,
      status: "PROVEN",
      view: built.view,
      source: built.source,
      owner: OWNER,
      items: built.items,
      ...(built.truth ? { truth: built.truth } : {}),
      ...(built.unknown ? { unknown: built.unknown } : {}),
      meta: built.meta,
    });
  } catch (e) {
    if (e instanceof FydTenantGraphError) {
      return NextResponse.json(
        { ok: false, error: e.code, message: e.message, status: "PROVEN" },
        { status: 503 }
      );
    }
    if (e instanceof Error && e.message.startsWith("journal gateway")) {
      return NextResponse.json(
        {
          ok: false,
          error: "journal_unavailable",
          message: e.message,
          status: "PROVEN",
        },
        { status: 503 }
      );
    }
    throw e;
  }
}
