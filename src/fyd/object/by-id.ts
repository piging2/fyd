/**
 * FYD per-object projection loaders (server-only).
 *
 * loadObjectViewById / loadCircleProjectionById resolve ANY object id in a
 * tenant's PING-backed graph, not just the owner business. Honesty gates
 * (fail closed, no fixture fallback, no invented data):
 * - unknown tenant (no projection) -> null
 * - unknown object id -> null
 * - non-public object -> null (private objects are never servable)
 *
 * Tenant isolation: siteId selects the projection; objects never cross
 * tenants. Both loaders compose the same shared core as the slug-keyed
 * business loaders (composeObjectView in ./view), keyed by PING object id
 * for the view id and the owner store. The slug-keyed loaders
 * (loadObjectView / loadCircleProjection) are unchanged.
 */

import { getPingObjectGraphSync } from "@/fyd/data/ping-object-source";
import type { ObjectGraph } from "../sitespec/types";
import type { CircleProjection, ObjectView } from "./types";
import { composeObjectView, listObjectIds, loadObjectView } from "./view";
import { objectViewToCircleProjection } from "./circle-adapter";

/**
 * Load the public ObjectView for one object id in a tenant's graph.
 * Returns null for unknown tenants, unknown object ids, and non-public
 * objects (the route turns this into a 404). Throws only on programmer
 * error, never on missing data.
 */
export function loadObjectViewById(siteId: string, objectId: string): ObjectView | null {
  let graph: ObjectGraph;
  try {
    graph = getPingObjectGraphSync(siteId).graph;
  } catch {
    return null;
  }
  const obj = graph.objects.find((o) => o.id === objectId);
  if (!obj) return null;
  if (obj.visibility !== "public") return null;
  return composeObjectView(graph, siteId, obj, obj.id, obj.id);
}

/**
 * Load the FYD circle projection for one object id in a tenant's graph.
 * Same honesty contract as loadObjectViewById.
 */
export function loadCircleProjectionById(
  siteId: string,
  objectId: string,
): CircleProjection | null {
  const view = loadObjectViewById(siteId, objectId);
  if (!view) return null;
  return objectViewToCircleProjection(view);
}

/**
 * Resolve a public ObjectView by site slug OR by any public PING object id
 * in any tenant. The slug path runs first (legacy behavior for /o/<slug>
 * and the Manage surface, which pass the site slug); then a by-id scan
 * across every tenant's graph. Fail-closed: null when the id is unknown
 * in every tenant. No object ever crosses tenants: the returned siteId is
 * the tenant that actually holds the object.
 */
export function loadObjectViewBySlugOrId(
  objectId: string,
): { view: ObjectView; siteId: string } | null {
  const slugView = loadObjectView(objectId);
  if (slugView) return { view: slugView, siteId: objectId };
  for (const siteId of listObjectIds()) {
    const v = loadObjectViewById(siteId, objectId);
    if (v) return { view: v, siteId };
  }
  return null;
}
