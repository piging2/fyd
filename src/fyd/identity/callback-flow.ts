/**
 * Google OIDC start/callback flows with injected dependencies.
 *
 * Route handlers stay thin: they build an AuthConfig from the real env
 * and call these functions. Tests inject a MockOidcProvider, an
 * in-memory store, and fixed secrets, so the full binding contract is
 * proven without network or provider-console credentials.
 */

import {
  buildAuthorizationUrl,
  codeChallengeFor,
  exchangeCodeForTokens,
  newCodeVerifier,
  newNonce,
  newState,
  verifyGoogleIdToken,
  type FetchImpl,
  type GoogleOidcConfig,
  type VerifiedAccount,
} from "./provider";
import {
  IdentityBindingError,
  linkProviderAccount,
  providerAccountId,
  signInOrSignUp,
  type IdentityBindingStore,
  type SignInResult,
} from "./principal";
import {
  clearOAuthStateCookie,
  createOAuthStateValue,
  createSessionValue,
  readOAuthStateValue,
  serializeOAuthStateCookie,
  serializeSessionCookie,
  type OAuthState,
  type SessionConfig,
} from "./session";
import { appendAuthAudit } from "./audit";
import { isAllowedRedirectUri, type AuthConfig } from "./config";

export class AuthFlowError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AuthFlowError";
    this.code = code;
    this.status = status;
  }
}

function requireReady(config: AuthConfig): void {
  if (!config.ready) {
    throw new AuthFlowError(
      "AUTH_NOT_CONFIGURED",
      "Google sign-in is not configured yet. Install provider-console credentials to enable it.",
      503
    );
  }
}

export interface StartDeps {
  config: AuthConfig;
}

export interface StartResult {
  redirectUrl: string;
  stateCookie: string;
}

/**
 * Begin a Google sign-in (or, when linkIdentityId is set, a link flow for
 * an already-authenticated identity).
 */
export function beginGoogleStart(
  deps: StartDeps,
  opts: { linkIdentityId?: string } = {}
): StartResult {
  requireReady(deps.config);
  const { google, session } = deps.config;
  const state = newState();
  const nonce = newNonce();
  const codeVerifier = newCodeVerifier();
  const oauthState: OAuthState = {
    state,
    nonce,
    codeVerifier,
    redirectUri: google.redirectUri,
    createdAt: Date.now(),
  };
  if (opts.linkIdentityId) oauthState.linkIdentityId = opts.linkIdentityId;
  const redirectUrl = buildAuthorizationUrl(google, {
    state,
    nonce,
    codeChallenge: codeChallengeFor(codeVerifier),
  });
  return {
    redirectUrl,
    stateCookie: serializeOAuthStateCookie(createOAuthStateValue(oauthState, session.secret), session),
  };
}

export interface CallbackDeps {
  config: AuthConfig;
  store: IdentityBindingStore;
  fetchImpl?: FetchImpl;
  nowIso?: string;
}

export interface CallbackResult {
  identityId: string;
  created: boolean;
  emailCollision: boolean;
  linked: boolean;
  sessionCookie: string;
  clearStateCookie: string;
}

/**
 * Complete the Google callback: verify state, strict redirect allowlist,
 * exchange the code, verify the ID token server-side, then bind.
 * Provider tokens are discarded after verification.
 */
export async function completeGoogleCallback(
  deps: CallbackDeps,
  params: { code: string | null; state: string | null; stateCookie: string | null | undefined }
): Promise<CallbackResult> {
  const fail = (code: string, message: string, status: number): never => {
    throw new AuthFlowError(code, message, status);
  };
  requireReady(deps.config);
  const { google, session } = deps.config;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const nowIso = deps.nowIso ?? new Date().toISOString();

  const oauthState = readOAuthStateValue(params.stateCookie, session.secret);
  if (!oauthState) fail("BAD_STATE", "OAuth state missing, expired, or tampered", 400);
  if (!params.state || params.state !== oauthState.state) {
    fail("STATE_MISMATCH", "OAuth state mismatch", 400);
  }
  if (!isAllowedRedirectUri(google, oauthState.redirectUri)) {
    fail("REDIRECT_NOT_ALLOWED", "Redirect URI is not allowlisted", 400);
  }
  if (!params.code) fail("MISSING_CODE", "Authorization code missing", 400);

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(
      google,
      { code: params.code, codeVerifier: oauthState.codeVerifier, redirectUri: google.redirectUri },
      fetchImpl
    );
  } catch (err) {
    throw new AuthFlowError("EXCHANGE_FAILED", "Could not exchange the authorization code", 502);
  }
  let verified: VerifiedAccount;
  try {
    verified = await verifyGoogleIdToken(
      google,
      tokens.idToken,
      { expectedNonce: oauthState.nonce },
      fetchImpl
    );
  } catch (err) {
    throw new AuthFlowError("ID_TOKEN_INVALID", "Google identity could not be verified", 401);
  }
  // Provider tokens are intentionally dropped here: they never enter
  // binding records, audit logs, journal payloads, or generated pages.
  tokens = null;

  const linkingTo = oauthState.linkIdentityId;
  let result: { identityId: string; created: boolean; emailCollision: boolean; linked: boolean };
  if (linkingTo) {
    try {
      const link = linkProviderAccount(
        deps.store,
        linkingTo,
        verified,
        { proofOfAuthentication: verified },
        nowIso
      );
      result = { identityId: link.identityId, created: false, emailCollision: false, linked: !link.alreadyLinked };
    } catch (err) {
      if (err instanceof IdentityBindingError && err.code === "ACCOUNT_BOUND_ELSEWHERE") {
        throw new AuthFlowError("ACCOUNT_BOUND_ELSEWHERE", "This Google account is linked to a different identity", 409);
      }
      throw err;
    }
    appendAuthAudit("link", {
      identityId: linkingTo,
      provider: verified.provider,
      providerAccountId: providerAccountId(verified.provider, verified.issuer, verified.subject),
      at: nowIso,
    });
  } else {
    const signIn: SignInResult = signInOrSignUp(deps.store, verified, nowIso);
    result = { identityId: signIn.identityId, created: signIn.created, emailCollision: signIn.emailCollision, linked: false };
    appendAuthAudit(signIn.created ? "sign_up" : "sign_in", {
      identityId: signIn.identityId,
      provider: verified.provider,
      providerAccountId: providerAccountId(verified.provider, verified.issuer, verified.subject),
      note: signIn.emailCollision ? "email collision: separate identity, no merge" : undefined,
      at: nowIso,
    });
  }

  return {
    identityId: result.identityId,
    created: result.created,
    emailCollision: result.emailCollision,
    linked: result.linked,
    sessionCookie: serializeSessionCookie(createSessionValue(result.identityId, session.secret), session),
    clearStateCookie: clearOAuthStateCookie(session),
  };
}

/** Human-readable one-line status for the not-configured response. */
export function notConfiguredMessage(config: AuthConfig): string {
  return "Google sign-in is not configured: " + config.problems.join("; ");
}
