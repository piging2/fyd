/**
 * Secure session cookie and CSRF tokens for the FYD identity lane.
 *
 * Sessions are HMAC-signed (not encrypted) cookies carrying only the
 * identity ID and issued-at; all binding state stays server-side. Cookie
 * flags: HttpOnly, SameSite=Lax, Path=/, Secure in production. Sessions
 * fail closed when FYD_SESSION_SECRET is missing or a placeholder.
 *
 * No provider tokens ever touch this module.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isUuid } from "./uuid";

export const SESSION_COOKIE_NAME = "fyd_session";
export const OAUTH_STATE_COOKIE_NAME = "fyd_oauth_state";
export const CSRF_COOKIE_NAME = "fyd_csrf";

const PLACEHOLDER_RE = /^(|__REPLACE_ME__|REPLACE[_\s-]?ME|changeme)$/i;

export interface SessionConfig {
  /** Server-only secret. Empty when not configured. */
  secret: string;
  configured: boolean;
  problems: string[];
  /** 30 days. */
  maxAgeSeconds: number;
  secure: boolean;
}

export function loadSessionConfig(env: NodeJS.ProcessEnv = process.env): SessionConfig {
  const secret = (env.FYD_SESSION_SECRET || "").trim();
  const problems: string[] = [];
  if (secret.length === 0 || PLACEHOLDER_RE.test(secret)) {
    problems.push("FYD_SESSION_SECRET is not set");
  } else if (secret.length < 32) {
    problems.push("FYD_SESSION_SECRET must be at least 32 characters");
  }
  const nodeEnv = (env.NODE_ENV || "development").trim();
  return {
    secret,
    configured: problems.length === 0,
    problems,
    maxAgeSeconds: 30 * 24 * 60 * 60,
    secure: nodeEnv === "production",
  };
}

function b64urlEncode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function verifySignature(secret: string, payload: string, signature: string): boolean {
  const expected = sign(secret, payload);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface SessionValue {
  identityId: string;
  issuedAt: number;
}

/** Create a signed session value for an identity. */
export function createSessionValue(identityId: string, secret: string, nowMs: number = Date.now()): string {
  if (!isUuid(identityId)) throw new Error("createSessionValue: identityId is not a UUID");
  const payload = b64urlEncode({ identityId, issuedAt: nowMs });
  return payload + "." + sign(secret, payload);
}

/**
 * Read and verify a session value. Returns the session or null when the
 * signature is bad, the shape is wrong, or the session expired.
 */
export function readSessionValue(
  value: string | undefined | null,
  secret: string,
  nowMs: number = Date.now(),
  maxAgeMs: number = 30 * 24 * 60 * 60 * 1000
): SessionValue | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!verifySignature(secret, payload, signature)) return null;
  let parsed: { identityId?: unknown; issuedAt?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as typeof parsed;
  } catch {
    return null;
  }
  if (typeof parsed.identityId !== "string" || !isUuid(parsed.identityId)) return null;
  if (typeof parsed.issuedAt !== "number") return null;
  if (parsed.issuedAt > nowMs + 5 * 60 * 1000) return null; // issued in the future
  if (nowMs - parsed.issuedAt > maxAgeMs) return null; // expired
  return { identityId: parsed.identityId, issuedAt: parsed.issuedAt };
}

/** Parse a Cookie header into a name -> value map. */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name && out[name] === undefined) out[name] = decodeURIComponent(value);
  }
  return out;
}

export function serializeSessionCookie(value: string, config: SessionConfig): string {
  const parts = [
    SESSION_COOKIE_NAME + "=" + encodeURIComponent(value),
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + config.maxAgeSeconds,
  ];
  if (config.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(config: SessionConfig): string {
  const parts = [
    SESSION_COOKIE_NAME + "=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (config.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Short-lived signed OAuth state (state + nonce + PKCE verifier). */
export interface OAuthState {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  /** When set, the callback links instead of signing in. */
  linkIdentityId?: string;
  createdAt: number;
}

export function createOAuthStateValue(oauthState: OAuthState, secret: string): string {
  const payload = b64urlEncode(oauthState);
  return payload + "." + sign(secret, payload);
}

export function readOAuthStateValue(
  value: string | undefined | null,
  secret: string,
  nowMs: number = Date.now(),
  maxAgeMs: number = 10 * 60 * 1000
): OAuthState | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!verifySignature(secret, payload, signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (typeof parsed.state !== "string" || typeof parsed.nonce !== "string") return null;
    if (typeof parsed.codeVerifier !== "string" || typeof parsed.redirectUri !== "string") return null;
    if (typeof parsed.createdAt !== "number") return null;
    if (nowMs - parsed.createdAt > maxAgeMs) return null;
    if (parsed.linkIdentityId !== undefined && !isUuid(parsed.linkIdentityId)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function serializeOAuthStateCookie(value: string, config: SessionConfig): string {
  const parts = [
    OAUTH_STATE_COOKIE_NAME + "=" + encodeURIComponent(value),
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
  ];
  if (config.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearOAuthStateCookie(config: SessionConfig): string {
  const parts = [OAUTH_STATE_COOKIE_NAME + "=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (config.secure) parts.push("Secure");
  return parts.join("; ");
}

/** CSRF token bound to the session identity; checked on mutating routes. */
export function newCsrfToken(secret: string, identityId: string): string {
  const nonce = randomBytes(16).toString("base64url");
  const payload = b64urlEncode({ identityId, nonce });
  return payload + "." + sign(secret, payload);
}

export function verifyCsrfToken(token: string | undefined | null, secret: string, identityId: string): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!verifySignature(secret, payload, signature)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { identityId?: unknown };
    return parsed.identityId === identityId;
  } catch {
    return false;
  }
}
