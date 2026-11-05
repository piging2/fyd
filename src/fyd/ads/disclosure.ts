/**
 * The pinned opt-in disclosure copy for the FYD objects economic loop
 * (DESIGN.md, BOOTSTRAP-SURGE-OBJECTS-LOOP-DESIGN-20261104).
 *
 * A consent record pins the VERSION of this copy the publisher accepted.
 * The inventory store fails closed on a grant naming any other version:
 * consent to different words is not this consent. Changing the words
 * requires a new version constant and re-consent; never edit the text
 * under an existing version.
 */

export const DISCLOSURE_TEXT_VERSION = "loop-disclosure-v1" as const;

export const DISCLOSURE_TEXT =
  "Sponsored placements may appear in the placement slots you declare on " +
  "your surfaces. Every placement is labeled \"Sponsored\". Impressions " +
  "and clicks on placements are recorded in the FYD event ledger. You " +
  "may revoke this consent at any time; revocation stops delivery " +
  "immediately.";
