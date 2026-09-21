/**
 * POST /api/fyd/auth/unlink  { providerAccountId, csrfToken }
 * Unlink a provider account from the authenticated identity. Refuses to
 * remove the last sign-in method. CSRF-protected.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadAuthConfig } from "@/fyd/identity/config";
import {
  parseCookies,
  readSessionValue,
  verifyCsrfToken,
  SESSION_COOKIE_NAME,
} from "@/fyd/identity/session";
import { FileIdentityBindingStore } from "@/fyd/identity/file-store";
import { IdentityBindingError, unlinkProviderAccount } from "@/fyd/identity/principal";
import { appendAuthAudit } from "@/fyd/identity/audit";

export async function POST(request: NextRequest) {
  const config = loadAuthConfig();
  if (!config.session.configured) {
    return NextResponse.json({ ok: false, code: "AUTH_NOT_CONFIGURED" }, { status: 503 });
  }
  const cookies = parseCookies(request.headers.get("cookie"));
  const session = readSessionValue(cookies[SESSION_COOKIE_NAME], config.session.secret);
  if (!session) {
    return NextResponse.json({ ok: false, code: "NOT_AUTHENTICATED" }, { status: 401 });
  }
  let body: { providerAccountId?: unknown; csrfToken?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST" }, { status: 400 });
  }
  const providerAccountId = body.providerAccountId;
  const csrfToken = body.csrfToken;
  if (typeof providerAccountId !== "string" || providerAccountId.length === 0) {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST" }, { status: 400 });
  }
  if (!verifyCsrfToken(typeof csrfToken === "string" ? csrfToken : null, config.session.secret, session.identityId)) {
    return NextResponse.json({ ok: false, code: "CSRF_FAILED" }, { status: 403 });
  }
  try {
    const out = unlinkProviderAccount(new FileIdentityBindingStore(), session.identityId, providerAccountId);
    appendAuthAudit("unlink", {
      identityId: session.identityId,
      providerAccountId,
    });
    return NextResponse.json({ ok: true, identityId: out.identityId, remaining: out.remaining });
  } catch (err) {
    if (err instanceof IdentityBindingError) {
      const status = err.code === "LAST_AUTH_METHOD" ? 409 : 404;
      return NextResponse.json({ ok: false, code: err.code }, { status });
    }
    throw err;
  }
}
