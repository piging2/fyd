/**
 * Canonicalizer agreement: the TS overlay canonicalizer
 * (src/fyd/proceduralize/patch.ts proposalDigest) and the Python
 * MC-approval canonicalizer (mc-approval/approval_request.py proposal_digest)
 * produce IDENTICAL digests on representative ASCII inputs, and
 * INTENTIONALLY DIFFER on non-ASCII input.
 *
 * Why this test exists: the two canonicalizers serve different domains
 * (overlay/site_patch vs MC approval) and must never be mixed up, but they
 * are designed to agree on ASCII business copy. This test pins that
 * agreement and documents the intended non-ASCII divergence. See the
 * DIGEST LAW notes on both canonicalizers.
 *
 * Requires python3 with the vendored mc-approval/ tree. It fails loudly
 * when python3 is unavailable rather than silently skipping the
 * cross-check: an untested agreement is not an agreement.
 */

import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { proposalDigest, type SitePatchBody } from "../patch";

type Body = Omit<SitePatchBody, "proposalDigest">;

const MC_APPROVAL_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "mc-approval",
);

function pythonProposalDigest(value: unknown): string {
  const script = [
    "import json, sys",
    "sys.path.insert(0, '.')",
    "from approval_request import proposal_digest",
    "sys.stdout.write(proposal_digest(json.load(sys.stdin)))",
  ].join("\n");
  try {
    return execFileSync("python3", ["-c", script], {
      cwd: MC_APPROVAL_DIR,
      input: JSON.stringify(value),
      encoding: "utf8",
      timeout: 30_000,
    }).trim();
  } catch (e) {
    throw new Error(
      "canonicalizer-agreement: could not run the Python MC-approval " +
        "canonicalizer (python3, cwd " + MC_APPROVAL_DIR + "): " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

/** Representative ASCII inputs. `expected` pins the digest law. */
const FIXTURES: Array<{ name: string; input: Record<string, unknown>; expected: string }> = [
  {
    name: "overlay-shaped site_patch body",
    input: {
      kind: "site_patch",
      targetPage: "home",
      targetSection: "home:Services:2",
      component: "Services",
      propsDiff: {
        "presentation.heading": "Emergency Services",
        "presentation.hidden": false,
      },
      reason: "Owner-approved heading update.",
      // Volatile on both sides: must not move the digest.
      nonce: "9f2c1a",
    },
    expected:
      "c1cad0c0d4f984bd645960600f492bac29de11e2a5ed26c4bc9ce39e21b5ee53",
  },
  {
    name: "nested MC-shaped proposal",
    input: {
      mission_id: "mc-m-c5b2c89b4ff7",
      page_slug: "home",
      section_id: "home:Services:2",
      presentation: {
        heading: "Emergency Services",
        copy: "Call us for urgent repairs. We answer fast.",
        featuredIds: ["website-business-6fa5ebd99d72c4cb-service-cd28e52699a5"],
        hidden: false,
        tags: [],
      },
      priority: 3,
      ratio: 1.5,
      note: null,
      nonce: "zzz",
    },
    expected:
      "f87c75f8060ffcf780478fd7a37ccd13939a942232fbf66ea21758d6effc4322",
  },
];

describe("canonicalizer agreement (TS patch.ts vs Python approval_request.py)", () => {
  for (const f of FIXTURES) {
    test(f.name + ": identical digests on ASCII input", () => {
      // The MC-shaped fixture is deliberately not a SitePatchBody: the
      // point is that both canonicalizers agree on the same input bytes
      // regardless of which domain the shape came from.
      const ts = proposalDigest(f.input as unknown as Body);
      const py = pythonProposalDigest(f.input);
      expect(ts).toBe(f.expected);
      expect(py).toBe(f.expected);
    });
  }

  test("volatile keys do not move the digest on either side", () => {
    const base = { kind: "site_patch", reason: "steady", propsDiff: {} };
    const withNonce = { ...base, nonce: "volatile-value" };
    expect(proposalDigest(withNonce as unknown as Body)).toBe(
      proposalDigest(base as unknown as Body),
    );
    expect(pythonProposalDigest(withNonce)).toBe(pythonProposalDigest(base));
  });

  test("non-ASCII input intentionally diverges (documented, not a bug)", () => {
    // Python ensure_ascii=True escapes non-ASCII to \uXXXX; TS
    // JSON.stringify keeps it raw (UTF-8). Different bytes, different
    // digests, by design. Astral characters additionally sort differently
    // (UTF-16 code units vs code points). See the DIGEST LAW notes on both
    // canonicalizers.
    const input = {
      kind: "site_patch",
      reason: "Café façade: naïve résumé, 50% off ☕",
      propsDiff: { "presentation.heading": "Café" },
    };
    const ts = proposalDigest(input as unknown as Body);
    const py = pythonProposalDigest(input);
    expect(ts).toBe(
      "0ec707818cc4caa54d064b5784542602af1f4150a909017420ff8dc81ca1b7aa",
    );
    expect(py).toBe(
      "bc91505e3f05f98da0b9ff908de9020a3784c7cdd33959f562e040e550489d20",
    );
    expect(ts).not.toBe(py);
  });
});
