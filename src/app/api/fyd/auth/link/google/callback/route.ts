/**
 * GET /api/fyd/auth/link/google/callback?code=...&state=...
 * Complete linking: same verification as sign-in, then the verified
 * account is linked to the identity embedded in the signed OAuth state.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadAuthConfig } from "@/fyd/identity/config";
import { completeGoogleCallback, AuthFlowError, notConfiguredMessage } from "@/fyd/identity/callback-flow";
import { FileIdentityBindingStore } from "@/fyd/identity/file-store";
import { OAUTH_STATE_COOKIE_NAME, clearOAuthStateCookie } from "@/fyd/identity/session";

export async function GET(request: NextRequest) {
  const config = loadAuthConfig();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateCookie = request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value ?? null;
  try {
    const result = await completeGoogleCallback(
      { config, store: new FileIdentityBindingStore() },
      { code, state, stateCookie }
    );
    const redirectTo = new URL("/", request.url);
    redirectTo.searchParams.set("auth", result.linked ? "linked" : "already-linked");
    const res = NextResponse.redirect(redirectTo);
    res.headers.append("Set-Cookie", result.sessionCookie);
    res.headers.append("Set-Cookie", result.clearStateCookie);
    return res;
  } catch (err) {
    if (err instanceof AuthFlowError) {
      const redirectTo = new URL("/", request.url);
      redirectTo.searchParams.set("auth", "error");
      redirectTo.searchParams.set("code", err.code);
      const res = NextResponse.redirect(redirectTo);
      res.headers.append("Set-Cookie", clearOAuthStateCookie(config.session));
      return res;
    }
    throw err;
  }
}
