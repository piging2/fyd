/**
 * Google-ready auth configuration with injected placeholders.
 *
 * The adapter is Google-ready NOW without blocking on real
 * provider-console credentials: until FYD_GOOGLE_CLIENT_ID,
 * FYD_GOOGLE_CLIENT_SECRET, FYD_GOOGLE_REDIRECT_URI, and
 * FYD_SESSION_SECRET carry real values, every auth route fails closed
 * with a labeled not-configured response.
 *
 * DEMO OWNER MODE (src/fyd/owner-mode) is unchanged and stays the only
 * owner path until real credentials arrive: localhost/private only,
 * visibly not production auth, cannot authorize external effects.
 */

import { loadGoogleConfig, type GoogleOidcConfig } from "./provider";
import { loadSessionConfig, type SessionConfig } from "./session";

export interface AuthConfig {
  google: GoogleOidcConfig;
  session: SessionConfig;
  /** True only when Google OIDC and the session secret are both configured. */
  ready: boolean;
  /** Safe-to-log reasons when not ready. */
  problems: string[];
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const google = loadGoogleConfig(env);
  const session = loadSessionConfig(env);
  const problems = [...google.problems, ...session.problems];
  return { google, session, ready: problems.length === 0, problems };
}

/**
 * Strict callback allowlist: the redirect URI used in a flow must equal
 * the configured redirect URI exactly. No open redirects, no host
 * suffix tricks.
 */
export function isAllowedRedirectUri(config: GoogleOidcConfig, redirectUri: string): boolean {
  return config.configured && redirectUri === config.redirectUri;
}

/** Human-readable one-line status for the not-configured response. */
export function notConfiguredMessage(config: AuthConfig): string {
  return "Google sign-in is not configured: " + config.problems.join("; ");
}
