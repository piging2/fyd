/**
 * GET /api/fyd/auth/google/callback?code=...&state=...
 * Complete Google sign-in: verify state, strict redirect allowlist,
 * exchange the code, verify the ID token server-side, bind ONE identity,
 * set the session cookie. Provider tokens are discarded after verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadAuthConfig, notConfiguredMessage } from "@/fyd/identity/config";
import { completeGoogleCallback, AuthFlowError } from "@/fyd/identity/callback-flow";
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
    if (result.emailCollision) {
      redirectTo.searchParams.set("auth", "email-collision");
    }
    const res = NextResponse.redirect(redirectTo);
    res.headers.append("Set-Cookie", result.sessionCookie);
    res.headers.append("Set-Cookie", result.clearStateCookie);
    return res;
  } catch (err) {
    if (err instanceof AuthFlowError) {
      if (err.code === "AUTH_NOT_CONFIGURED") {
        return NextResponse.json(
          { ok: false, code: err.code, message: notConfiguredMessage(config) },
          { status: err.status }
        );
      }
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
