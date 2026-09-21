/**
 * Regression tests for the claim state machine: OBSERVED -> CLAIMED ->
 * VERIFIED-CONTROLLED transitions, reload persistence via the store, and
 * every fail-closed guard (anonymous claim, demo-context claim, double
 * claim, verify-before-claim, unimplemented method, weak proof, release).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claim,
  createObserved,
  DEMO_CONTEXT_IDS,
  recordVerifyAttempt,
  release,
  verifyControl,
} from "../machine";
import { readClaim, writeClaim } from "../store";
import { attestOperatorControl } from "../verification-seam";
import type { ClaimedIdentity, VerificationProof } from "../types";
import { ClaimError } from "../types";

const DEMO_IDENTITY: ClaimedIdentity = {
  kind: "demo-owner",
  actorId: "demo-owner",
  actorLabel: "Demo Owner (seeded, unverified)",
  authenticatedAt: "2026-09-21T00:00:00.000Z",
  authNote: "DEMO OWNER MODE - not real authentication.",
};

function attested(resourceId = "url-abcdef1234567890"): VerificationProof {
  return attestOperatorControl({
    resourceId,
    operatorLabel: DEMO_IDENTITY.actorLabel,
    basis: "I operate this site and control its content.",
  });
}

describe("createObserved", () => {
  test("starts in observed with an audit event and no identity", () => {
    const c = createObserved("url-abcdef1234567890", "https://example.com/");
    expect(c.state).toBe("observed");
    expect(c.claimedBy).toBeNull();
    expect(c.verification).toBeNull();
    expect(c.sourceUrl).toBe("https://example.com/");
    expect(c.history).toHaveLength(1);
    expect(c.history[0].type).toBe("observed-created");
  });
  test("rejects invalid resource ids", () => {
    expect(() => createObserved("HAS SPACES")).toThrow(ClaimError);
    expect(() => createObserved("")).toThrow(ClaimError);
    expect(() => createObserved("../escape")).toThrow(ClaimError);
  });
});

describe("claim", () => {
  test("anonymous (null identity) cannot claim", () => {
    const c = createObserved("url-abcdef1234567890");
    expect(() => claim(c, null)).toThrow(ClaimError);
    expect(() => claim(c, null)).toThrow(/authenticated identity/);
  });
  test("demo-context objects cannot be claimed", () => {
    for (const id of DEMO_CONTEXT_IDS) {
      const c = createObserved(id);
      expect(() => claim(c, DEMO_IDENTITY)).toThrow(/Demo objects cannot be claimed/);
    }
  });
  test("observed -> claimed binds the identity and audits", () => {
    const before = createObserved("url-abcdef1234567890");
    const after = claim(before, DEMO_IDENTITY);
    expect(after.state).toBe("claimed");
    expect(after.claimedBy).toEqual(DEMO_IDENTITY);
    expect(after.history).toHaveLength(2);
    expect(after.history[1].type).toBe("claimed");
    // Immutable: the input is untouched.
    expect(before.state).toBe("observed");
    expect(before.claimedBy).toBeNull();
  });
  test("double claim is refused", () => {
    const c = claim(createObserved("url-abcdef1234567890"), DEMO_IDENTITY);
    expect(() => claim(c, DEMO_IDENTITY)).toThrow(/Only an observed/);
  });
});

describe("verifyControl", () => {
  test("verify before claim is refused", () => {
    const c = createObserved("url-abcdef1234567890");
    expect(() => verifyControl(c, attested())).toThrow(/Only a claimed resource/);
  });
  test("unimplemented methods are refused", () => {
    const c = claim(createObserved("url-abcdef1234567890"), DEMO_IDENTITY);
    const proof: VerificationProof = {
      ...attested(),
      method: "dns-txt",
    };
    expect(() => verifyControl(c, proof)).toThrow(/not implemented yet/);
  });
  test("claimed -> verified-controlled with operator attestation", () => {
    const c = claim(createObserved("url-abcdef1234567890"), DEMO_IDENTITY);
    const after = verifyControl(c, attested());
    expect(after.state).toBe("verified-controlled");
    expect(after.verification?.method).toBe("operator-attestation");
    expect(after.verification?.proofNote).toMatch(/not a cryptographic proof/);
    expect(after.history.map((h) => h.type)).toEqual([
      "observed-created",
      "claimed",
      "verified",
    ]);
  });
  test("verify attempts can be audited without a transition", () => {
    const c = claim(createObserved("url-abcdef1234567890"), DEMO_IDENTITY);
    const after = recordVerifyAttempt(c, "someone", "tried dns-txt, token not found");
    expect(after.state).toBe("claimed");
    expect(after.history[after.history.length - 1]?.type).toBe("verify-attempt");
  });
});

describe("release", () => {
  test("claimed -> observed clears identity and proof, keeps history", () => {
    const c = verifyControl(claim(createObserved("url-abcdef1234567890"), DEMO_IDENTITY), attested());
    const after = release(c, DEMO_IDENTITY.actorLabel);
    expect(after.state).toBe("observed");
    expect(after.claimedBy).toBeNull();
    expect(after.verification).toBeNull();
    expect(after.history.map((h) => h.type)).toEqual([
      "observed-created",
      "claimed",
      "verified",
      "released",
    ]);
  });
  test("release on observed is refused", () => {
    expect(() => release(createObserved("url-abcdef1234567890"), "x")).toThrow(
      /already unclaimed/,
    );
  });
});

describe("reload persistence (store round-trip)", () => {
  test("a claimed record survives write/read with history intact", () => {
    const dir = mkdtempSync(join(tmpdir(), "fyd-claims-"));
    process.env.FYD_CLAIM_DIR = dir;
    try {
      const c = claim(createObserved("url-abcdef1234567890", "https://example.com/"), DEMO_IDENTITY);
      writeClaim(c);
      const reloaded = readClaim("url-abcdef1234567890");
      expect(reloaded).toEqual(c);
      expect(reloaded?.history).toHaveLength(2);
      // A second process-equivalent read sees the same state.
      expect(readClaim("url-abcdef1234567890")?.state).toBe("claimed");
    } finally {
      delete process.env.FYD_CLAIM_DIR;
    }
  });
  test("missing, corrupt, and mismatched files read as null (fail honest)", () => {
    const dir = mkdtempSync(join(tmpdir(), "fyd-claims-"));
    process.env.FYD_CLAIM_DIR = dir;
    try {
      expect(readClaim("url-doesnotexist0000")).toBeNull();
      writeFileSync(join(dir, "url-bad000000000000.json"), "{not json", "utf8");
      expect(readClaim("url-bad000000000000")).toBeNull();
      const other = createObserved("url-other0000000000");
      writeFileSync(
        join(dir, "url-mismatch00000000.json"),
        JSON.stringify(other),
        "utf8",
      );
      expect(readClaim("url-mismatch00000000")).toBeNull();
    } finally {
      delete process.env.FYD_CLAIM_DIR;
    }
  });
  test("invalid ids read as null (fail honest, never invented state)", () => {
    expect(readClaim("../escape")).toBeNull();
  });
});
