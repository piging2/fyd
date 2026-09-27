/**
 * Visitor-safe field allowlist for Ask FYD's model-context projection
 * (FYD-010).
 *
 * This is the Ask FYD product-surface boundary: the exact fields the model
 * may receive about a visitor-visible object. The list is intentionally
 * narrow and fail-closed: unknown field names are dropped rather than
 * passed through, so a new extractor field (or a private canary stored
 * under an unexpected name) cannot reach the model by default.
 *
 * Deliberately included: the exact field names the Ask FYD pipeline reads
 *   (contact, hours, services, reviews, location, and pipeline signals
 *   such as claimKind), plus the public identity/discovery fields the
 *   public site already shows. See VISITOR_SAFE_FIELDS for the derivation
 *   rule.
 *
 * Deliberately excluded:
 * - home_address (a private address is never visitor-safe; the public
 *   coarse `address` field covers the legitimate use),
 * - _internal_notes and any other underscore/private field,
 * - every field name not on the list.
 *
 * This allowlist is the floor, not the ceiling: owner visibility decisions
 * (hide/coarse) are applied BEFORE it in context-projection.ts, so an
 * owner HIDE on an allowlisted field (e.g. phone) still removes it.
 *
 * Pure, deterministic, no I/O.
 */

import type { PingObject } from "../../lib/ping/types";

/**
 * Field names the Ask FYD model may receive for a visitor-visible object.
 *
 * DERIVATION RULE (do not expand casually): this is the exact set of field
 * names the Ask FYD pipeline reads, derived from the fieldOf/fields reads
 * in src/lib/ping/ask-composer.ts, src/fyd/ask/answer.ts, and
 * src/fyd/ask/visitor-answer.ts, plus the public identity/contact/
 * discovery fields the public site already shows. If the pipeline starts
 * reading a new field, add its name here with a comment naming the reader;
 * otherwise the pipeline silently stops seeing it (the test suite,
 * including the DERIVED claim-class tests, guards this).
 *
 * Everything else is dropped from the model context for every viewer
 * class. In particular: home_address (a private address is never
 * visitor-safe; the public coarse `address` field covers the legitimate
 * use), _internal_notes and any other underscore/private field, and every
 * field name not on this list.
 */
const VISITOR_SAFE_FIELDS: ReadonlySet<string> = new Set([
  // Identity / public copy.
  "title",
  "description",
  "bio",
  "summary",
  "category",
  "businessCategory",
  // Contact / discovery (read by the contact branch).
  "website",
  "url",
  "domain",
  "phone",
  "email",
  "social",
  // Location, coarse by the visibility layer before this allowlist.
  "address",
  "location",
  "city",
  "locality",
  "region",
  "postal_code",
  "country",
  "service_area",
  // Hours (read by the hours branch).
  "hours",
  "businessHours",
  "openingHours",
  // Services and offering details (read by the services branch).
  "services",
  "price",
  "pricing",
  "price_range",
  "cost",
  "rates",
  "rate",
  "estimate",
  "quote",
  "amenities",
  // Reputation (read by the reviews branch).
  "rating",
  "review",
  "reviews",
  "review_count",
  "testimonial",
  // Pipeline signals (read by the composer, not shown verbatim).
  "claimKind",
  "verified",
  "followerCount",
  "followers",
  // Tenure.
  "established",
]);

/** True when a field name may appear in the Ask FYD model context. */
export function isVisitorSafeField(fieldName: string): boolean {
  return VISITOR_SAFE_FIELDS.has(fieldName);
}

/**
 * Return a copy of the object with only visitor-safe fields.
 * The input object is never mutated. When every field is already safe the
 * original object is returned unchanged (fast path).
 */
export function visitorSafeObject<T extends PingObject>(obj: T): T {
  const fields = obj.fields ?? {};
  const entries = Object.entries(fields);
  let allSafe = true;
  for (const [name] of entries) {
    if (!isVisitorSafeField(name)) {
      allSafe = false;
      break;
    }
  }
  if (allSafe) return obj;
  const safe: Record<string, string | string[]> = {};
  for (const [name, value] of entries) {
    if (isVisitorSafeField(name)) safe[name] = value;
  }
  return { ...obj, fields: safe };
}
