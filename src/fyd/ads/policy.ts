/**
 * BudgetPolicy v1 for the FYD objects economic loop
 * (DESIGN.md, BOOTSTRAP-SURGE-OBJECTS-LOOP-DESIGN-20261104).
 *
 * Policy is CODE, not data, in v1: this module is the versioned constants
 * authority. The budget is a count cap, never money: no prices, no
 * billing, and no spend fields exist anywhere in the loop. Budget STATE
 * is derived from counted ledger rows only (event ledger, lane B2); this
 * module carries only the constants the matching provider (lane B3)
 * feeds into the rank contract's SponsoredPlacementPolicy shape.
 */

import type { SponsoredPlacementPolicy } from "../rank/sponsored-placement";

/** Policy version, embedded in every budget scope ref. */
export const ADS_POLICY_VERSION = "loop-v1" as const;

/** Max sponsored placements in any single composition. */
export const MAX_SPONSORED_PLACEMENTS = 1;

/** Sponsored share cap, applied to actual composition capacity (0..1). */
export const MAX_SPONSORED_SHARE = 0.25;

/** Organic placements required between sponsored placements. */
export const MIN_ORGANIC_BETWEEN_SPONSORED = 2;

/**
 * The ranker's relevance floor input. The rank contract requires a
 * semantic target to be present and scores proximity 0..1; v1 keeps the
 * floor at 0, so presence of a semantic target is the requirement (per
 * the rank README). No stricter numeric floor is invented here.
 */
export const MINIMUM_RELEVANCE = 0;

/** Frequency cap: impressions of one object per viewer scope per window. */
export const MAX_OBJECT_IMPRESSIONS_PER_WINDOW = 3;

/** Frequency window: 24 hours in milliseconds. */
export const FREQUENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Per campaign per UTC day counted-impression cap (a count, not money). */
export const DAILY_IMPRESSIONS_CAP = 500;

/** Per campaign per UTC day counted-click cap (a count, not money). */
export const DAILY_CLICKS_CAP = 100;

/** Budget accounting window: one UTC day in milliseconds. */
export const BUDGET_WINDOW_MS = FREQUENCY_WINDOW_MS;

/**
 * Freshness bound for authority and exposure snapshots. Snapshots are
 * constructed per request from live projections, so freshness is
 * structural rather than cached; the rank contract still requires a
 * positive bound, set here to the frequency window.
 */
export const SNAPSHOT_MAX_AGE_MS = FREQUENCY_WINDOW_MS;

/** The rank contract's policy shape, built from the v1 constants. */
export function sponsoredPlacementPolicy(): SponsoredPlacementPolicy {
  return {
    minimumRelevance: MINIMUM_RELEVANCE,
    maxSponsoredPlacements: MAX_SPONSORED_PLACEMENTS,
    maxSponsoredShare: MAX_SPONSORED_SHARE,
    minOrganicBetweenSponsored: MIN_ORGANIC_BETWEEN_SPONSORED,
    maxObjectImpressionsPerWindow: MAX_OBJECT_IMPRESSIONS_PER_WINDOW,
    frequencyWindowMs: FREQUENCY_WINDOW_MS,
    snapshotMaxAgeMs: SNAPSHOT_MAX_AGE_MS,
  };
}

/** UTC day key (yyyymmdd) for a Date or epoch-ms timestamp. */
export function utcDayKey(when: Date | number): string {
  const d = typeof when === "number" ? new Date(when) : when;
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return y + m + day;
}

/**
 * Budget scope ref for a campaign on one UTC day, in the design's
 * format: "loop-v1:<campaignId>:<yyyymmdd>". The scope is a reference
 * only; the counted rows behind it live in the event ledger.
 */
export function budgetScopeRef(campaignId: string, when: Date | number): string {
  return ADS_POLICY_VERSION + ":" + campaignId + ":" + utcDayKey(when);
}

/**
 * Ledger abuse-control constants (DESIGN.md, abuse controls v1; the
 * event ledger, lane B2, is the consumer). Like the budget above,
 * these are policy as code: versioned, named, and never read from
 * request data. Every check built on them is exclusion-only: it can
 * keep a row out of counts, never put a questionable row in.
 */

/** Rate-limit accounting window for ledger ingest: one minute. */
export const LEDGER_RATE_WINDOW_MS = 60 * 1000;

/** Max drafts per viewer scope per rate window before RATE_LIMITED. */
export const LEDGER_MAX_DRAFTS_PER_VIEWER_PER_WINDOW = 60;

/** Max drafts per slot per rate window before RATE_LIMITED. */
export const LEDGER_MAX_DRAFTS_PER_SLOT_PER_WINDOW = 300;

/**
 * How long after a placement decision an event's occurredAt may lag
 * and still be covered by that decision. Impressions legitimately lag
 * renders inside a page session; unbounded lag does not. The matching
 * provider (lane B3) records decisions per composition; the ledger
 * refuses sponsored events no eligible decision covers.
 */
export const LEDGER_DECISION_COVERAGE_MS = 30 * 60 * 1000;

/** Version of the known-bot user-agent substring list below. */
export const KNOWN_BOT_UA_LIST_VERSION = "loop-bots-v1" as const;

/**
 * Known-bot user-agent substrings (loop-bots-v1), matched
 * case-insensitively. Deliberately broad in the exclusion direction
 * only. Ordinary browser user agents (Mozilla, AppleWebKit, Chrome,
 * Safari, Firefox, Edge) contain none of these substrings.
 */
export const KNOWN_BOT_UA_SUBSTRINGS: readonly string[] = [
  "bot",
  "crawl",
  "spider",
  "slurp",
  "curl",
  "wget",
  "headless",
  "python-requests",
  "python-urllib",
  "axios",
  "node-fetch",
  "go-http-client",
  "java/",
  "pingdom",
  "uptimerobot",
  "statuscake",
];

/**
 * Loop activation constants (DESIGN.md actors and component D; lane
 * B4, render wiring). The whole sponsored path sits behind ONE enable
 * flag that defaults OFF: with it off, the render seam never invokes
 * the matching provider, no collector is mounted, no sponsored
 * markup renders, and the events route does not record. Policy is
 * code in v1, so the flag name and the loop's one participating
 * tenant/surface pair are constants here, never request data.
 */

/** Env var gating the entire sponsored path. Default OFF. */
export const ADS_LOOP_ENABLED_ENV_VAR = "FYD_ADS_LOOP_ENABLED" as const;

/**
 * True only when the loop is explicitly enabled ("1" or "true",
 * case-insensitive). Every other value, including unset, is OFF.
 * Read from the server environment at request time; never persisted
 * by any loop code.
 */
export function isAdsLoopEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const raw = env[ADS_LOOP_ENABLED_ENV_VAR];
  if (typeof raw !== "string") return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true";
}

/**
 * The one participating publisher tenant in v1: the controlled demo
 * tenant we own end to end (DESIGN.md actors). The render seam
 * refuses to evaluate any other tenant even with the flag on, so the
 * loop cannot leak onto a real tenant surface.
 */
export const LOOP_PUBLISHER_TENANT_ID = "loop-demo" as const;

/** The one participating surface in v1: the loop-demo surface. */
export const LOOP_SURFACE = "loop-demo" as const;

/**
 * Max request body bytes the events route will parse. Event drafts
 * are small fixed-shape objects; anything larger is not a draft.
 */
export const ADS_EVENTS_MAX_BODY_BYTES = 16 * 1024;
