/**
 * INV-12 / read-path leak closure — the three audit surfaces beyond the P0.
 *
 * The 2026-09-25 read-path audit found three leak surfaces beyond the
 * contained P0 (projection route, objects history):
 *
 *  1. GET /api/fyd/customize?siteId=<id>&view=inspect served owner
 *     presentation-intent state (directives, approvedBy, approvedAt,
 *     eventId, hidden-section flags) with NO gate, while the sibling
 *     POST actions already carried the demo-owner/private-host check.
 *     Fix: the same gate now guards the GET inspect view.
 *
 *  2. /dev/objects lab served the full graph including private objects
 *     over plain HTTP GET (obscurity-only: robots noindex, unlinked).
 *     summarizeObject exposes private objects; genericObjectView
 *     extracted phone/email/website/locality from ANY object and
 *     hardcoded addressVisibility to "public".
 *     Fix: the lab is gated behind the same private-host/demo-owner
 *     check (reversible; keeps the lab usable in dev).
 *
 *  3. Social feed fail-open default: (p.visibility || "public") ===
 *     "public" published journal posts with missing visibility.
 *     Fix: fail-closed — only visibility === "public" is served.
 *     (Media pipeline audited: FydMediaObject.visibility is a hardcoded
 *     "public" literal, ingest never reads the object graph, and the
 *     provenance API carries no depicted-object linkage — no change
 *     needed. See finding record in the mission report.)
 *
 * Laws: existing gates extended, no new authority created. Owner-side
 * state (presentation-intent directives, hidden-section decisions) is a
 * confidentiality class alongside object visibility.
 *
 * Run: npx jest --config src/fyd/invariants/jest.config.cjs inv-12-read-path-leaks
 */

import { GET as customizeInspectGet } from "../../../app/api/fyd/customize/route";
import { readFeed } from "../../social/readers";

const SITE = "happy-place";

// ---------------------------------------------------------------------------
// 1. customize inspect GET: owner-state gate
// ---------------------------------------------------------------------------

describe("surface 1: GET /api/fyd/customize?view=inspect is owner-gated", () => {
  test("public host -> 403, owner state absent", async () => {
    delete process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE;
    const res = await customizeInspectGet(
      new Request(`http://evil.example/api/fyd/customize?siteId=${SITE}&view=inspect`),
    );
    expect(res.status).toBe(403);
    const doc = (await res.json()) as Record<string, unknown>;
    expect(doc.ok).toBe(false);
    const body = JSON.stringify(doc);
    expect(body).not.toMatch(/approvedBy|directives|hidden|eventId/);
  });

  test("private host + demo-owner mode passes the gate (not 403)", async () => {
    process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE = "1";
    try {
      const res = await customizeInspectGet(
        new Request(`http://localhost/api/fyd/customize?siteId=${SITE}&view=inspect`, {
          // undici does not populate the Host header; the gate reads it.
          headers: { host: "localhost" },
        }),
      );
      // The gate passed if we reach the site lookup: 200 when the site
      // dump exists, 404 when it does not. Either proves the 403 is gone.
      expect([200, 404]).toContain(res.status);
    } finally {
      delete process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE;
    }
  });
});

// ---------------------------------------------------------------------------
// 3. social feed: fail-closed visibility
//    (surface 2, the /dev/objects lab page, is proven live: the page is a
//    React server component whose gate needs next/headers; the live
//    Host-header attack is the honest proof. See mission report.)
// ---------------------------------------------------------------------------

const realFetch = global.fetch;

function stubJournal(events: unknown[]) {
  (global as unknown as { fetch: unknown }).fetch = async (url: unknown) => {
    const u = String(url);
    const payload = u.includes("/events/OBJECT_CREATED") ? events : [];
    return {
      ok: true,
      status: 200,
      json: async () => ({ events: payload }),
    };
  };
}

afterEach(() => {
  global.fetch = realFetch;
});

function postEvent(
  objectId: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    event_id: "evt-" + objectId,
    event_type: "OBJECT_CREATED",
    source: "test",
    timestamp: "2026-09-25T00:00:00Z",
    created_at: "2026-09-25T00:00:00Z",
    sequence: 1,
    payload: { object_id: objectId, ...payload },
    metadata: {},
  };
}

describe("surface 3: social feed is fail-closed on visibility", () => {
  test("missing visibility is hidden, private is hidden, public is served", async () => {
    stubJournal([
      postEvent("obj-public", {
        schema: "ping.social.post@1",
        controller: "identity-x",
        visibility: "public",
        status: "active",
        content: { text: "SPEC_A public post" },
        created_at: "2026-09-25T01:00:00Z",
      }),
      // Malformed legacy event: no visibility field at all.
      postEvent("obj-malformed", {
        schema: "ping.social.post@1",
        controller: "identity-x",
        status: "active",
        content: { text: "SPEC_B malformed no-visibility post" },
        created_at: "2026-09-25T02:00:00Z",
      }),
      postEvent("obj-private", {
        schema: "ping.social.post@1",
        controller: "identity-x",
        visibility: "private",
        status: "active",
        content: { text: "SPEC_C private post" },
        created_at: "2026-09-25T03:00:00Z",
      }),
      postEvent("obj-tombstoned", {
        schema: "ping.social.post@1",
        controller: "identity-x",
        visibility: "public",
        status: "tombstoned",
        content: { text: "SPEC_D tombstoned post" },
        created_at: "2026-09-25T04:00:00Z",
      }),
    ]);
    const posts = await readFeed("identity-x");
    const texts = posts.map((p) => p.text);
    expect(texts).toEqual(["SPEC_A public post"]);
  });
});
