/**
 * OIDC provider interface and the Google-ready configuration.
 *
 * Model: OIDC provider -> provider account -> authenticated principal ->
 * ONE PING identity binding. Protocol plumbing is commodity; PING/FYD owns
 * the binding, linkage, capabilities, audit, and sessions.
 *
 * Sign-in scopes are openid, profile, email only. We never request
 * offline_access and we discard provider tokens after the ID token is
 * verified; they never enter public objects, journal payloads, generated
 * pages, or agent context.
 *
 * This module is server-only. The client secret never leaves the server.
 */

import { createHash, createPublicKey, createVerify, randomBytes, type JsonWebKey } from "node:crypto";

/** Google is the only wired provider. Apple is OFF by directive (2026-09-21): no Apple provider path now. The generic OIDC interface keeps the seam for future providers. */
export type OidcProviderId = "google";
export const SUPPORTED_PROVIDERS: OidcProviderId[] = ["google"];

/** Canonical external identifier for a provider account: issuer + subject. */
export interface VerifiedAccount {
  provider: OidcProviderId;
  /** OIDC issuer, e.g. https://accounts.google.com */
  issuer: string;
  /** OIDC subject: the provider-stable account identifier. */
  subject: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

export interface GoogleOidcConfig {
  provider: "google";
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  clientId: string;
  /** Server-only. Empty string when not configured. */
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  /** False until real provider-console credentials are installed. */
  configured: boolean;
  /** Human-readable reasons when not configured (safe to log). */
  problems: string[];
}

const GOOGLE_ISSUER = "https://accounts.google.com";
const PLACEHOLDER_RE = /^(|__REPLACE_ME__|REPLACE[_\s-]?ME|YOUR[_\s-].*|changeme)$/i;

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  return v.length === 0 || PLACEHOLDER_RE.test(v);
}

/**
 * Build the Google OIDC config from server-only env. Placeholders are
 * injected by default so the adapter is Google-ready without blocking on
 * real provider-console credentials.
 *
 *   FYD_GOOGLE_CLIENT_ID        Google Cloud console OAuth client ID
 *   FYD_GOOGLE_CLIENT_SECRET    Google Cloud console OAuth client secret
 *   FYD_GOOGLE_REDIRECT_URI     Exact registered callback URL, e.g.
 *                               http://localhost:3000/api/fyd/auth/google/callback
 */
export function loadGoogleConfig(env: NodeJS.ProcessEnv = process.env): GoogleOidcConfig {
  const clientId = (env.FYD_GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (env.FYD_GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = (env.FYD_GOOGLE_REDIRECT_URI || "").trim();
  const problems: string[] = [];
  if (isPlaceholder(clientId)) problems.push("FYD_GOOGLE_CLIENT_ID is not set");
  if (isPlaceholder(clientSecret)) problems.push("FYD_GOOGLE_CLIENT_SECRET is not set");
  if (isPlaceholder(redirectUri)) problems.push("FYD_GOOGLE_REDIRECT_URI is not set");
  return {
    provider: "google",
    issuer: GOOGLE_ISSUER,
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
    clientId,
    clientSecret,
    redirectUri,
    scopes: ["openid", "profile", "email"],
    configured: problems.length === 0,
    problems,
  };
}

export interface AuthorizeOptions {
  state: string;
  nonce: string;
  codeChallenge: string;
}

/** Authorization URL: response_type=code, PKCE S256, minimal scopes. */
export function buildAuthorizationUrl(config: GoogleOidcConfig, opts: AuthorizeOptions): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state: opts.state,
    nonce: opts.nonce,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
  return config.authorizationEndpoint + "?" + params.toString();
}

/** PKCE helpers. */
export function newCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}
export function codeChallengeFor(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}
export function newState(): string {
  return randomBytes(16).toString("base64url");
}
export function newNonce(): string {
  return randomBytes(16).toString("base64url");
}

export class OAuthExchangeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "OAuthExchangeError";
    this.code = code;
  }
}

export interface TokenSet {
  idToken: string;
  /** Present only transiently; discarded after verification. */
  accessToken?: string;
  tokenType?: string;
  expiresIn?: number;
}

export type FetchImpl = typeof fetch;

/** Exchange an authorization code for tokens (server to provider). */
export async function exchangeCodeForTokens(
  config: GoogleOidcConfig,
  args: { code: string; codeVerifier: string; redirectUri: string },
  fetchImpl: FetchImpl = fetch
): Promise<TokenSet> {
  const body = new URLSearchParams({
    code: args.code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: "authorization_code",
    code_verifier: args.codeVerifier,
  });
  let res: Response;
  try {
    res = await fetchImpl(config.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (err) {
    throw new OAuthExchangeError("TOKEN_ENDPOINT_UNREACHABLE", "Token endpoint unreachable");
  }
  if (!res.ok) {
    throw new OAuthExchangeError("TOKEN_EXCHANGE_FAILED", "Token exchange failed with status " + res.status);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const idToken = data["id_token"];
  if (typeof idToken !== "string" || idToken.length === 0) {
    throw new OAuthExchangeError("NO_ID_TOKEN", "Token endpoint returned no ID token");
  }
  return {
    idToken,
    accessToken: typeof data["access_token"] === "string" ? (data["access_token"] as string) : undefined,
    tokenType: typeof data["token_type"] === "string" ? (data["token_type"] as string) : undefined,
    expiresIn: typeof data["expires_in"] === "number" ? (data["expires_in"] as number) : undefined,
  };
}

export class IdTokenVerificationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "IdTokenVerificationError";
    this.code = code;
  }
}

interface JwksKey {
  kid?: string;
  kty?: string;
  alg?: string;
  [k: string]: unknown;
}

function base64urlJson(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
}

const CLOCK_SKEW_SECONDS = 120;

/**
 * Verify a Google ID token server-side: signature against the provider
 * JWKS, then iss / aud / exp / iat / nonce. Never trust a
 * browser-provided profile ID; the canonical external identifier is
 * issuer + sub from the verified token.
 */
export async function verifyGoogleIdToken(
  config: GoogleOidcConfig,
  idToken: string,
  args: { expectedNonce?: string; nowSeconds?: number } = {},
  fetchImpl: FetchImpl = fetch
): Promise<VerifiedAccount> {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new IdTokenVerificationError("MALFORMED_TOKEN", "ID token is not a three-part JWT");
  }
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = base64urlJson(parts[0]);
    claims = base64urlJson(parts[1]);
  } catch {
    throw new IdTokenVerificationError("MALFORMED_TOKEN", "ID token header or payload is not valid JSON");
  }
  if (header["alg"] !== "RS256") {
    throw new IdTokenVerificationError("UNEXPECTED_ALG", "ID token alg must be RS256");
  }
  const kid = header["kid"];
  if (typeof kid !== "string" || kid.length === 0) {
    throw new IdTokenVerificationError("MISSING_KID", "ID token has no kid");
  }

  let jwks: { keys?: JwksKey[] };
  try {
    const res = await fetchImpl(config.jwksUri);
    if (!res.ok) {
      throw new IdTokenVerificationError("JWKS_FETCH_FAILED", "JWKS fetch failed with status " + res.status);
    }
    jwks = (await res.json()) as { keys?: JwksKey[] };
  } catch (err) {
    if (err instanceof IdTokenVerificationError) throw err;
    throw new IdTokenVerificationError("JWKS_FETCH_FAILED", "JWKS endpoint unreachable");
  }
  const jwk = (jwks.keys || []).find((k) => k.kid === kid && k.kty === "RSA");
  if (!jwk) {
    throw new IdTokenVerificationError("UNKNOWN_KID", "No matching JWKS key for kid");
  }

  const signature = Buffer.from(parts[2], "base64url");
  const signingInput = Buffer.from(parts[0] + "." + parts[1], "utf8");
  let ok = false;
  try {
    const key = createPublicKey({ key: jwk as unknown as JsonWebKey, format: "jwk" });
    ok = createVerify("RSA-SHA256").update(signingInput).verify(key, signature);
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new IdTokenVerificationError("BAD_SIGNATURE", "ID token signature verification failed");
  }

  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const iss = claims["iss"];
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") {
    throw new IdTokenVerificationError("BAD_ISSUER", "ID token issuer is not Google");
  }
  if (claims["aud"] !== config.clientId) {
    throw new IdTokenVerificationError("BAD_AUDIENCE", "ID token audience mismatch");
  }
  const exp = claims["exp"];
  if (typeof exp !== "number" || exp + CLOCK_SKEW_SECONDS < now) {
    throw new IdTokenVerificationError("TOKEN_EXPIRED", "ID token is expired");
  }
  const iat = claims["iat"];
  if (typeof iat !== "number" || iat > now + CLOCK_SKEW_SECONDS) {
    throw new IdTokenVerificationError("BAD_IAT", "ID token issued-at is in the future");
  }
  if (args.expectedNonce !== undefined && claims["nonce"] !== args.expectedNonce) {
    throw new IdTokenVerificationError("BAD_NONCE", "ID token nonce mismatch");
  }
  const sub = claims["sub"];
  if (typeof sub !== "string" || sub.length === 0) {
    throw new IdTokenVerificationError("MISSING_SUB", "ID token has no subject");
  }

  const email = claims["email"];
  return {
    provider: "google",
    issuer: String(iss),
    subject: sub,
    email: typeof email === "string" ? email : undefined,
    emailVerified: claims["email_verified"] === true || claims["email_verified"] === "true",
    name: typeof claims["name"] === "string" ? (claims["name"] as string) : undefined,
  };
}
