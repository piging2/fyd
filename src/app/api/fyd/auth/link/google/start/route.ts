/**
 * GET /api/fyd/auth/link/google/start
 * Begin linking a Google account to the currently authenticated identity.
 * Requires a valid session; the callback links to that same identity.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadAuthConfig } from "@/fyd/identity/config";
import { beginGoogleStart, AuthFlowError, notConfiguredMessage } from "@/fyd/identity/callback-flow";
import { parseCookies, readSessionValue, SESSION_COOKIE_NAME } from "@/fyd/identity/session";

export async function GET(request: NextRequest) {
  const config = loadAuthConfig();
  try {
    if (!config.session.configured) {
      throw new AuthFlowError("AUTH_NOT_CONFIGURED", notConfiguredMessage(config), 503);
    }
    const cookies = parseCookies(request.headers.get("cookie"));
    const session = readSessionValue(cookies[SESSION_COOKIE_NAME], config.session.secret);
    if (!session) {
      return NextResponse.json({ ok: false, code: "NOT_AUTHENTICATED" }, { status: 401 });
    }
    const { redirectUrl, stateCookie } = beginGoogleStart({ config }, { linkIdentityId: session.identityId });
    const res = NextResponse.redirect(redirectUrl);
    res.headers.append("Set-Cookie", stateCookie);
    return res;
  } catch (err) {
    if (err instanceof AuthFlowError) {
      return NextResponse.json(
        { ok: false, code: err.code, message: notConfiguredMessage(config) },
        { status: err.status }
      );
    }
    throw err;
  }
}
