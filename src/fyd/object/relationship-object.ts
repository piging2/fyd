import { listObjectIds } from "./view";
import { getVerifiedPublicProjectionSync } from "@/fyd/data/ping-object-source";
import { SCHEMA_ROLES } from "@/fyd/sitespec/schemas";
import type { VerifiedPublicProjection } from "@/fyd/sitespec/public-projection";

/** Same public business through a slug or canonical ID uses one relationship key. */
export function resolveRelationshipObjectId(
  requested: string,
  resolve: (siteId: string) => VerifiedPublicProjection | null = (siteId) => getVerifiedPublicProjectionSync(siteId, "anonymous"),
): string | null {
  const sites = listObjectIds();
  if (sites.includes(requested)) return requested;
  for (const siteId of sites) {
    try {
      const objects = resolve(siteId)?.graph.objects;
      const object = objects?.find((item) => item.id === requested && item.visibility === "public");
      if (!object) continue;
      // Match loadObjectView's tenant-root selection. A second business in the
      // same public graph has its own relationship identity, just like a service.
      const root = objects?.find((item) => item.visibility === "public" && SCHEMA_ROLES.business.includes(item.schema));
      return object.id === root?.id ? siteId : object.id;
    } catch { /* Missing/unavailable tenant never becomes a new identity. */ }
  }
  return null;
}
