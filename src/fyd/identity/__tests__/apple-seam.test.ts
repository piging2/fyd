/**
 * Apple-shaped provider seam proof.
 *
 * Apple Sign In is NOT built in this lane. This suite proves the provider
 * seam accepts a future Apple OIDC provider with zero changes to the
 * binding semantics: the canonical key keeps providers separate, one
 * PING identity owns both accounts, and no email merging happens.
 */
import {
  InMemoryIdentityBindingStore,
  linkProviderAccount,
  providerAccountId,
  signInOrSignUp,
  type VerifiedAccount,
} from "../principal";

const NOW = "2026-09-21T21:00:00.000Z";

function appleAccount(sub: string, email?: string): VerifiedAccount {
  return {
    provider: "apple",
    issuer: "https://appleid.apple.com",
    subject: sub,
    email,
    emailVerified: true,
  };
}

function googleAccount(sub: string, email?: string): VerifiedAccount {
  return {
    provider: "google",
    issuer: "https://accounts.google.com",
    subject: sub,
    email,
    emailVerified: true,
  };
}

describe("Apple provider seam (not built, seam proven)", () => {
  test("canonical key separates Apple and Google even with the same subject", () => {
    const apple = providerAccountId("apple", "https://appleid.apple.com", "same-sub");
    const google = providerAccountId("google", "https://accounts.google.com", "same-sub");
    expect(apple).toBe("apple::https://appleid.apple.com::same-sub");
    expect(google).toBe("google::https://accounts.google.com::same-sub");
    expect(apple).not.toBe(google);
  });

  test("an Apple-shaped account links to the same identity as the Google account, no email merge", () => {
    const store = new InMemoryIdentityBindingStore();
    const first = signInOrSignUp(store, googleAccount("google-sub-9", "owner@example.com"), NOW);
    expect(first.created).toBe(true);
    // Same human, same email, Apple-shaped account: explicit link proof,
    // not email matching, attaches it to the SAME identity.
    const appleVerified = appleAccount("apple-sub-9", "owner@example.com");
    const linked = linkProviderAccount(store, first.identityId, appleVerified, { proofOfAuthentication: appleVerified }, NOW);
    expect(linked.identityId).toBe(first.identityId);
    const methods = store.listAccountsByIdentity(first.identityId);
    expect(methods).toHaveLength(2);
    expect(methods.map((m) => m.provider).sort()).toEqual(["apple", "google"]);
  });

  test("Apple-shaped sign-in resolves the existing identity deterministically", () => {
    const store = new InMemoryIdentityBindingStore();
    const first = signInOrSignUp(store, appleAccount("apple-sub-1"), NOW);
    const second = signInOrSignUp(store, appleAccount("apple-sub-1"), NOW);
    expect(second.identityId).toBe(first.identityId);
    expect(second.created).toBe(false);
  });
});
