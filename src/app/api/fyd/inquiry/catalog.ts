/**
 * Published service catalog for the isolated quote-journey test tenant.
 *
 * SERVER-SIDE ONLY. This catalog IS the test site's published inquiry
 * capability: the intake refuses any quote against a service not listed
 * here. Never derived from client input. Test-plane only: not connected
 * to any real business.
 */

import type { KnownService } from "@/fyd/owner-mode/inquiry-intake";

export const QUOTE_JOURNEY_SITE_ID = "quote-journey-test";

export const QUOTE_JOURNEY_CATALOG: readonly KnownService[] = [
  { id: "svc-drain-cleaning", label: "Drain Cleaning" },
  { id: "svc-water-heater", label: "Water Heater Install & Repair" },
  { id: "svc-leak-repair", label: "Leak Detection & Repair" },
  { id: "svc-fixture-install", label: "Fixture Installation" },
];

/** Short blurbs for the test-plane service cards. Not customer facts. */
export const QUOTE_JOURNEY_BLURBS: Record<string, string> = {
  "svc-drain-cleaning": "Slow drains, clogs, and line clearing.",
  "svc-water-heater": "Tank and tankless install, repair, flush.",
  "svc-leak-repair": "Find it, stop it, fix it right.",
  "svc-fixture-install": "Faucets, toilets, and trim-outs.",
};

/**
 * Coppersmith Plumbing demo tenant catalog (2026-10-18, CEO directive
 * "Build products, not activity" P2: prove the complete Coppersmith
 * customer journey end to end on the isolated test plane).
 *
 * Labels are the four service titles in the tenant record of record:
 * the digest-pinned COPPERSMITH_GRAPH fixture
 * (src/fyd/proceduralize/__fixtures__/coppersmith-graph.ts, pinned in
 * FYD_TENANT_PINS in src/fyd/data/fyd-tenant-graph.ts), machine-generated
 * from a crawl of the tenant's own website. The previous nine labels
 * came from a superseded 2026-10-18 page presentation that the pinned
 * record does not support, so they were removed in the J2 alignment.
 * Coppersmith is a demo tenant (fictional 555 contact data); inquiries
 * admitted under this catalog land in the same isolated journal +
 * tenant-private store as the test tenant, never in the production
 * journal, and trigger no external sends. Synthetic test data only.
 */
export const COPPERSMITH_SITE_ID = "coppersmith-plumbing";

export const COPPERSMITH_CATALOG: readonly KnownService[] = [
  { id: "svc-plumbing", label: "Plumbing" },
  { id: "svc-heating-cooling", label: "Heating & Cooling" },
  { id: "svc-hvac", label: "HVAC" },
  { id: "svc-ventilation", label: "Ventilation" },
];

/**
 * PING Social catalog (2026-10-20, PING-WEBSITE-IMPROVE F9): PING's own
 * tenant site gets the inquiry path it was missing, mirroring the
 * Coppersmith pattern exactly. Service ids and labels are the four
 * service objects in the PING tenant record of record: the digest
 * pinned PING_FYD_GRAPH fixture
 * (src/fyd/proceduralize/__fixtures__/ping-fyd-graph.ts). Inquiries
 * admitted under this catalog land in the same isolated journal and
 * tenant-private store as the other admitted sites, with no external
 * sends.
 */
export const PING_FYD_SITE_ID = "ping-fyd";

export const PING_FYD_CATALOG: readonly KnownService[] = [
  { id: "ping-fyd-svc-calls", label: "AI call answering" },
  { id: "ping-fyd-svc-followup", label: "Lead follow-up" },
  { id: "ping-fyd-svc-scheduling", label: "Scheduling support" },
  { id: "ping-fyd-svc-admin", label: "Admin automation" },
];

const SITE_CATALOGS: Record<string, readonly KnownService[]> = {
  [QUOTE_JOURNEY_SITE_ID]: QUOTE_JOURNEY_CATALOG,
  [COPPERSMITH_SITE_ID]: COPPERSMITH_CATALOG,
  [PING_FYD_SITE_ID]: PING_FYD_CATALOG,
};

/**
 * The published catalog for one admitted site. Unknown sites get an
 * empty catalog (the intake then refuses every service), never another
 * tenant's services.
 */
export function catalogForSite(siteId: string): readonly KnownService[] {
  return SITE_CATALOGS[siteId] ?? [];
}
