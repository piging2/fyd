/**
 * GET /api/fyd/auth/google/start
 * Begin Google sign-in: build the authorization URL and set a short-lived
 * signed state cookie (state + nonce + PKCE verifier).
 * Fails closed with 503 until provider-console credentials are installed.
 */

import { NextResponse } from "next/server";
import { loadAuthConfig } from "@/fyd/identity/config";
import { beginGoogleStart, AuthFlowError, notConfiguredMessage } from "@/fyd/identity/callback-flow";

export async function GET() {
  const config = loadAuthConfig();
  try {
    const { redirectUrl, stateCookie } = beginGoogleStart({ config });
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
