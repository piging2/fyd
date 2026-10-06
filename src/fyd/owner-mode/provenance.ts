/**
 * LANE-OWNER: owner provenance.
 *
 * Every owner assertion, visibility decision, and proposal approval carries
 * the same provenance shape: who asserted it (an explicit label, never a
 * verified identity in demo mode), when, and what it supersedes.
 *
 * The supersedes chain is how corrections survive regeneration honestly:
 * a newer assertion names the assertionId it replaces; apply logic only
 * ever applies chain heads, so an old correction can neither silently win
 * nor silently lose against a newer one.
 *
 * Pure, deterministic, browser-safe.
 */

import { sha256Hex } from "../proceduralize/sha256";

/**
 * Who said it, when, and what it replaces. In DEMO OWNER MODE the owner
 * label is DEMO_OWNER_LABEL: an explicit non-identity. The production
 * identity seam (./owner-identity.ts) binds a verified label here later;
 * the shape does not change.
 */
export interface OwnerProvenance {
  owner: string;
  /** ISO 8601. */
  assertedAt: string;
  /** assertionId this replaces, or null for a first assertion. */
  supersedes: string | null;
}

/** The demo actor label. Explicitly not a verified identity. */
export const DEMO_OWNER_LABEL = "demo-owner (seeded, unverified)";

/** Build demo provenance. The clock is injectable for deterministic tests. */
export function demoProvenance(
  supersedes: string | null = null,
  nowIso: () => string = () => new Date().toISOString(),
): OwnerProvenance {
  return {
    owner: DEMO_OWNER_LABEL,
    assertedAt: nowIso(),
    supersedes,
  };
}

/**
 * Deterministic JSON: object keys sorted recursively, arrays in order.
 * Used for content-derived ids and digests. Volatile keys are NOT stripped
 * here; callers decide what goes into the canonical form.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return (
      "{" +
      keys
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonicalJson((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value) ?? "null";
}

/** Deterministic short id: prefix + first 16 hex of sha256(canonical). */
export function shortId(prefix: string, canonical: string): string {
  return prefix + sha256Hex(canonical).slice(0, 16);
}
