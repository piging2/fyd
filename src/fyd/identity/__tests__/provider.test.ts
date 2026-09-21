/**
 * Provider contract tests: Google-ready config placeholders, authorization
 * URL construction, and server-side ID token verification against a mock
 * OIDC provider (no network, no provider-console credentials).
 */

import {
  buildAuthorizationUrl,
  codeChallengeFor,
  exchangeCodeForTokens,
  loadGoogleConfig,
  newCodeVerifier,
  newNonce,
  newState,
  verifyGoogleIdToken,
  IdTokenVerificationError,
  OAuthExchangeError,
  type GoogleOidcConfig,
} from "../provider";
import { MockOidcProvider } from "../mock-provider";

const testConfig = (mock: MockOidcProvider): GoogleOidcConfig => {
  return {
    provider: "google",
    issuer: "https://accounts.google.com",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    jwksUri: mock.jwksUri,
    clientId: "test-client-id.apps.googleusercontent.com",
    clientSecret: "test-client-secret",
    redirectUri: "http://localhost:3000/api/fyd/auth/google/callback",
    scopes: ["openid", "profile", "email"],
    configured: true,
    problems: [],
  };
};

describe("loadGoogleConfig placeholders", () => {
  test("missing env means not configured, with labeled problems", () => {
    const config = loadGoogleConfig({});
    expect(config.configured).toBe(false);
    expect(config.problems.length).toBeGreaterThan(0);
    expect(config.problems.join(" ")).toMatch(/FYD_GOOGLE_CLIENT_ID/);
  });

  test("placeholder values are treated as not configured", () => {
    const config = loadGoogleConfig({
      FYD_GOOGLE_CLIENT_ID: "__REPLACE_ME__",
      FYD_GOOGLE_CLIENT_SECRET: "changeme",
      FYD_GOOGLE_REDIRECT_URI: "",
    });
    expect(config.configured).toBe(false);
  });

  test("real values mark the provider configured", () => {
    const config = loadGoogleConfig({
      FYD_GOOGLE_CLIENT_ID: "abc.apps.googleusercontent.com",
      FYD_GOOGLE_CLIENT_SECRET: "a-real-secret-value-here",
      FYD_GOOGLE_REDIRECT_URI: "http://localhost:3000/api/fyd/auth/google/callback",
    });
    expect(config.configured).toBe(true);
    expect(config.problems).toEqual([]);
  });

  test("sign-in scopes are exactly openid, profile, email", () => {
    const config = loadGoogleConfig({
      FYD_GOOGLE_CLIENT_ID: "x",
      FYD_GOOGLE_CLIENT_SECRET: "y",
      FYD_GOOGLE_REDIRECT_URI: "z",
    });
    expect(config.scopes).toEqual(["openid", "profile", "email"]);
  });
});

describe("buildAuthorizationUrl", () => {
  test("requests code flow with PKCE S256 and minimal scopes", () => {
    const mock = new MockOidcProvider();
    const config = testConfig(mock);
    const state = newState();
    const nonce = newNonce();
    const verifier = newCodeVerifier();
    const url = new URL(buildAuthorizationUrl(config, {
      state,
      nonce,
      codeChallenge: codeChallengeFor(verifier),
    }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(config.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("nonce")).toBe(nonce);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(codeChallengeFor(verifier));
    expect(url.searchParams.get("access_type")).toBeNull();
    expect(url.searchParams.get("prompt")).toBeNull();
  });
});

describe("verifyGoogleIdToken (mock provider, real code path)", () => {
  test("accepts a well-formed token and returns the canonical account", async () => {
    const mock = new MockOidcProvider();
    const config = testConfig(mock);
    const nonce = newNonce();
    const token = mock.issueIdToken({
      sub: "google-sub-123",
      aud: config.clientId,
      nonce,
      email: "owner@example.com",
      email_verified: true,
      name: "Test Owner",
    });
    const account = await verifyGoogleIdToken(config, token, { expectedNonce: nonce }, mock.fetch);
    expect(account.provider).toBe("google");
    expect(account.issuer).toBe("https://accounts.google.com");
    expect(account.subject).toBe("google-sub-123");
    expect(account.email).toBe("owner@example.com");
    expect(account.emailVerified).toBe(true);
  });

  test("rejects a tampered signature", async () => {
    const mock = new MockOidcProvider();
    const config = testConfig(mock);
    const token = mock.issueIdToken({ sub: "s", aud: config.clientId });
    const tampered = token.slice(0, -4) + "AAAA";
    await expect(verifyGoogleIdToken(config, tampered, {}, mock.fetch)).rejects.toMatchObject({
      code: "BAD_SIGNATURE",
    });
  });

  test("rejects a token signed by an unknown key", async () => {
    const mock = new MockOidcProvider();
    const config = testConfig(mock);
    const foreign = mock.issueForeignToken({ sub: "s", aud: config.clientId });
    await expect(verifyGoogleIdToken(config, foreign, {}, mock.fetch)).rejects.toMatchObject({
      code: "UNKNOWN_KID",
    });
  });

  test("rejects audience mismatch", async () => {
    const mock = new MockOidcProvider();
    const config = testConfig(mock);
    const token = mock.issueIdToken({ sub: "s", aud: "someone-elses-client-id" });
    await expect(verifyGoogleIdToken(config, token, {}, mock.fetch)).rejects.toMatchObject({
      code: "BAD_AUDIENCE",
    });
  });

  test("rejects nonce mismatch", async () => {
    const mock = new MockOidcProvider();
    const config = testConfig(mock);
    const token = mock.issueIdToken({ sub: "s", aud: config.clientId, nonce: "nonce-a" });
    await expect(
      verifyGoogleIdToken(config, token, { expectedNonce: "nonce-b" }, mock.fetch)
    ).rejects.toMatchObject({ code: "BAD_NONCE" });
  });

  test("rejects an expired token", async () => {
    const mock = new MockOidcProvider();
    const config = testConfig(mock);
    const past = Math.floor(Date.now() / 1000) - 7200;
    const token = mock.issueIdToken({ sub: "s", aud: config.clientId, exp: past, iat: past - 100 });
    await expect(verifyGoogleIdToken(config, token, {}, mock.fetch)).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
    });
  });

  test("rejects a non-Google issuer", async () => {
    const mock = new MockOidcProvider();
    const config = testConfig(mock);
    const token = mock.issueIdToken({ sub: "s", aud: config.clientId, iss: "https://evil.example.com" });
    await expect(verifyGoogleIdToken(config, token, {}, mock.fetch)).rejects.toMatchObject({
      code: "BAD_ISSUER",
    });
  });

  test("rejects a missing subject", async () => {
    const mock = new MockOidcProvider();
    const config = testConfig(mock);
    const token = mock.issueIdToken({ sub: "", aud: config.clientId });
    await expect(verifyGoogleIdToken(config, token, {}, mock.fetch)).rejects.toMatchObject({
      code: "MISSING_SUB",
    });
  });
});

describe("exchangeCodeForTokens", () => {
  test("posts the code with PKCE verifier and returns the ID token", async () => {
    const mock = new MockOidcProvider();
    const config = testConfig(mock);
    const seen: { url?: string; body?: string } = {};
    const fetchImpl = (async (input: unknown, init?: { body?: unknown }) => {
      seen.url = String(input);
      seen.body = String((init as { body?: unknown }).body);
      return new Response(
        JSON.stringify({ id_token: "test-id-token", token_type: "Bearer", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as unknown as typeof fetch;
    const tokens = await exchangeCodeForTokens(
      config,
      { code: "auth-code-1", codeVerifier: "verifier-1", redirectUri: config.redirectUri },
      fetchImpl
    );
    expect(tokens.idToken).toBe("test-id-token");
    expect(seen.url).toBe(config.tokenEndpoint);
    const body = new URLSearchParams(seen.body || "");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code-1");
    expect(body.get("code_verifier")).toBe("verifier-1");
    expect(body.get("client_id")).toBe(config.clientId);
  });

  test("maps provider errors to a typed exchange error", async () => {
    const mock = new MockOidcProvider();
    const config = testConfig(mock);
    const fetchImpl = (async () => new Response("bad", { status: 400 })) as unknown as typeof fetch;
    await expect(
      exchangeCodeForTokens(config, { code: "x", codeVerifier: "y", redirectUri: config.redirectUri }, fetchImpl)
    ).rejects.toBeInstanceOf(OAuthExchangeError);
  });
});
