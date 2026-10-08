/**
 * Site-identity lookup for the dynamic /sites/[siteId] route. SERVER ONLY.
 *
 * INVARIANT (2026-10-08, kims-auto-parts 500): the dynamic route serves
 * exactly the site ids the bundle seam can serve (listSiteIds). Any other
 * slug is an honest 404, never a 500.
 *
 * The fail-closed throw inside compilePublicSite is preserved for the
 * pinned-but-broken case (tampered base, digest mismatch): "this site
 * exists but its business information cannot be verified" stays a 500
 * behind the route error boundary. "This site does not exist" is a 404.
 */
import { listSiteIds } from "@/fyd/media/site-bundle";

/** True when the dynamic site route can serve this id (404 otherwise). */
export function isServableSiteId(siteId: string): boolean {
  return listSiteIds().includes(siteId);
}
