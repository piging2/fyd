/**
 * Binding contract tests: provider account -> authenticated principal ->
 * ONE PING identity. Proves the non-negotiable semantics:
 * sign-up binds one identity; sign-in preserves it; a second provider
 * links to the same identity; unlink keeps the identity while another
 * method remains; unlinking the last method is refused; email collisions
 * never merge.
 */

import {
  deriveIdentityId,
  IdentityBindingError,
  InMemoryIdentityBindingStore,
  linkProviderAccount,
  providerAccountId,
  signInOrSignUp,
  unlinkProviderAccount,
} from "../principal";
import { isUuid, uuidv5, FYD_IDENTITY_NAMESPACE } from "../uuid";
import type { VerifiedAccount } from "../provider";

const NOW = "2026-09-21T15:00:00.000Z";

function googleAccount(sub: string, email?: string, emailVerified?: boolean): VerifiedAccount {
  return {
    provider: "google",
    issuer: "https://accounts.google.com",
    subject: sub,
    email,
    emailVerified,
    name: "Owner " + sub,
  };
}

describe("identity derivation (extracted PING semantics)", () => {
  test("same provider account always derives the same identity ID", () => {
    const a = deriveIdentityId("google", "https://accounts.google.com", "sub-1");
    const b = deriveIdentityId("google", "https://accounts.google.com", "sub-1");
    expect(a).toBe(b);
    expect(isUuid(a)).toBe(true);
  });

  test("different subjects derive different identities", () => {
    expect(
      deriveIdentityId("google", "https://accounts.google.com", "sub-1")
    ).not.toBe(deriveIdentityId("google", "https://accounts.google.com", "sub-2"));
  });

  test("the namespace is stable and derived once", () => {
    expect(isUuid(FYD_IDENTITY_NAMESPACE)).toBe(true);
    expect(uuidv5(FYD_IDENTITY_NAMESPACE, "x")).toBe(uuidv5(FYD_IDENTITY_NAMESPACE, "x"));
  });

  test("provider account key excludes email by construction", () => {
    const id = providerAccountId("google", "https://accounts.google.com", "sub-1");
    expect(id).not.toContain("@");
    expect(id).toBe("google::https://accounts.google.com::sub-1");
  });
});

describe("signInOrSignUp", () => {
  test("sign-up binds ONE identity to the provider account", () => {
    const store = new InMemoryIdentityBindingStore();
    const result = signInOrSignUp(store, googleAccount("sub-1", "a@example.com", true), NOW);
    expect(result.created).toBe(true);
    expect(isUuid(result.identityId)).toBe(true);
    const stored = store.getAccount("google::https://accounts.google.com::sub-1");
    expect(stored?.identityId).toBe(result.identityId);
    expect(stored?.email).toBe("a@example.com");
  });

  test("sign-in with the same provider account preserves the identity", () => {
    const store = new InMemoryIdentityBindingStore();
    const first = signInOrSignUp(store, googleAccount("sub-1", "a@example.com", true), NOW);
    const second = signInOrSignUp(
      store,
      googleAccount("sub-1", "a@example.com", true),
      "2026-09-22T15:00:00.000Z"
    );
    expect(second.created).toBe(false);
    expect(second.identityId).toBe(first.identityId);
  });

  test("a second provider with the same verified email does NOT merge: separate identity, flagged", () => {
    const store = new InMemoryIdentityBindingStore();
    const first = signInOrSignUp(store, googleAccount("sub-1", "same@example.com", true), NOW);
    const second = signInOrSignUp(
      store,
      { provider: "google", issuer: "https://accounts.google.com", subject: "sub-2", email: "same@example.com", emailVerified: true },
      NOW
    );
    expect(second.created).toBe(true);
    expect(second.identityId).not.toBe(first.identityId);
    expect(second.emailCollision).toBe(true);
    const stored = store.getAccount("google::https://accounts.google.com::sub-2");
    expect(stored?.emailCollision).toBe(true);
    expect(stored?.identityId).toBe(second.identityId);
  });

  test("unverified email does not trigger a collision flag", () => {
    const store = new InMemoryIdentityBindingStore();
    signInOrSignUp(store, googleAccount("sub-1", "same@example.com", true), NOW);
    const second = signInOrSignUp(store, googleAccount("sub-2", "same@example.com", false), NOW);
    expect(second.emailCollision).toBe(false);
  });
});

describe("linkProviderAccount", () => {
  test("linking a second provider keeps the SAME identity", () => {
    const store = new InMemoryIdentityBindingStore();
    const first = signInOrSignUp(store, googleAccount("sub-1", "a@example.com", true), NOW);
    const proof = googleAccount("sub-2", "a@example.com", true);
    const link = linkProviderAccount(store, first.identityId, proof, { proofOfAuthentication: proof }, NOW);
    expect(link.identityId).toBe(first.identityId);
    expect(link.alreadyLinked).toBe(false);
    const accounts = store.listAccountsByIdentity(first.identityId);
    expect(accounts).toHaveLength(2);
  });

  test("linking is idempotent for an already-linked account", () => {
    const store = new InMemoryIdentityBindingStore();
    const first = signInOrSignUp(store, googleAccount("sub-1"), NOW);
    const proof = googleAccount("sub-2");
    linkProviderAccount(store, first.identityId, proof, { proofOfAuthentication: proof }, NOW);
    const again = linkProviderAccount(store, first.identityId, proof, { proofOfAuthentication: proof }, NOW);
    expect(again.alreadyLinked).toBe(true);
    expect(store.listAccountsByIdentity(first.identityId)).toHaveLength(2);
  });

  test("linking requires fresh authenticated proof", () => {
    const store = new InMemoryIdentityBindingStore();
    const first = signInOrSignUp(store, googleAccount("sub-1"), NOW);
    expect(() =>
      linkProviderAccount(store, first.identityId, googleAccount("sub-2"), { proofOfAuthentication: null }, NOW)
    ).toThrow(IdentityBindingError);
  });

  test("cannot link an account bound to a different identity", () => {
    const store = new InMemoryIdentityBindingStore();
    const first = signInOrSignUp(store, googleAccount("sub-1"), NOW);
    const other = signInOrSignUp(store, googleAccount("sub-9"), NOW);
    const proof = googleAccount("sub-9");
    expect(() =>
      linkProviderAccount(store, first.identityId, proof, { proofOfAuthentication: proof }, NOW)
    ).toThrow(expect.objectContaining({ code: "ACCOUNT_BOUND_ELSEWHERE" }));
    expect(other.identityId).not.toBe(first.identityId);
  });
});

describe("unlinkProviderAccount", () => {
  function twoAccountIdentity(): { store: InMemoryIdentityBindingStore; identityId: string } {
    const store = new InMemoryIdentityBindingStore();
    const first = signInOrSignUp(store, googleAccount("sub-1", "a@example.com", true), NOW);
    const proof = googleAccount("sub-2", "a@example.com", true);
    linkProviderAccount(store, first.identityId, proof, { proofOfAuthentication: proof }, NOW);
    return { store, identityId: first.identityId };
  }

  test("unlinking one of two methods keeps the identity", () => {
    const { store, identityId } = twoAccountIdentity();
    const out = unlinkProviderAccount(store, identityId, "google::https://accounts.google.com::sub-2");
    expect(out.identityId).toBe(identityId);
    expect(out.remaining).toBe(1);
    expect(store.getAccount("google::https://accounts.google.com::sub-2")).toBeNull();
    // the identity still resolves through the remaining account
    const again = signInOrSignUp(store, googleAccount("sub-1", "a@example.com", true), NOW);
    expect(again.identityId).toBe(identityId);
    expect(again.created).toBe(false);
  });

  test("unlinking the last method is refused", () => {
    const store = new InMemoryIdentityBindingStore();
    const first = signInOrSignUp(store, googleAccount("sub-1"), NOW);
    expect(() =>
      unlinkProviderAccount(store, first.identityId, "google::https://accounts.google.com::sub-1")
    ).toThrow(expect.objectContaining({ code: "LAST_AUTH_METHOD" }));
    expect(store.getAccount("google::https://accounts.google.com::sub-1")).not.toBeNull();
  });

  test("cannot unlink another identity's account", () => {
    const { store, identityId } = twoAccountIdentity();
    const other = signInOrSignUp(store, googleAccount("sub-9"), NOW);
    expect(() =>
      unlinkProviderAccount(store, other.identityId, "google::https://accounts.google.com::sub-1")
    ).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
    expect(identityId).not.toBe(other.identityId);
  });
});
