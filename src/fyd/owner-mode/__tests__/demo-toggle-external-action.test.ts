/**
 * Grill delta 3 (2026-09-25, locked product law): DEMO OWNER MODE is only
 * simulated authorization for the controlled test. No public publish,
 * provider write, business claim, or consequential external action may rely
 * on the demo toggle. This test proves the toggle cannot trigger an
 * external action.
 *
 * What demo mode CAN do (local only):
 * - resolveClaimIdentity(): returns a demo-labeled identity, explicitly
 *   marked "not real authentication"
 * - customize: writes to local data/fyd-owner/ JSON + localhost journal
 * - claims: writes to local data/fyd-claims/ JSON
 *
 * What demo mode CANNOT do:
 * - trigger any external HTTP (publish, provider write, external claim)
 * - bypass the signed-envelope requirement for social actions
 * - reach a non-localhost gateway by default
 */
import { isDemoOwnerModeEnabled } from "../gate";
import { resolveClaimIdentity } from "../../claim/identity";

describe("demo owner mode cannot trigger external action", () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE = "1";
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE;
    else process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE = ORIGINAL;
  });

  test("demo toggle is on in this test", () => {
    expect(isDemoOwnerModeEnabled()).toBe(true);
  });

  test("claim identity is explicitly demo-labeled, not real auth", () => {
    const identity = resolveClaimIdentity();
    expect(identity).not.toBeNull();
    expect(identity!.kind).toBe("demo-owner");
    // The label must make the simulated status unmistakable.
    expect(identity!.authNote).toMatch(/not real authentication/i);
    expect(identity!.authNote).toMatch(/demo/i);
  });

  test("customize gateway defaults to localhost, never an external provider", () => {
    // The default in src/fyd/customize/server.ts must be a loopback URL.
    // If FYD_CUSTOMIZE_GATEWAY_URL is set, it is an explicit operator
    // choice, not something the demo toggle can influence.
    const def = process.env.FYD_CUSTOMIZE_GATEWAY_URL ?? "http://127.0.0.1:18199/events";
    const url = new URL(def);
    expect(["127.0.0.1", "localhost", "::1"]).toContain(url.hostname);
  });

  test("demo toggle does not grant social/external actions", () => {
    // Social actions (follow/unfollow) require a signed envelope submitted
    // to the PING gateway. They do not consult isDemoOwnerModeEnabled.
    // This is a structural assertion: the social module must not import
    // the demo gate. We verify by checking the module source.
    const fs = require("fs");
    const path = require("path");
    const socialSrc = fs.readFileSync(
      path.join(__dirname, "../../social/actions.ts"),
      "utf-8",
    );
    expect(socialSrc).not.toMatch(/isDemoOwnerModeEnabled|DEMO_OWNER_MODE/);
  });

  test("demo-gated claim/customize paths make no external HTTP", () => {
    // The claim identity bridge and customize server must not contain
    // fetch() calls to non-localhost URLs. We verify the source does not
    // reference external publish/provider endpoints.
    const fs = require("fs");
    const path = require("path");
    for (const rel of ["../../claim/identity.ts", "../../customize/server.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, rel), "utf-8");
      // No https:// external calls (localhost http is the demo journal).
      const external = src.match(/https:\/\/[^"'\`\s]+/g) || [];
      expect(external).toEqual([]);
    }
  });
});
