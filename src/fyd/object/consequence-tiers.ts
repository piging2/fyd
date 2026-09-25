/**
 * TRACK B (2026-09-25, FYD product authority directive, Nolan): consequence
 * tiers for owner actions, in Nolan's three-tier product language.
 *
 * - LOW: reorder, generated headline, spacing, owner-approved image.
 *   Apply plus undo. Presentation-only, reversible, no public fact altered.
 * - MEDIUM: public factual presentation, hide/show address, CTA.
 *   Explicit owner confirmation required (the propose -> digest-bound
 *   approve loop, with an owner assertion recorded and the source record
 *   never rewritten).
 * - HIGH: external publish, communication, spend, provider relationship,
 *   mass action. Explicit capability PLUS approval. Demo mode cannot
 *   authorize these: the demo authority (see ../owner-mode/capability.ts)
 *   is deny-by-default and the demo toggle has no path to external
 *   consequential actions (see ../owner-mode/__tests__).
 *
 * RELATIONSHIP TO THE FOUR-TIER SCALE: the object owner store historically
 * classifies OwnerCommand on a four-tier scale
 * (LOW / MEDIUM / HIGH / CRITICAL, see ./commands.ts commandConsequenceTier).
 * CRITICAL is the irreversible subset of HIGH; in the product-directive
 * mapping both fold into HIGH: both classes demand explicit capability
 * plus approval, and both are refused at propose in any context that
 * cannot satisfy that bar. No owner command type writes to an external
 * provider, moves money, sends a message, or is otherwise irreversible,
 * so no OwnerCommand is ever classified HIGH here; HIGH lives in the
 * capability/effect seam.
 */

/** Nolan's three-tier product consequence scale. */
export type ProductConsequenceTier = "LOW" | "MEDIUM" | "HIGH";

/**
 * Fold the legacy four-tier label into the three-tier product scale.
 * CRITICAL is the irreversible subset of HIGH; both demand explicit
 * capability plus approval.
 */
export function foldLegacyTier(
  tier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
): ProductConsequenceTier {
  return tier === "HIGH" || tier === "CRITICAL" ? "HIGH" : tier;
}

/**
 * The HIGH-class categories from the product directive. None of these can
 * be reached through the owner command lane or the customize overlay
 * lane; they require explicit capability plus approval through the
 * external-effect seams, which demo mode cannot satisfy.
 */
export const HIGH_CLASS_CATEGORIES = [
  "external publish",
  "communication",
  "spend",
  "provider relationship",
  "mass action",
] as const;

export type HighClassCategory = (typeof HIGH_CLASS_CATEGORIES)[number];

/**
 * LOW-class owner actions (reorder, generated headline, spacing,
 * owner-approved image): apply plus undo, presentation-only.
 */
export const LOW_CLASS_DESCRIPTION =
  "LOW: reorder, generated headline, spacing, owner-approved image. Apply plus undo.";

/**
 * MEDIUM-class owner actions (public factual presentation, hide/show
 * address, CTA): explicit confirmation required.
 */
export const MEDIUM_CLASS_DESCRIPTION =
  "MEDIUM: public factual presentation, hide/show address, CTA. Explicit confirmation required.";
