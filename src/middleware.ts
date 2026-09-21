/**
 * Minimal middleware: expose the request pathname to server components.
 *
 * The root layout reads `x-pathname` to decide whether to render the PING
 * marketing chrome. Object routes (/o/*) belong visually to the object, so
 * they render without the PING header and footer.
 */

import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand|fyd-media).*)"],
};
