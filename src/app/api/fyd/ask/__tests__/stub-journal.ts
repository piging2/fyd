/**
 * Stub FYD journal gateway for ask-lane tests.
 *
 * Serves GET /events/FYD_SITE_OVERLAY with canned overlay events shaped
 * like the real FYD demo journal records, so tests exercise the production
 * authorized read path (PingObjectReader.queryFydSiteOverlays over HTTP)
 * with no live gateway and no disk projection JSON.
 *
 * The canned happy-place ops mirror the 7 real overlay events from the FYD
 * demo journal: add_object (Pergola Design Consultations), add_relationship
 * (offers), three set_presentation_intent, one clear_presentation_intent,
 * then deactivate_object + set_field (tagline). Event ids are stub ids;
 * timestamps match the journal's.
 */

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

export interface StubOverlayEvent {
  id: string;
  ts: string;
  siteId: string;
  ops: unknown[];
}

function intentOp(
  intentId: string,
  digest: string,
): Record<string, unknown> {
  return {
    op: "set_presentation_intent",
    intentId,
    siteIntent: { kind: "reorder_sections", target: "services" },
    proposal: { proposalDigest: digest },
    approval: {
      proposalDigest: digest,
      approvedBy: "demo-owner (seeded, unverified)",
      approvedAt: "2026-09-19T18:36:12.105Z",
      note: "DEMO OWNER MODE - not real authentication",
    },
  };
}

export function happyPlaceOverlayEvents(): StubOverlayEvent[] {
  return [
    {
      id: "stub-ev-001",
      ts: "2026-09-19T18:30:59.221Z",
      siteId: "happy-place",
      ops: [
        {
          op: "add_object",
          object: {
            id: "website-service-51de038c1defe8bd",
            schema: "ping.social.service@1",
            controllerId: "identity_fyd_demo_operator",
            visibility: "public",
            title: "Pergola Design Consultations",
            description: "Complimentary consultations for custom pergola design",
            fields: {
              name: "Pergola Design Consultations",
              serviceType: "Consultation",
              availability: "Limited slots",
            },
            createdAt: "2026-09-19T18:30:59.221Z",
            updatedAt: "2026-09-19T18:30:59.221Z",
            provenance: {
              kind: "overlay-authored",
              ref: "demo-overlay:happy-place",
              derivedAt: "2026-09-19T18:30:59.221Z",
            },
          },
        },
      ],
    },
    {
      id: "stub-ev-002",
      ts: "2026-09-19T18:32:14.908Z",
      siteId: "happy-place",
      ops: [
        {
          op: "add_relationship",
          relationship: {
            id: "rel-demo-pergola-01",
            subject: "website-business-6fa5ebd99d72c4cb",
            predicate: "offers",
            object: "website-service-51de038c1defe8bd",
            status: "active",
            createdAt: "2026-09-19T18:32:14.908Z",
          },
        },
      ],
    },
    {
      id: "stub-ev-003",
      ts: "2026-09-19T18:36:12.105Z",
      siteId: "happy-place",
      ops: [intentOp("pi-stub-001", "stub-proposal-digest-001")],
    },
    {
      id: "stub-ev-004",
      ts: "2026-09-19T18:36:12.124Z",
      siteId: "happy-place",
      ops: [intentOp("pi-stub-002", "stub-proposal-digest-002")],
    },
    {
      id: "stub-ev-005",
      ts: "2026-09-19T18:36:12.136Z",
      siteId: "happy-place",
      ops: [intentOp("pi-stub-003", "stub-proposal-digest-003")],
    },
    {
      id: "stub-ev-006",
      ts: "2026-09-19T18:36:12.153Z",
      siteId: "happy-place",
      ops: [{ op: "clear_presentation_intent", intentId: "pi-stub-002" }],
    },
    {
      id: "stub-ev-007",
      ts: "2026-09-19T18:36:14.017Z",
      siteId: "happy-place",
      ops: [
        {
          op: "deactivate_object",
          objectId: "website-service-51de038c1defe8bd",
        },
        {
          op: "set_field",
          objectId: "website-business-6fa5ebd99d72c4cb",
          field: "tagline",
          value: "Built right. Built to last.",
        },
      ],
    },
    // Another tenant's overlay: must never leak into happy-place reads.
    { id: "stub-ev-008", ts: "2026-09-19T18:40:00.000Z", siteId: "site-a", ops: [] },
  ];
}

export interface StubJournal {
  url: string;
  close: () => Promise<void>;
}

/**
 * Boot the stub journal on 127.0.0.1 and point the governed reader at it
 * via FYD_JOURNAL_GATEWAY_URL for the duration of the test. Restores the
 * previous env value on close.
 */
export async function startStubJournal(
  events: StubOverlayEvent[] = happyPlaceOverlayEvents(),
): Promise<StubJournal> {
  const server: Server = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "GET" && req.url === "/events/FYD_SITE_OVERLAY") {
        // Faithful to the live gateway's GET /events/:stream: raw
        // ping_events rows ({ event_id, timestamp, event_data }).
        const body = JSON.stringify({
          events: events.map((e) => ({
            event_id: e.id,
            timestamp: e.ts,
            event_type: "FYD_SITE_OVERLAY",
            event_data: { siteId: e.siteId, ops: e.ops },
          })),
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(body);
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end("{}");
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  const previous = process.env.FYD_JOURNAL_GATEWAY_URL;
  process.env.FYD_JOURNAL_GATEWAY_URL = `http://127.0.0.1:${port}`;
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      if (previous === undefined) delete process.env.FYD_JOURNAL_GATEWAY_URL;
      else process.env.FYD_JOURNAL_GATEWAY_URL = previous;
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}
