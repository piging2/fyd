/**
 * pg-replay-proof.mts — full local loop, reducer leg.
 *
 * Usage: node --import tsx/esm __tests__/pg-replay-proof.mts <gateway-base> <tenant>
 *
 * Reads FYD_SITE_OVERLAY events for <tenant> from the (Postgres-backed)
 * journal gateway over HTTP, maps them to FydJournalOverlay[] EXACTLY the
 * way PingObjectReader.parseOverlayList does (event_data payload, siteId
 * defense-in-depth filter, (timestamp, eventId) sort), then folds them
 * through the EXISTING overlay reducer (applyTenantOverlays from
 * src/fyd/data/fyd-tenant-graph.ts) over an empty base graph.
 *
 * Prints one JSON verdict line on stdout; exits 0 only when every
 * assertion holds. Anything else is a loud failure.
 */
import { applyTenantOverlays } from "@/fyd/data/fyd-tenant-graph";
import type { FydJournalOverlay } from "@/lib/ping/ping-object-reader";
import type { ObjectGraph } from "@/fyd/sitespec/types";

const [base, tenant] = process.argv.slice(2);
if (!base || !tenant) {
  console.error("usage: pg-replay-proof.mts <gateway-base> <tenant>");
  process.exit(2);
}

function fail(why: string, extra: unknown = null): never {
  console.log(JSON.stringify({ ok: false, why, extra }));
  process.exit(1);
}

const res = await fetch(
  `${base}/events/FYD_SITE_OVERLAY?tenant=${encodeURIComponent(tenant)}&limit=1000`,
);
if (!res.ok) fail("gateway read failed", { status: res.status });
const doc = (await res.json()) as { events?: unknown[] };
const list = Array.isArray(doc.events) ? doc.events : [];
if (list.length === 0) fail("no events read back for tenant", { tenant });

// Mirror of PingObjectReader.parseOverlayList (the production mapping).
const overlays: FydJournalOverlay[] = [];
for (const raw of list) {
  const ev = raw as Record<string, unknown>;
  const p = (ev["event_data"] ?? {}) as Record<string, unknown>;
  if (typeof p["siteId"] !== "string" || p["siteId"] !== tenant) continue; // defense in depth
  const ops = p["ops"];
  if (!Array.isArray(ops)) fail("ops is not a list", { event_id: ev["event_id"] });
  const eventId = ev["event_id"];
  if (typeof eventId !== "string" || !eventId) continue;
  overlays.push({
    eventId,
    timestamp: typeof ev["timestamp"] === "string" ? (ev["timestamp"] as string) : "",
    ops: ops as unknown[],
  });
}
overlays.sort((a, b) =>
  a.timestamp === b.timestamp
    ? (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)
    : a.timestamp < b.timestamp
      ? -1
      : 1,
);
if (overlays.length !== list.length) fail("overlay mapping dropped events");

// Fold through the EXISTING reducer. No reimplementation, no copy.
const graph = { objects: [], relationships: [] } as unknown as ObjectGraph;
let result;
try {
  result = applyTenantOverlays(graph, overlays);
} catch (e) {
  fail("applyTenantOverlays threw", { message: (e as Error).message });
}

const obj = graph.objects.find((o) => (o as { id?: string }).id === "replay-obj-1") as
  | { title?: string; provenance?: { ref?: string; updatedRefs?: string[] } }
  | undefined;
if (!obj) fail("replay-obj-1 missing after replay");
if (obj.title !== "second") fail("order-dependent reducer did not apply last-wins", { title: obj.title });

// Provenance: add_object stamps provenance.ref; set_field/deactivate_object
// append ping-event:<id> to provenance.updatedRefs via touch().
const evidence = [obj.provenance?.ref, ...(obj.provenance?.updatedRefs ?? [])].filter(
  (r): r is string => typeof r === "string",
);
const expectedRefs = overlays.map((o) => `ping-event:${o.eventId}`);
const missing = expectedRefs.filter((r) => !evidence.includes(r));
if (missing.length > 0) fail("provenance evidence missing", { missing, evidence });

console.log(
  JSON.stringify({
    ok: true,
    objectCount: graph.objects.length,
    title: obj.title,
    provenanceEvidence: evidence,
    eventIds: result!.eventIds,
  }),
);
