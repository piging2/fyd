/**
 * Provider seam proof (Apple de-scoped from OAuth at Nolan's word, 2026-09-21).
 *
 * Only Google is wired: SUPPORTED_PROVIDERS === ["google"], and the auth
 * config carries a single google entry. The seam for any future provider
 * is the generic OIDC interface: VerifiedAccount, providerAccountId,
 * deriveIdentityId, signInOrSignUp, linkProviderAccount. Every one of
 * them takes the provider (and issuer) as a parameter; the binding layer
 * never hardcodes "google". Wiring a future provider means widening
 * OidcProviderId and adding a config entry, not touching binding.
 */
import { loadAuthConfig } from "../config";
import { SUPPORTED_PROVIDERS } from "../provider";
import {
  deriveIdentityId,
  InMemoryIdentityBindingStore,
  providerAccountId,
  signInOrSignUp,
} from "../principal";

const NOW = "2026-09-21T22:00:00.000Z";

describe("provider seam (Google-only by directive)", () => {
  test("only Google is wired", () => {
    expect(SUPPORTED_PROVIDERS).toEqual(["google"]);
    const config = loadAuthConfig({});
    expect(Object.keys(config)).toContain("google");
    expect((config as Record<string, unknown>)["apple"]).toBeUndefined();
  });

  test("canonical key and identity derivation are pure functions of (provider, issuer, subject)", () => {
    const googleKey = providerAccountId("google", "https://accounts.google.com", "sub-1");
    const otherIssuerKey = providerAccountId("google", "https://other-issuer.example", "sub-1");
    // The issuer is part of the key: this is the seam point where a
    // future provider's (provider, issuer, subject) triple slots in.
    expect(otherIssuerKey).not.toBe(googleKey);
    expect(otherIssuerKey).toBe("google::https://other-issuer.example::sub-1");

    const id1 = deriveIdentityId("google", "https://accounts.google.com", "sub-1");
    const id2 = deriveIdentityId("google", "https://accounts.google.com", "sub-1");
    const id3 = deriveIdentityId("google", "https://other-issuer.example", "sub-1");
    expect(id2).toBe(id1);
    expect(id3).not.toBe(id1);
  });

  test("binding flows through the generic VerifiedAccount interface", () => {
    const store = new InMemoryIdentityBindingStore();
    const verified = {
      provider: "google" as const,
      issuer: "https://accounts.google.com",
      subject: "sub-7",
      email: "owner@example.com",
      emailVerified: true,
    };
    const first = signInOrSignUp(store, verified, NOW);
    const second = signInOrSignUp(store, verified, NOW);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.identityId).toBe(first.identityId);
    // The stored binding keeps the provider as data, not as code path.
    const accounts = store.listAccountsByIdentity(first.identityId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].provider).toBe("google");
    expect(accounts[0].issuer).toBe("https://accounts.google.com");
  });
});
