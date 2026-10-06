/**
 * Site-compiler schema roles: leaf module (no imports).
 *
 * Moved verbatim from sitespec/schemas.ts (2026-09-23, lane E
 * schema<->component convergence): the component registry builds its
 * schema->component mapping from these roles, and keeping them in a
 * leaf module avoids a sitespec <-> components import cycle.
 * schemas.ts re-exports everything, so existing importers are
 * unchanged.
 */

// ---------------------------------------------------------------------------
// Schema roles: the site compiler reasons over roles, not single schema ids.
//
// The ping.social.* vocabulary above is the proof vocabulary: three
// definitions driving everything. The ping.knowledge.* vocabulary is the
// constitutional website-ingestion vocabulary (knowledge adapter, no new
// authority): knowledge objects project onto the same site-compiler roles.
// This mapping is a projection, not a second set of definitions; nothing
// here mints a schema, and the proof stays exactly Business, Service, Post.
// ---------------------------------------------------------------------------

export type FYDSchemaRole =
  | "business"
  | "service"
  | "product"
  | "location"
  | "person"
  | "post"
  | "article";

export const SCHEMA_ROLES: Record<FYDSchemaRole, string[]> = {
  business: ["ping.social.business@1", "ping.knowledge.business@1"],
  service: ["ping.social.service@1", "ping.knowledge.service@1"],
  product: ["ping.social.product@1"],
  location: ["ping.social.location@1", "ping.knowledge.location@1"],
  person: ["ping.social.person@1", "ping.knowledge.person@1"],
  // Content splits into short-form posts and long-form articles so the
  // generator can tell them apart through the role map instead of
  // hardcoded schema ids. The knowledge vocabulary projects onto both.
  post: ["ping.social.post@1", "ping.knowledge.post@1"],
  article: ["ping.social.article@1", "ping.knowledge.article@1"],
};

/** The site-compiler role a schema id plays, or null when it plays none. */
export function schemaRole(schemaId: string): FYDSchemaRole | null {
  const roles = Object.keys(SCHEMA_ROLES) as FYDSchemaRole[];
  for (const role of roles) {
    if (SCHEMA_ROLES[role].includes(schemaId)) return role;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Relationship vocabulary: the predicates that populate each site-compiler
// role, in canonical order. The vocabulary is direction-agnostic: a
// predicate may describe the edge from the owner outward (provides,
// offers, employs, located_at, publishes) or from a related object back to
// the owner (provided_by, works_for, member_of, has_employee,
// published_by). Composition matches EITHER endpoint against the owner
// (see ownerRelationshipTarget), so the role predicate set is the whole
// vocabulary and no consumer needs per-direction special cases. Forward
// predicates stay first in each list so predicates[0] keeps its existing
// meaning as the primary (canonical) predicate.
// ---------------------------------------------------------------------------

export const ROLE_PREDICATES: Record<FYDSchemaRole, string[]> = {
  business: [],
  service: ["provides", "offers", "provided_by"],
  product: ["provides", "offers", "provided_by"],
  location: ["located_at", "has_location"],
  person: ["employs", "has_member", "has_employee", "works_for", "member_of"],
  post: ["publishes", "published_by"],
  article: ["publishes", "published_by"],
};

/**
 * The id of the object on the other end of an owner-touching relationship,
 * regardless of edge direction: the related member is whichever endpoint
 * is not the owner. Returns null when the relationship is not active or
 * the owner is not an endpoint. Deterministic and total: never throws.
 */
export function ownerRelationshipTarget(
  rel: { subject: string; object: string; status: string },
  ownerId: string,
): string | null {
  if (rel.status !== "active") return null;
  if (rel.subject === ownerId) return rel.object;
  if (rel.object === ownerId) return rel.subject;
  return null;
}
