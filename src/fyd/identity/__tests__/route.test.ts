/**
 * Route-level tests: session read, unlink guards (CSRF, last method),
 * and sign-out cookie clearing, against the real handlers with a temp
 * identity dir.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST as unlinkPost } from "../../../app/api/fyd/auth/unlink/route";
import { GET as sessionGet } from "../../../app/api/fyd/auth/session/route";
import { POST as signoutPost } from "../../../app/api/fyd/auth/signout/route";
import { FileIdentityBindingStore } from "../file-store";
import { linkProviderAccount, signInOrSignUp } from "../principal";
import { createSessionValue, newCsrfToken, SESSION_COOKIE_NAME } from "../session";
import type { VerifiedAccount } from "../provider";

const SECRET = "test-session-secret-that-is-long-enough-123";
const OLD_SECRET = process.env.FYD_SESSION_SECRET;
const OLD_DIR = process.env.FYD_IDENTITY_DIR;

function google(sub: string): VerifiedAccount {
  return { provider: "google", issuer: "https://accounts.google.com", subject: sub };
}

describe("auth routes", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fyd-auth-routes-"));
    process.env.FYD_SESSION_SECRET = SECRET;
    process.env.FYD_IDENTITY_DIR = dir;
    process.env.NODE_ENV = "test";
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (OLD_SECRET === undefined) delete process.env.FYD_SESSION_SECRET;
    else process.env.FYD_SESSION_SECRET = OLD_SECRET;
    if (OLD_DIR === undefined) delete process.env.FYD_IDENTITY_DIR;
    else process.env.FYD_IDENTITY_DIR = OLD_DIR;
  });

  function authedRequest(url: string, identityId: string, body: unknown): NextRequest {
    const value = createSessionValue(identityId, SECRET);
    return new NextRequest(url, {
      method: "POST",
      headers: {
        cookie: SESSION_COOKIE_NAME + "=" + encodeURIComponent(value),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  test("session: anonymous without a cookie", async () => {
    const res = await sessionGet(new NextRequest("http://localhost/api/fyd/auth/session"));
    const json = (await res.json()) as { authenticated: boolean };
    expect(json.authenticated).toBe(false);
  });

  test("session: reports identity and accounts with a valid cookie", async () => {
    const store = new FileIdentityBindingStore();
    const { identityId } = signInOrSignUp(store, google("sub-1"));
    const value = createSessionValue(identityId, SECRET);
    const req = new NextRequest("http://localhost/api/fyd/auth/session", {
      headers: { cookie: SESSION_COOKIE_NAME + "=" + encodeURIComponent(value) },
    });
    const res = await sessionGet(req);
    const json = (await res.json()) as { authenticated: boolean; identityId: string; accounts: unknown[] };
    expect(json.authenticated).toBe(true);
    expect(json.identityId).toBe(identityId);
    expect(json.accounts).toHaveLength(1);
  });

  test("unlink: 401 without a session", async () => {
    const req = new NextRequest("http://localhost/api/fyd/auth/unlink", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerAccountId: "x", csrfToken: "y" }),
    });
    const res = await unlinkPost(req);
    expect(res.status).toBe(401);
  });

  test("unlink: 403 on CSRF failure", async () => {
    const store = new FileIdentityBindingStore();
    const { identityId } = signInOrSignUp(store, google("sub-1"));
    const req = authedRequest("http://localhost/api/fyd/auth/unlink", identityId, {
      providerAccountId: "google::https://accounts.google.com::sub-1",
      csrfToken: "bogus",
    });
    const res = await unlinkPost(req);
    expect(res.status).toBe(403);
  });

  test("unlink: 409 when removing the last method", async () => {
    const store = new FileIdentityBindingStore();
    const { identityId } = signInOrSignUp(store, google("sub-1"));
    const req = authedRequest("http://localhost/api/fyd/auth/unlink", identityId, {
      providerAccountId: "google::https://accounts.google.com::sub-1",
      csrfToken: newCsrfToken(SECRET, identityId),
    });
    const res = await unlinkPost(req);
    expect(res.status).toBe(409);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("LAST_AUTH_METHOD");
  });

  test("unlink: succeeds when another method remains, identity preserved", async () => {
    const store = new FileIdentityBindingStore();
    const { identityId } = signInOrSignUp(store, google("sub-1"));
    const proof = google("sub-2");
    linkProviderAccount(store, identityId, proof, { proofOfAuthentication: proof });
    const req = authedRequest("http://localhost/api/fyd/auth/unlink", identityId, {
      providerAccountId: "google::https://accounts.google.com::sub-2",
      csrfToken: newCsrfToken(SECRET, identityId),
    });
    const res = await unlinkPost(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; identityId: string; remaining: number };
    expect(json.ok).toBe(true);
    expect(json.identityId).toBe(identityId);
    expect(json.remaining).toBe(1);
  });

  test("signout: clears the session cookie", async () => {
    const store = new FileIdentityBindingStore();
    const { identityId } = signInOrSignUp(store, google("sub-1"));
    const value = createSessionValue(identityId, SECRET);
    const req = new NextRequest("http://localhost/api/fyd/auth/signout", {
      method: "POST",
      headers: { cookie: SESSION_COOKIE_NAME + "=" + encodeURIComponent(value) },
    });
    const res = await signoutPost(req);
    const setCookie = res.headers.get("Set-Cookie") || "";
    expect(setCookie).toContain(SESSION_COOKIE_NAME + "=");
    expect(setCookie).toContain("Max-Age=0");
  });
});
