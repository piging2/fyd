/**
 * LANE-OWNER tests: the owner identity seam.
 *
 * Pinned behaviors:
 * - the default bound provider is the demo one, explicitly unverified;
 * - hasVerifiedOwner() is false under the demo provider (fail closed);
 * - bindIdentityProvider() swaps the seam: a test double can resolve a
 *   verified identity, which is exactly where production auth binds.
 *
 * Run with: npx jest --config src/fyd/owner-mode/jest.config.cjs
 */

import {
  bindIdentityProvider,
  DemoIdentityProvider,
  hasVerifiedOwner,
  identityProvider,
  resolveOwnerIdentity,
  type OwnerIdentityProvider,
} from "../owner-identity";

describe("owner identity seam", () => {
  it("defaults to the demo provider, explicitly unverified", async () => {
    bindIdentityProvider(new DemoIdentityProvider());
    expect(identityProvider().name).toMatch(/unverified/);
    const identity = await resolveOwnerIdentity();
    expect(identity).not.toBeNull();
    expect(identity!.verified).toBe(false);
    expect(identity!.method).toBe("demo-seeded");
    expect(await hasVerifiedOwner()).toBe(false);
  });

  it("binds a real provider through the seam", async () => {
    const production: OwnerIdentityProvider = {
      name: "test-sso",
      resolveIdentity: async () => ({
        identityId: "owner-123",
        verified: true,
        method: "sso",
        note: "verified via test double",
      }),
    };
    bindIdentityProvider(production);
    expect(identityProvider().name).toBe("test-sso");
    expect(await hasVerifiedOwner()).toBe(true);
    const identity = await resolveOwnerIdentity();
    expect(identity!.identityId).toBe("owner-123");
    // Restore the demo default so no test leaks a "verified" binding.
    bindIdentityProvider(new DemoIdentityProvider());
    expect(await hasVerifiedOwner()).toBe(false);
  });

  it("treats an anonymous caller as no verified owner", async () => {
    bindIdentityProvider({
      name: "test-anonymous",
      resolveIdentity: async () => null,
    });
    expect(await hasVerifiedOwner()).toBe(false);
    bindIdentityProvider(new DemoIdentityProvider());
  });
});
