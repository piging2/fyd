/**
 * Minimal middleware: expose the request pathname to server components.
 *
 * The root layout reads `x-pathname` to decide whether to render the PING
 * marketing chrome. Object routes (/o/*) belong visually to the object, so
 * they render without the PING header and footer.
 */

import { NextRequest, NextResponse } from "next/server";

// Tenant proof surfaces whose document response the edge may hold
// (W-25). The policy lives in middleware, not in next.config
// headers(), because the force-dynamic document response overrides
// the config rule (measured on production 2026-11-19: the surfaces
// served private, no-store and repeat reads missed the edge cache).
// Per-URL caching is safe for the same reason it is scoped per URL:
// the routes render per request because the root layout decides
// tenant chrome from the request pathname (VISUAL-4), and the cached
// copy was rendered under this URL's own request, chrome included.
const TENANT_EDGE_CACHE_PATHS = new Set([
  "/sites/happy-place",
  "/sites/coppersmith-plumbing",
]);
const TENANT_EDGE_CACHE_POLICY =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers } });
  if (TENANT_EDGE_CACHE_PATHS.has(request.nextUrl.pathname)) {
    response.headers.set("Cache-Control", TENANT_EDGE_CACHE_POLICY);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand|fyd-media).*)"],
};
