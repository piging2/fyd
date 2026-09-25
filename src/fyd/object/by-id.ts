/**
 * FYD per-object projection loaders (server-only).
 *
 * loadObjectViewById / loadCircleProjectionById resolve ANY object id in a
 * tenant's VERIFIED public projection, not just the owner business.
 * Honesty gates (fail closed, no fixture fallback, no invented data):
 * - unknown tenant (null projection) -> null
 * - unknown object id -> null
 * - non-public object -> null (private objects are never servable)
 *
 * The projection is supplied by the caller, resolved through
 * getVerifiedPublicProjectionSync (Q-C-01). These loaders never touch the
 * raw read seam: there is no path that serves an unprojected object.
 *
 * Tenant isolation: siteId selects the projection; objects never cross
 * tenants. Both loaders compose the same shared core as the slug-keyed
 * business loaders (composeObjectView in ./view), keyed by PING object id
 * for the view id and the owner store. The slug-keyed loaders
 * (loadObjectView / loadCircleProjection) take the same branded projection.
 */

import type { VerifiedPublicProjection } from "../sitespec/public-projection";
import type { CircleProjection, ObjectView } from "./types";
import { composeObjectView, listObjectIds, loadObjectView } from "./view";
import { objectViewToCircleProjection } from "./circle-adapter";

/**
 * Load the public ObjectView for one object id in a tenant's verified
 * projection. Returns null for unknown object ids and non-public objects
 * (the route turns this into a 404). Throws only on programmer error,
 * never on missing data.
 */
export function loadObjectViewById(
  projection: VerifiedPublicProjection | null,
  siteId: string,
  objectId: string,
): ObjectView | null {
  if (!projection) return null;
  const obj = projection.graph.objects.find((o) => o.id === objectId);
  if (!obj) return null;
  if (obj.visibility !== "public") return null;
  return composeObjectView(projection, siteId, obj.id, obj.id, obj.id);
}

/**
 * Load the FYD circle projection for one object id in a tenant's verified
 * projection. Same honesty contract as loadObjectViewById.
 */
export function loadCircleProjectionById(
  projection: VerifiedPublicProjection | null,
  siteId: string,
  objectId: string,
): CircleProjection | null {
  const view = loadObjectViewById(projection, siteId, objectId);
  if (!view) return null;
  return objectViewToCircleProjection(view);
}

/**
 * Resolve a public ObjectView by site slug OR by any public PING object id
 * in any tenant. The slug path runs first (legacy behavior for /o/<slug>
 * and the Manage surface, which pass the site slug); then a by-id scan
 * across every tenant's verified projection. Fail-closed: null when the id
 * is unknown in every tenant. No object ever crosses tenants: the returned
 * siteId is the tenant that actually holds the object.
 *
 * resolveProjection maps a tenant id to its verified public projection
 * (null for unknown tenants); the caller owns the read seam.
 */
export function loadObjectViewBySlugOrId(
  objectId: string,
  resolveProjection: (siteId: string) => VerifiedPublicProjection | null,
): { view: ObjectView; siteId: string } | null {
  const slugProjection = resolveProjection(objectId);
  if (slugProjection) {
    const slugView = loadObjectView(slugProjection, objectId);
    if (slugView) return { view: slugView, siteId: objectId };
  }
  for (const siteId of listObjectIds()) {
    const projection = resolveProjection(siteId);
    if (!projection) continue;
    const v = loadObjectViewById(projection, siteId, objectId);
    if (v) return { view: v, siteId };
  }
  return null;
}

