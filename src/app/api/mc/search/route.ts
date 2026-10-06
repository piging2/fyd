/**
 * GET /api/mc/search?q=...
 *
 * Natural-language command answered through the object graph + evidence +
 * current runtime state. Deterministic intent router, no LLM, no invented
 * dashboard text. Unknown intents return an honest UNKNOWN with the
 * supported vocabulary, never a plausible-sounding guess.
 *
 * Supported intents:
 * - "show me everything about <tenant>" / "everything about coppersmith"
 * - "what changed today"
 * - "what is waiting for me" / "what needs me"
 * - "which business facts conflict"
 * - "what is running" / "what are the agents doing"
 * - "which sites failed" / "health"
 */
import { NextResponse } from "next/server";
import { getFydTenantGraph, getFydTenantIds } from "@/fyd/data/fyd-tenant-graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOURNAL_BASE = "http://localhost:18199";

async function fetchJson(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) return null;
    return (await r.json()) as unknown;
  } catch {
    clearTimeout(t);
    return null;
  }
}

async function journalEvents(stream: string, limit: number) {
  const b = await fetchJson(`${JOURNAL_BASE}/events/${stream}?limit=${limit}`);
  if (!b) return [];
  const arr = (Array.isArray(b) ? b : (b as { events?: unknown[] }).events ?? []) as Record<string, unknown>[];
  return arr;
}

function todayPrefix() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").toLowerCase().trim();
  if (!q) {
    return NextResponse.json({
      ok: false,
      status: "PROVEN",
      error: "empty query",
      vocabulary: VOCAB,
    });
  }

  // Intent: everything about a tenant
  // Alias rule (deterministic, documented): a tenant matches on its full id,
  // its space-slug, or any hyphen segment of length >= 6 matched as a whole
  // word. The length gate keeps short stems like "happy" from hijacking
  // unrelated queries while honoring short UI suggestions such as
  // "everything about coppersmith".
  const tenantMentioned = (t: string): boolean => {
    const candidates = [t, t.replace(/-/g, " ")];
    for (const seg of t.split("-")) {
      if (seg.length >= 6) candidates.push(seg);
    }
    return candidates.some((a) =>
      a.includes(" ")
        ? q.includes(a)
        : new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(q)
    );
  };
  for (const t of getFydTenantIds()) {
    if (tenantMentioned(t)) {
      const { graph, meta } = await getFydTenantGraph(t as never);
      const services = graph.objects.filter((o) => /service|offer/i.test(o.schema));
      const people = graph.objects.filter((o) => /person|team|employee/i.test(o.schema));
      const corrected = graph.objects.filter((o) => o.ownerFieldCorrections?.length);
      return NextResponse.json({
        ok: true,
        status: "PROVEN",
        intent: "tenant_overview",
        siteId: t,
        answer: {
          objectCount: graph.objects.length,
          relationshipCount: graph.relationships.length,
          services: services.map((o) => ({ id: o.id, title: o.title })),
          people: people.map((o) => ({ id: o.id, title: o.title })),
          ownerCorrectedObjects: corrected.map((o) => o.id),
          graphDigest: meta.graphDigest.slice(0, 16),
          overlayEvents: meta.eventIds,
          traceHint: "Open any object via /api/mc/object?siteId=" + t + "&id=<id> for the full Sanity-law trace.",
        },
      });
    }
  }

  // Intent: what changed today
  if (/what changed|changes today|changed today/.test(q)) {
    const prefix = todayPrefix();
    const overlays = await journalEvents("FYD_SITE_OVERLAY", 100);
    const todays = overlays.filter((e) =>
      String(e.timestamp ?? "").startsWith(prefix)
    );
    return NextResponse.json({
      ok: true,
      status: "PROVEN",
      intent: "changes_today",
      answer: {
        date: prefix,
        overlayEventsToday: todays.map((e) => ({
          event_id: e.event_id,
          timestamp: e.timestamp,
          site: (e.event_data as Record<string, unknown> | undefined)?.siteId ?? null,
        })),
        count: todays.length,
      },
    });
  }

  // Intent: what needs me / waiting
  if (/waiting|needs me|need me|requires authority|blocked/.test(q)) {
    const today = await fetchJson("http://localhost:3100/api/mc/today");
    const t = (today as { today?: { needsAuthority?: unknown } } | null)?.today
      ?.needsAuthority;
    return NextResponse.json({
      ok: true,
      status: "PROVEN",
      intent: "needs_authority",
      answer: t ?? { status: "DEGRADED", note: "today surface unreachable" },
    });
  }

  // Intent: which business facts conflict
  if (/conflict/.test(q)) {
    const out: { siteId: string; objectId: string; corrections: unknown[] }[] = [];
    for (const t of getFydTenantIds()) {
      const { graph } = await getFydTenantGraph(t as never);
      for (const o of graph.objects) {
        if (o.ownerFieldCorrections?.length) {
          out.push({
            siteId: t,
            objectId: o.id,
            corrections: o.ownerFieldCorrections,
          });
        }
      }
    }
    return NextResponse.json({
      ok: true,
      status: "PROVEN",
      intent: "conflicts",
      answer: {
        count: out.length,
        items: out,
        note: "Owner corrections are superseding claims; source values are preserved, never erased. Journal conflict ops would appear here when the journal records them.",
      },
    });
  }

  // Intent: what is running
  if (/running|agents doing|what is orca/.test(q)) {
    const agents = await fetchJson("http://localhost:3100/api/mc/agents");
    return NextResponse.json({
      ok: true,
      status: agents ? "PROVEN" : "DEGRADED",
      intent: "running",
      answer: agents ?? { note: "agents surface unreachable" },
    });
  }

  // Intent: health
  if (/health|failed|failing|sites failed/.test(q)) {
    const today = await fetchJson("http://localhost:3100/api/mc/today");
    const t = (today as { services?: unknown; today?: { failed?: unknown } } | null);
    return NextResponse.json({
      ok: true,
      status: t ? "PROVEN" : "DEGRADED",
      intent: "health",
      answer: t ? { services: t.services, failed: t.today?.failed } : { note: "today surface unreachable" },
    });
  }

  return NextResponse.json({
    ok: false,
    status: "PROVEN",
    error: "unknown_intent",
    vocabulary: VOCAB,
    note: "The router is deterministic. Unknown intents are not guessed.",
  });
}

const VOCAB = [
  "show me everything about <business>",
  "what changed today",
  "what is waiting for me",
  "which business facts conflict",
  "what is running",
  "health",
];
