/**
 * Unit tests for the trace-forward journal helpers (overlay-events.ts).
 * Pure-function tests: no registry I/O, no network, no store.
 */
import {
  JOURNAL_BASE,
  mergeOverlayEvents,
  normalizeOverlayEvents,
  OVERLAY_STREAM,
  overlayEventsUrl,
  overlayEventsUrls,
  type OverlayEvent,
} from "../overlay-events";

describe("overlayEventsUrl", () => {
  test("targets the FYD_SITE_OVERLAY stream with limit and tenant", () => {
    expect(overlayEventsUrl("demo-owner")).toBe(
      `${JOURNAL_BASE}/events/${OVERLAY_STREAM}?limit=1000&tenant=demo-owner`,
    );
  });

  test("always carries ?tenant=<tenant_id> (the gateway 400s without it)", () => {
    const u = new URL(overlayEventsUrl("tenant-7"));
    expect(u.searchParams.get("tenant")).toBe("tenant-7");
    expect(u.searchParams.get("limit")).toBe("1000");
  });

  test("honors an explicit limit", () => {
    expect(new URL(overlayEventsUrl("t", 50)).searchParams.get("limit")).toBe(
      "50",
    );
  });

  test("encodes tenant ids that need encoding", () => {
    const u = new URL(overlayEventsUrl("tenant one/two"));
    expect(u.searchParams.get("tenant")).toBe("tenant one/two");
  });
});

describe("overlayEventsUrls", () => {
  test("builds one URL per tenant id, in order", () => {
    expect(overlayEventsUrls(["a", "b"])).toEqual([
      overlayEventsUrl("a"),
      overlayEventsUrl("b"),
    ]);
  });

  test("empty tenant list -> empty URL list", () => {
    expect(overlayEventsUrls([])).toEqual([]);
  });
});

describe("normalizeOverlayEvents", () => {
  const ev = { event_id: "e1" } as OverlayEvent;

  test("bare array body passes through", () => {
    expect(normalizeOverlayEvents([ev])).toEqual([ev]);
  });

  test("{ events: [...] } body is unwrapped", () => {
    expect(normalizeOverlayEvents({ events: [ev] })).toEqual([ev]);
  });

  test("missing or malformed body -> empty list, never throws", () => {
    expect(normalizeOverlayEvents({})).toEqual([]);
    expect(normalizeOverlayEvents({ events: "nope" })).toEqual([]);
    expect(normalizeOverlayEvents(null)).toEqual([]);
    expect(normalizeOverlayEvents("nope")).toEqual([]);
    expect(normalizeOverlayEvents(undefined)).toEqual([]);
  });
});

describe("mergeOverlayEvents", () => {
  const a = [{ event_id: "a" }] as OverlayEvent[];
  const b = [{ event_id: "b" }] as OverlayEvent[];

  test("merges per-tenant lists in order", () => {
    expect(mergeOverlayEvents([a, b])).toEqual([{ event_id: "a" }, { event_id: "b" }]);
  });

  test("a failed tenant (null) does not sink the others", () => {
    expect(mergeOverlayEvents([a, null, b])).toEqual([
      { event_id: "a" },
      { event_id: "b" },
    ]);
  });

  test("null only when NO tenant succeeded (honest DEGRADED)", () => {
    expect(mergeOverlayEvents([null, null])).toBeNull();
    expect(mergeOverlayEvents([])).toBeNull();
  });

  test("a single surviving tenant still yields its events", () => {
    expect(mergeOverlayEvents([null, a])).toEqual([{ event_id: "a" }]);
  });
});
