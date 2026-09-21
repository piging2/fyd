/**
 * Provider account -> authenticated principal -> ONE PING identity binding.
 *
 * Non-negotiable semantics (from the user):
 * - ProviderAccount is keyed by PROVIDER + PROVIDER-STABLE SUBJECT
 *   (issuer + sub). Email is an attribute/claim, NEVER canonical identity.
 * - Never silently merge two accounts because email strings match.
 *   A second provider with the same verified email gets its own identity
 *   on sign-up (flagged as an email collision for the owner to resolve),
 *   unless the owner explicitly links it while authenticated.
 * - Account linking requires authenticated proof: the verified ID token
 *   from the current flow. Linking reuses an existing binding idempotently.
 * - Unlinking the last valid auth method is refused; the identity survives
 *   refresh, sign-out, and sign-in because the session and the binding both
 *   resolve to the same identity ID.
 *
 * Identity IDs derive deterministically via uuidv5(namespace, name),
 * the extracted PING canonical derivation rule (see ./uuid.ts). No
 * MissionRuntime dependency: this module is self-contained.
 */

import { createHash } from "node:crypto";
import { FYD_IDENTITY_NAMESPACE, isUuid, uuidv5 } from "./uuid";
import type { OidcProviderId, VerifiedAccount } from "./provider";

export class IdentityBindingError extends Error {
  readonly code:
    | "ACCOUNT_BOUND_ELSEWHERE"
    | "LAST_AUTH_METHOD"
    | "NOT_FOUND"
    | "PROOF_REQUIRED"
    | "INVALID_ACCOUNT";
  constructor(
    code: IdentityBindingError["code"],
    message: string
  ) {
    super(message);
    this.name = "IdentityBindingError";
    this.code = code;
  }
}

/**
 * Canonical provider account key. Deliberately excludes email: the
 * provider-stable subject is the identity, email is a mutable claim.
 */
export function providerAccountId(provider: OidcProviderId, issuer: string, subject: string): string {
  return provider + "::" + issuer + "::" + subject;
}

/**
 * Derive the ONE PING identity ID for a provider account, deterministically.
 * Same (provider, issuer, subject) always yields the same identity, so
 * refresh / sign-out / sign-in preserve identity without any lookup table
 * beyond the binding records themselves.
 */
export function deriveIdentityId(provider: OidcProviderId, issuer: string, subject: string): string {
  return uuidv5(FYD_IDENTITY_NAMESPACE, "provider-account:" + providerAccountId(provider, issuer, subject));
}

export interface ProviderAccount {
  /** provider::issuer::subject, the canonical key. */
  providerAccountId: string;
  provider: OidcProviderId;
  issuer: string;
  subject: string;
  /** The ONE PING identity this account authenticates. */
  identityId: string;
  /** Attribute only. Never used as a key. */
  email?: string;
  emailVerified?: boolean;
  name?: string;
  linkedAt: string;
  lastVerifiedAt: string;
  /**
   * Set when another account already carried the same verified email at
   * link time. The accounts stay separate; the owner may resolve this in
   * the UI. Never an automatic merge.
   */
  emailCollision?: boolean;
}

export interface IdentityBindingStore {
  getAccount(providerAccountId: string): ProviderAccount | null;
  putAccount(account: ProviderAccount): void;
  deleteAccount(providerAccountId: string): void;
  /** All accounts bound to one identity, ordered by linkedAt. */
  listAccountsByIdentity(identityId: string): ProviderAccount[];
  /** Verified-email lookup for collision detection (attribute scan). */
  findByVerifiedEmail(email: string): ProviderAccount[];
}

/** In-memory store: tests and dev without durable storage. */
export class InMemoryIdentityBindingStore implements IdentityBindingStore {
  private accounts = new Map<string, ProviderAccount>();

  getAccount(id: string): ProviderAccount | null {
    return this.accounts.get(id) ?? null;
  }
  putAccount(account: ProviderAccount): void {
    this.accounts.set(account.providerAccountId, account);
  }
  deleteAccount(id: string): void {
    this.accounts.delete(id);
  }
  listAccountsByIdentity(identityId: string): ProviderAccount[] {
    return [...this.accounts.values()]
      .filter((a) => a.identityId === identityId)
      .sort((a, b) => (a.linkedAt < b.linkedAt ? -1 : 1));
  }
  findByVerifiedEmail(email: string): ProviderAccount[] {
    const needle = email.trim().toLowerCase();
    return [...this.accounts.values()].filter(
      (a) => a.emailVerified && a.email && a.email.trim().toLowerCase() === needle
    );
  }
}

function normalizeEmail(email: string | undefined): string | undefined {
  const e = (email || "").trim().toLowerCase();
  return e.length > 0 ? e : undefined;
}

function toAccount(verified: VerifiedAccount, identityId: string, nowIso: string): ProviderAccount {
  const id = providerAccountId(verified.provider, verified.issuer, verified.subject);
  if (!isUuid(identityId)) {
    throw new IdentityBindingError("INVALID_ACCOUNT", "identityId is not a valid UUID");
  }
  return {
    providerAccountId: id,
    provider: verified.provider,
    issuer: verified.issuer,
    subject: verified.subject,
    identityId,
    email: verified.email,
    emailVerified: verified.emailVerified,
    name: verified.name,
    linkedAt: nowIso,
    lastVerifiedAt: nowIso,
  };
}

export interface SignInResult {
  identityId: string;
  created: boolean;
  /** True when another account already had this verified email; no merge happened. */
  emailCollision: boolean;
}

/**
 * Sign in or sign up with a verified provider account.
 * - Known provider account -> its identity (sign-in preserves identity).
 * - Unknown provider account -> derive and bind ONE new identity
 *   (sign-up). Email collisions are flagged, never merged.
 */
export function signInOrSignUp(
  store: IdentityBindingStore,
  verified: VerifiedAccount,
  nowIso: string = new Date().toISOString()
): SignInResult {
  const id = providerAccountId(verified.provider, verified.issuer, verified.subject);
  const existing = store.getAccount(id);
  if (existing) {
    existing.lastVerifiedAt = nowIso;
    if (verified.email) existing.email = verified.email;
    if (verified.emailVerified !== undefined) existing.emailVerified = verified.emailVerified;
    if (verified.name) existing.name = verified.name;
    store.putAccount(existing);
    return { identityId: existing.identityId, created: false, emailCollision: false };
  }
  const identityId = deriveIdentityId(verified.provider, verified.issuer, verified.subject);
  const account = toAccount(verified, identityId, nowIso);
  const email = normalizeEmail(verified.email);
  let collision = false;
  if (email && verified.emailVerified) {
    const others = store
      .findByVerifiedEmail(email)
      .filter((a) => a.providerAccountId !== id);
    if (others.length > 0) {
      collision = true;
      account.emailCollision = true;
    }
  }
  store.putAccount(account);
  return { identityId, created: true, emailCollision: collision };
}

export interface LinkResult {
  identityId: string;
  providerAccountId: string;
  alreadyLinked: boolean;
}

/**
 * Link a second provider to the currently authenticated identity.
 * Requires the just-verified account as authenticated proof
 * (proofOfAuthentication must be the VerifiedAccount from this flow).
 * Refuses to steal an account bound to a different identity.
 */
export function linkProviderAccount(
  store: IdentityBindingStore,
  identityId: string,
  verified: VerifiedAccount,
  opts: { proofOfAuthentication: VerifiedAccount | null },
  nowIso: string = new Date().toISOString()
): LinkResult {
  if (!opts.proofOfAuthentication) {
    throw new IdentityBindingError("PROOF_REQUIRED", "Linking requires a freshly verified provider account");
  }
  const proof = opts.proofOfAuthentication;
  if (
    proof.provider !== verified.provider ||
    proof.issuer !== verified.issuer ||
    proof.subject !== verified.subject
  ) {
    throw new IdentityBindingError("PROOF_REQUIRED", "Proof does not match the account being linked");
  }
  const id = providerAccountId(verified.provider, verified.issuer, verified.subject);
  const existing = store.getAccount(id);
  if (existing) {
    if (existing.identityId !== identityId) {
      throw new IdentityBindingError(
        "ACCOUNT_BOUND_ELSEWHERE",
        "This provider account is already linked to a different identity"
      );
    }
    existing.lastVerifiedAt = nowIso;
    store.putAccount(existing);
    return { identityId, providerAccountId: id, alreadyLinked: true };
  }
  const account = toAccount(verified, identityId, nowIso);
  const email = normalizeEmail(verified.email);
  if (email && verified.emailVerified) {
    const others = store
      .findByVerifiedEmail(email)
      .filter((a) => a.providerAccountId !== id && a.identityId !== identityId);
    if (others.length > 0) account.emailCollision = true;
  }
  store.putAccount(account);
  return { identityId, providerAccountId: id, alreadyLinked: false };
}

/**
 * Unlink a provider account. Refuses to remove the last valid auth
 * method; the identity itself is never deleted by unlinking.
 */
export function unlinkProviderAccount(
  store: IdentityBindingStore,
  identityId: string,
  targetProviderAccountId: string
): { identityId: string; remaining: number } {
  const account = store.getAccount(targetProviderAccountId);
  if (!account || account.identityId !== identityId) {
    throw new IdentityBindingError("NOT_FOUND", "Provider account not found for this identity");
  }
  const remaining = store.listAccountsByIdentity(identityId);
  if (remaining.length <= 1) {
    throw new IdentityBindingError(
      "LAST_AUTH_METHOD",
      "Cannot unlink the last sign-in method; link another provider first"
    );
  }
  store.deleteAccount(targetProviderAccountId);
  return { identityId, remaining: remaining.length - 1 };
}

/** Stable file key for a provider account record. */
export function accountFileKey(id: string): string {
  return createHash("sha256").update(id, "utf8").digest("hex") + ".json";
}
