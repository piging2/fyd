/**
 * Q-C-03: public response contract versions and drift detection.
 *
 * Every public FYD response envelope carries an explicit, versioned
 * contract. This suite pins the current versions and fails when a covered
 * contract changes without an explicit version bump:
 *
 * - the semantic digest generator (component catalog + theme tokens) is
 *   fresh: `node scripts/fyd-contract-digests.mjs --check` exits 0;
 * - the response-envelope versions are pinned: bumping one means editing
 *   this file, which is the explicit acknowledgment;
 * - the circle route serves its contract version on the live response.
 *
 * The suite does not hash whole responses (brittle); it pins the version
 * strings and checks the generator that guards the semantic sources.
 */
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { ASK_RESPONSE_CONTRACT_VERSION } from "../../ask/contract";
import { CIRCLE_PROJECTION_CONTRACT_VERSION } from "../../object/view";
import { SITEMAP_CONTRACT_VERSION } from "../../../app/sitemap";
import { PUBLIC_PROJECTION_VERSION } from "../../sitespec/public-projection";

const REPO = path.resolve(__dirname, "..", "..", "..", "..");

describe("Q-C-03 public response contract versions", () => {
  test("semantic contract digests are fresh (no silent catalog/token drift)", () => {
    // Throws when the generator exits non-zero, i.e. the checked-in
    // contract-digests.ts is stale relative to the registry/token sources.
    execFileSync("node", ["scripts/fyd-contract-digests.mjs", "--check"], {
      cwd: REPO,
      stdio: "pipe",
    });
  });

  test("response envelope versions are pinned (bump = edit this file)", () => {
    expect(PUBLIC_PROJECTION_VERSION).toBe("fyd.public-projection@1");
    expect(ASK_RESPONSE_CONTRACT_VERSION).toBe("fyd.ask-response@1");
    expect(CIRCLE_PROJECTION_CONTRACT_VERSION).toBe("fyd.circle-projection@1");
    expect(SITEMAP_CONTRACT_VERSION).toBe("fyd.sitemap@1");
  });

  test("GET /api/fyd/circle serves its contract version", async () => {
    const { GET } = await import("../../../app/api/fyd/circle/route");
    const res = await GET(
      new Request("http://localhost/api/fyd/circle?id=happy-place"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.contractVersion).toBe("fyd.circle-projection@1");
    expect(body).toHaveProperty("projection");
  });
});
