/**
 * Session cookie and CSRF contract tests.
 */

import {
  clearSessionCookie,
  createOAuthStateValue,
  createSessionValue,
  loadSessionConfig,
  newCsrfToken,
  parseCookies,
  readOAuthStateValue,
  readSessionValue,
  serializeSessionCookie,
  verifyCsrfToken,
  SESSION_COOKIE_NAME,
} from "../session";
import { FYD_IDENTITY_NAMESPACE, uuidv5 } from "../uuid";

const SECRET = "test-session-secret-that-is-long-enough-123";
const IDENTITY = uuidv5(FYD_IDENTITY_NAMESPACE, "provider-account:google::https://accounts.google.com::sub-1");

function sessionConfig(overrides: Partial<{ secure: boolean }> = {}) {
  return {
    secret: SECRET,
    configured: true,
    problems: [],
    maxAgeSeconds: 30 * 24 * 60 * 60,
    secure: overrides.secure ?? false,
  };
}

describe("loadSessionConfig", () => {
  test("missing secret fails closed with a labeled problem", () => {
    const config = loadSessionConfig({});
    expect(config.configured).toBe(false);
    expect(config.problems.join(" ")).toMatch(/FYD_SESSION_SECRET/);
  });

  test("placeholder secret fails closed", () => {
    expect(loadSessionConfig({ FYD_SESSION_SECRET: "__REPLACE_ME__" }).configured).toBe(false);
  });

  test("short secret fails closed", () => {
    expect(loadSessionConfig({ FYD_SESSION_SECRET: "too-short" }).configured).toBe(false);
  });

  test("real secret configures the session", () => {
    const config = loadSessionConfig({ FYD_SESSION_SECRET: SECRET });
    expect(config.configured).toBe(true);
    expect(config.problems).toEqual([]);
  });
});

describe("session cookie round trip", () => {
  test("create then read returns the identity", () => {
    const value = createSessionValue(IDENTITY, SECRET);
    const parsed = readSessionValue(value, SECRET);
    expect(parsed?.identityId).toBe(IDENTITY);
  });

  test("tampered value is rejected", () => {
    const value = createSessionValue(IDENTITY, SECRET);
    expect(readSessionValue(value + "x", SECRET)).toBeNull();
  });

  test("wrong secret is rejected", () => {
    const value = createSessionValue(IDENTITY, SECRET);
    expect(readSessionValue(value, "a-different-secret-that-is-long-enough")).toBeNull();
  });

  test("expired session is rejected", () => {
    const old = createSessionValue(IDENTITY, SECRET, Date.now() - 31 * 24 * 60 * 60 * 1000);
    expect(readSessionValue(old, SECRET)).toBeNull();
  });

  test("session issued in the future is rejected", () => {
    const future = createSessionValue(IDENTITY, SECRET, Date.now() + 60 * 60 * 1000);
    expect(readSessionValue(future, SECRET)).toBeNull();
  });

  test("serialized cookie is HttpOnly, Lax, Path=/", () => {
    const header = serializeSessionCookie("v", sessionConfig());
    expect(header).toContain(SESSION_COOKIE_NAME + "=v");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).not.toContain("Secure");
  });

  test("production config adds Secure", () => {
    expect(serializeSessionCookie("v", sessionConfig({ secure: true }))).toContain("Secure");
  });

  test("clear cookie expires immediately", () => {
    expect(clearSessionCookie(sessionConfig())).toContain("Max-Age=0");
  });

  test("cookie survives a Cookie header round trip", () => {
    const value = createSessionValue(IDENTITY, SECRET);
    const header = serializeSessionCookie(value, sessionConfig());
    const cookies = parseCookies(header.split(";")[0] + "; other=1");
    expect(readSessionValue(cookies[SESSION_COOKIE_NAME], SECRET)?.identityId).toBe(IDENTITY);
  });
});

describe("OAuth state round trip", () => {
  test("create then read returns the state", () => {
    const value = createOAuthStateValue(
      { state: "s", nonce: "n", codeVerifier: "v", redirectUri: "http://x/", createdAt: Date.now() },
      SECRET
    );
    const parsed = readOAuthStateValue(value, SECRET);
    expect(parsed?.state).toBe("s");
    expect(parsed?.codeVerifier).toBe("v");
  });

  test("expired state is rejected", () => {
    const value = createOAuthStateValue(
      { state: "s", nonce: "n", codeVerifier: "v", redirectUri: "http://x/", createdAt: Date.now() - 11 * 60 * 1000 },
      SECRET
    );
    expect(readOAuthStateValue(value, SECRET)).toBeNull();
  });

  test("tampered state is rejected", () => {
    const value = createOAuthStateValue(
      { state: "s", nonce: "n", codeVerifier: "v", redirectUri: "http://x/", createdAt: Date.now() },
      SECRET
    );
    expect(readOAuthStateValue(value + "tamper", SECRET)).toBeNull();
  });
});

describe("CSRF tokens", () => {
  test("token verifies for the bound identity only", () => {
    const token = newCsrfToken(SECRET, IDENTITY);
    expect(verifyCsrfToken(token, SECRET, IDENTITY)).toBe(true);
    const other = uuidv5(FYD_IDENTITY_NAMESPACE, "other");
    expect(verifyCsrfToken(token, SECRET, other)).toBe(false);
  });

  test("missing or tampered token fails", () => {
    expect(verifyCsrfToken(null, SECRET, IDENTITY)).toBe(false);
    expect(verifyCsrfToken("junk", SECRET, IDENTITY)).toBe(false);
  });
});
