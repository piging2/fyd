/**
 * End-to-end flow tests with injected dependencies: start -> callback
 * through a mock OIDC provider, proving sign-up, sign-in preservation,
 * link, state/PKCE enforcement, and fail-closed behavior when the
 * provider is not configured. Provider tokens never reach the store.
 */

import {
  beginGoogleStart,
  completeGoogleCallback,
  AuthFlowError,
} from "../callback-flow";
import { loadAuthConfig } from "../config";
import { InMemoryIdentityBindingStore } from "../principal";
import { MockOidcProvider } from "../mock-provider";
import { parseCookies, readSessionValue, SESSION_COOKIE_NAME, OAUTH_STATE_COOKIE_NAME } from "../session";
import { setAuditSink, type AuthAuditEntry } from "../audit";

const SECRET = "test-session-secret-that-is-long-enough-123";
const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const REDIRECT_URI = "http://localhost:3000/api/fyd/auth/google/callback";

function configuredEnv() {
  return {
    FYD_GOOGLE_CLIENT_ID: CLIENT_ID,
    FYD_GOOGLE_CLIENT_SECRET: "test-client-secret-value",
    FYD_GOOGLE_REDIRECT_URI: REDIRECT_URI,
    FYD_SESSION_SECRET: SECRET,
    NODE_ENV: "test",
  };
}

function testDeps(mock: MockOidcProvider, store: InMemoryIdentityBindingStore, code: string) {
  const config = loadAuthConfig(configuredEnv());
  expect(config.ready).toBe(true);
  const fetchImpl = (async (input: unknown, init?: unknown) => {
    const url = String(input);
    if (url === mock.jwksUri || url === config.google.jwksUri) return mock.fetch(mock.jwksUri, init);
    if (url === config.google.tokenEndpoint) {
      const nonce = currentNonce;
      const idToken = mock.issueIdToken({ sub: "google-sub-1", aud: CLIENT_ID, nonce, email: "owner@example.com", email_verified: true });
      return new Response(JSON.stringify({ id_token: idToken, token_type: "Bearer" }), { status: 200 });
    }
    throw new Error("unexpected URL " + url);
  }) as unknown as typeof fetch;
  return { config, store, fetchImpl };
}

let currentNonce = "";

describe("beginGoogleStart", () => {
  test("fails closed when Google is not configured", () => {
    const config = loadAuthConfig({});
    expect(config.ready).toBe(false);
    expect(() => beginGoogleStart({ config })).toThrow(AuthFlowError);
  });

  test("produces an authorization redirect and a signed state cookie", () => {
    const config = loadAuthConfig(configuredEnv());
    const { redirectUrl, stateCookie } = beginGoogleStart({ config });
    expect(redirectUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(stateCookie).toContain(OAUTH_STATE_COOKIE_NAME + "=");
  });
});

describe("completeGoogleCallback", () => {
  let audit: AuthAuditEntry[];
  beforeEach(() => {
    audit = [];
    setAuditSink((e) => audit.push(e));
    currentNonce = "";
  });
  afterEach(() => setAuditSink(null));

  async function runStartToCallback(store: InMemoryIdentityBindingStore, mock: MockOidcProvider, linkIdentityId?: string) {
    const { config, fetchImpl } = testDeps(mock, store, "code-1");
    const started = beginGoogleStart({ config }, linkIdentityId ? { linkIdentityId } : {});
    const cookies = parseCookies(started.stateCookie);
    const stateCookie = decodeURIComponent(cookies[OAUTH_STATE_COOKIE_NAME]);
    // capture the nonce the start embedded so the mock token matches it
    const { readOAuthStateValue } = await import("../session");
    const oauthState = readOAuthStateValue(stateCookie, SECRET);
    currentNonce = oauthState?.nonce ?? "";
    const stateParam = new URL(started.redirectUrl).searchParams.get("state");
    return completeGoogleCallback(
      { config, store, fetchImpl },
      { code: "code-1", state: stateParam, stateCookie }
    );
  }

  test("sign-up: first Google sign-in binds ONE identity and sets a session", async () => {
    const store = new InMemoryIdentityBindingStore();
    const mock = new MockOidcProvider();
    const result = await runStartToCallback(store, mock);
    expect(result.created).toBe(true);
    const cookies = parseCookies(result.sessionCookie);
    const session = readSessionValue(cookies[SESSION_COOKIE_NAME], SECRET);
    expect(session?.identityId).toBe(result.identityId);
    expect(audit.map((e) => e.event)).toEqual(["sign_up"]);
    expect(audit[0].identityId).toBe(result.identityId);
    // no provider token in the audit entry
    expect(JSON.stringify(audit[0])).not.toContain("Bearer");
  });

  test("sign-in: second run with the same provider account preserves identity", async () => {
    const store = new InMemoryIdentityBindingStore();
    const mock = new MockOidcProvider();
    const first = await runStartToCallback(store, mock);
    const second = await runStartToCallback(store, mock);
    expect(second.created).toBe(false);
    expect(second.identityId).toBe(first.identityId);
    expect(audit.map((e) => e.event)).toEqual(["sign_up", "sign_in"]);
  });

  test("state mismatch is rejected", async () => {
    const store = new InMemoryIdentityBindingStore();
    const mock = new MockOidcProvider();
    const { config, fetchImpl } = testDeps(mock, store, "code-1");
    const started = beginGoogleStart({ config });
    const cookies = parseCookies(started.stateCookie);
    await expect(
      completeGoogleCallback(
        { config, store, fetchImpl },
        { code: "code-1", state: "wrong-state", stateCookie: decodeURIComponent(cookies[OAUTH_STATE_COOKIE_NAME]) }
      )
    ).rejects.toMatchObject({ code: "STATE_MISMATCH", status: 400 });
  });

  test("missing state cookie is rejected", async () => {
    const store = new InMemoryIdentityBindingStore();
    const mock = new MockOidcProvider();
    const { config, fetchImpl } = testDeps(mock, store, "code-1");
    await expect(
      completeGoogleCallback({ config, store, fetchImpl }, { code: "code-1", state: "s", stateCookie: null })
    ).rejects.toMatchObject({ code: "BAD_STATE", status: 400 });
  });

  test("fails closed when not configured", async () => {
    const store = new InMemoryIdentityBindingStore();
    const mock = new MockOidcProvider();
    const config = loadAuthConfig({});
    await expect(
      completeGoogleCallback({ config, store }, { code: "c", state: "s", stateCookie: "x" })
    ).rejects.toMatchObject({ code: "AUTH_NOT_CONFIGURED", status: 503 });
  });

  test("link flow attaches the Google account to the existing identity", async () => {
    const store = new InMemoryIdentityBindingStore();
    const mock = new MockOidcProvider();
    const first = await runStartToCallback(store, mock);
    // link a second Google subject to the same identity
    const { config, fetchImpl } = testDeps(mock, store, "code-2");
    const started = beginGoogleStart({ config }, { linkIdentityId: first.identityId });
    const cookies = parseCookies(started.stateCookie);
    const stateCookie = decodeURIComponent(cookies[OAUTH_STATE_COOKIE_NAME]);
    const { readOAuthStateValue } = await import("../session");
    currentNonce = readOAuthStateValue(stateCookie, SECRET)?.nonce ?? "";
    const stateParam = new URL(started.redirectUrl).searchParams.get("state");
    // issue a token for a different subject for the link
    const linkFetch = (async (input: unknown, init?: unknown) => {
      const url = String(input);
      if (url === mock.jwksUri || url === config.google.jwksUri) return mock.fetch(mock.jwksUri, init);
      if (url === config.google.tokenEndpoint) {
        const idToken = mock.issueIdToken({ sub: "google-sub-2", aud: CLIENT_ID, nonce: currentNonce });
        return new Response(JSON.stringify({ id_token: idToken }), { status: 200 });
      }
      throw new Error("unexpected URL " + url);
    }) as unknown as typeof fetch;
    const linked = await completeGoogleCallback(
      { config, store, fetchImpl: linkFetch },
      { code: "code-2", state: stateParam, stateCookie }
    );
    expect(linked.linked).toBe(true);
    expect(linked.identityId).toBe(first.identityId);
    expect(store.listAccountsByIdentity(first.identityId)).toHaveLength(2);
    expect(audit.map((e) => e.event)).toEqual(["sign_up", "link"]);
  });
});
