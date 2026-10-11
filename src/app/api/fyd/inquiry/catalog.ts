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
