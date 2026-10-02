/**
 * Pure helpers for the forward-trace journal fetch
 * (GET /api/mc/trace-forward).
 *
 * The journal gateway (localhost:18199) requires ?tenant=<tenant_id> on
 * /events/<stream>: a bare request 400s with tenant_required. These
 * functions build the per-tenant URLs and merge the per-tenant bodies into
 * one event list. No I/O in this module, so everything is unit-testable.
 */

export const JOURNAL_BASE = "http://localhost:18199";
export const OVERLAY_STREAM = "FYD_SITE_OVERLAY";

export type OverlayEvent = Record<string, unknown>;

/** URL for one tenant's slice of the overlay stream. */
export function overlayEventsUrl(tenantId: string, limit = 1000): string {
  return (
    `${JOURNAL_BASE}/events/${OVERLAY_STREAM}` +
    `?limit=${limit}&tenant=${encodeURIComponent(tenantId)}`
  );
}

/** URLs for every tenant slice. Empty tenant list -> empty URL list. */
export function overlayEventsUrls(tenantIds: string[], limit = 1000): string[] {
  return tenantIds.map((t) => overlayEventsUrl(t, limit));
}

/**
 * Normalize one gateway response body to an event list.
 * The gateway answers either a bare array or { events: [...] }.
 * Anything else -> empty list (never throws).
 */
export function normalizeOverlayEvents(body: unknown): OverlayEvent[] {
  if (Array.isArray(body)) return body as OverlayEvent[];
  if (body !== null && typeof body === "object") {
    const events = (body as { events?: unknown }).events;
    if (Array.isArray(events)) return events as OverlayEvent[];
  }
  return [];
}

/**
 * Merge per-tenant fetch results into one event list.
 * Each entry is either a parsed event list (success) or null (that
 * tenant's fetch failed). Returns null only when NO tenant succeeded,
 * which keeps the route's honest DEGRADED "journal gateway unreachable".
 */
export function mergeOverlayEvents(
  results: (OverlayEvent[] | null)[],
): OverlayEvent[] | null {
  const ok = results.filter((r): r is OverlayEvent[] => r !== null);
  if (ok.length === 0) return null;
  return ok.reduce<OverlayEvent[]>((acc, list) => acc.concat(list), []);
}
