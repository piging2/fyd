/**
 * GET /api/fyd/auth/session
 * Read the session cookie and report the authenticated identity with its
 * linked provider accounts. Anonymous when no valid session exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadAuthConfig } from "@/fyd/identity/config";
import { parseCookies, readSessionValue, SESSION_COOKIE_NAME } from "@/fyd/identity/session";
import { FileIdentityBindingStore } from "@/fyd/identity/file-store";

export async function GET(request: NextRequest) {
  const config = loadAuthConfig();
  if (!config.session.configured) {
    return NextResponse.json({ ok: true, authenticated: false, reason: "session_not_configured" });
  }
  const cookies = parseCookies(request.headers.get("cookie"));
  const session = readSessionValue(cookies[SESSION_COOKIE_NAME], config.session.secret);
  if (!session) {
    return NextResponse.json({ ok: true, authenticated: false });
  }
  const store = new FileIdentityBindingStore();
  const accounts = store.listAccountsByIdentity(session.identityId).map((a) => ({
    provider: a.provider,
    providerAccountId: a.providerAccountId,
    email: a.email,
    emailCollision: a.emailCollision ?? false,
    linkedAt: a.linkedAt,
  }));
  return NextResponse.json({
    ok: true,
    authenticated: true,
    identityId: session.identityId,
    accounts,
  });
}
