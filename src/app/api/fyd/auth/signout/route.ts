/**
 * POST /api/fyd/auth/signout (GET also accepted for link navigation)
 * Clear the session cookie and audit the sign-out. The identity and its
 * provider bindings are untouched: the next sign-in resolves to the same
 * identity.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadAuthConfig } from "@/fyd/identity/config";
import { clearSessionCookie, parseCookies, readSessionValue, SESSION_COOKIE_NAME } from "@/fyd/identity/session";
import { appendAuthAudit } from "@/fyd/identity/audit";

async function signOut(request: NextRequest) {
  const config = loadAuthConfig();
  const res = NextResponse.redirect(new URL("/", request.url));
  res.headers.append("Set-Cookie", clearSessionCookie(config.session));
  if (config.session.configured) {
    const cookies = parseCookies(request.headers.get("cookie"));
    const session = readSessionValue(cookies[SESSION_COOKIE_NAME], config.session.secret);
    if (session) {
      appendAuthAudit("sign_out", { identityId: session.identityId });
    }
  }
  return res;
}

export async function POST(request: NextRequest) {
  return signOut(request);
}

export async function GET(request: NextRequest) {
  return signOut(request);
}
