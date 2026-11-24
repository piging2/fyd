/**
 * R10 (TenantOS research segment B, 2026-11-23): GET /api/mc/queue
 * was tenant-bearing, cross-tenant, and unscoped at source: it took
 * no caller at all and returned the full mixed-tenant mission queue
 * with tenant attribution. The repair scopes the surface in the
 * read-authorization arc's form, and the convergence ruling of
 * 2026-11-24 settles its operator posture: a caller with no key
 * and no asserted tenant is the operator and is served the full
 * queue (the arc's governing form for this surface); an asserted
 * tenant without a key is refused 401 caller_key_required before
 * the journal leg; a credentialed caller receives only rows
 * inside its credential-derived scope.
 *
 * The journal adapter is mocked so the legs measure the route's
 * authorization behavior, not the substrate's reachability. The
 * authenticated scoping itself measures in T3's local battery
 * against a readable journal (acceptance form of record).
 */
jest.mock("../_lib/mc-ping-journal", () => ({
  PING_JOURNAL_SOURCE: "mock-substrate",
  listPingQueueMissions: async () => [
    {
      mission_id: "m-happy-1",
      mission_type: "demo",
      status: "created",
      tenant_id: "happy-place",
      created_by: "fixture",
      created_at: "2026-11-23T00:00:00Z",
      started_at: null,
      completed_at: null,
      assigned_to: null,
      retries: 0,
      hold_at: null,
      lease_until: null,
      claimed_at: null,
      retry_at: null,
      hold_reason: null,
      priority: 1,
      event_count: 1,
      lifecycle_event_count: 1,
    },
    {
      mission_id: "m-foreign-1",
      mission_type: "demo",
      status: "created",
      tenant_id: "tenant-b",
      created_by: "fixture",
      created_at: "2026-11-23T00:00:00Z",
      started_at: null,
      completed_at: null,
      assigned_to: null,
      retries: 0,
      hold_at: null,
      lease_until: null,
      claimed_at: null,
      retry_at: null,
      hold_reason: null,
      priority: 1,
      event_count: 1,
      lifecycle_event_count: 1,
    },
  ],
}));

import { GET as queueGET } from "../queue/route";

describe("R10: /api/mc/queue read scope (converged form)", () => {
  it("an anonymous caller is served the operator view (convergence ruling, 2026-11-24)", async () => {
    const res = await queueGET(new Request("http://localhost/api/mc/queue"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.missions)).toBe(true);
    expect(body.missions).toHaveLength(2);
    expect(body.scope).toBeDefined();
  });

  it("an asserted tenant header without a key is refused caller_key_required", async () => {
    const res = await queueGET(
      new Request("http://localhost/api/mc/queue", { headers: { "x-mc-tenant": "happy-place" } }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("caller_key_required");
  });

  it("an unknown caller key is refused 401, never served", async () => {
    const res = await queueGET(
      new Request("http://localhost/api/mc/queue", { headers: { "x-mc-caller-key": "bogus-key" } }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.missions).toBeUndefined();
  });
});