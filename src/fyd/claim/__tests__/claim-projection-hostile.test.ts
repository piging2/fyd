/**
 * HOSTILE TESTS for the claims read projection
 * (src/fyd/claim/claim-projection.ts, Nolan 2026-09-25 binding decision).
 *
 * The invariant: claim EXISTENCE/STATUS may be public; the full internal
 * claim record is NOT the public representation. An unauthenticated caller
 * who knows a resourceId must receive the minimal explicitly approved
 * public view and NOTHING else. Knowing an identifier never authorizes
 * the internal record.
 *
 * A RED test is a CONFIRMED DISCLOSURE PATH. GREEN means contained.
 *
 * Run: npx jest --config src/fyd/sitespec/jest.config.cjs claim-projection-hostile
 * (from the repo root; or via the root jest config matching this path)
 */
import {
  CLAIM_PROJECTION_VERSION,
  projectClaimForViewer,
  type ClaimViewerKind,
  type PublicClaimView,
} from "../claim-projection";
import { createObserved, claim, verifyControl } from "../machine";
import type { ClaimedIdentity, ResourceClaim, VerificationProof } from "../types";

const SECRET_ACTOR_ID = "hostile-test-actor-999";
const SECRET_LABEL = "Hostile Test Owner";
const SECRET_NOTE = "HOSTILE-TEST-IDENTITY synthetic not-a-real-principal";
const SECRET_DIGEST = "sha256:hostile-test-token-digest-0123456789abcdef";
const SECRET_BASIS = "Hostile test proof basis: synthetic verification evidence.";

function hostileIdentity(): ClaimedIdentity {
  return {
    kind: "demo-owner",
    actorId: SECRET_ACTOR_ID,
    actorLabel: SECRET_LABEL,
    authenticatedAt: "2026-09-25T09:00:00.000Z",
    authNote: SECRET_NOTE,
  };
}

function hostileProof(): VerificationProof {
  return {
    method: "operator-attestation",
    verifiedAt: "2026-09-25T09:01:00.000Z",
    verifiedBy: SECRET_LABEL,
    basis: SECRET_BASIS,
    artifacts: { "token-digest": SECRET_DIGEST },
    proofNote: "HOSTILE-TEST-PROOF synthetic.",
  };
}

/** A fully-loaded verified-controlled claim: the richest internal record. */
function hostileClaim(): ResourceClaim {
  let c = createObserved("url-hostiletest0001", "https://hostile-test.invalid/");
  c = claim(c, hostileIdentity());
  c = verifyControl(c, hostileProof());
  return c;
}

const PUBLIC_KEYS = ["kind", "resourceId", "sourceUrl", "state"].sort();

describe("claim projection: anonymous viewer", () => {
  test("serves EXACTLY the approved public fields, nothing more", () => {
    const projected = projectClaimForViewer(hostileClaim(), "anonymous");
    expect(projected).not.toBeNull();
    expect(Object.keys(projected as object).sort()).toEqual(PUBLIC_KEYS);
    const pub = projected as PublicClaimView;
    expect(pub.resourceId).toBe("url-hostiletest0001");
    expect(pub.kind).toBe("fyd-site");
    expect(pub.state).toBe("verified-controlled");
    expect(pub.sourceUrl).toBe("https://hostile-test.invalid/");
  });

  test("no secret value survives anywhere in the serialized public view", () => {
    const projected = projectClaimForViewer(hostileClaim(), "anonymous");
    const bytes = JSON.stringify(projected);
    for (const secret of [
      SECRET_ACTOR_ID,
      SECRET_LABEL,
      SECRET_NOTE,
      SECRET_DIGEST,
      SECRET_BASIS,
      "HOSTILE-TEST-PROOF",
      "2026-09-25T09:00:00.000Z", // internal timestamps
      "2026-09-25T09:01:00.000Z",
    ]) {
      expect(bytes).not.toContain(secret);
    }
    // Structural denials: none of the internal containers exist.
    for (const field of [
      "claimedBy",
      "verification",
      "history",
      "observedAt",
      "authenticatedAt",
      "artifacts",
      "actorId",
      "verifiedBy",
    ]) {
      expect(bytes).not.toContain('"' + field + '"');
    }
  });

  test("a smuggled extra field on the stored record never reaches the public view", () => {
    const smuggled = {
      ...hostileClaim(),
      internalNotes: "TOP SECRET operator note",
      capabilities: ["owner.manage"],
    } as unknown as ResourceClaim;
    const bytes = JSON.stringify(projectClaimForViewer(smuggled, "anonymous"));
    expect(bytes).not.toContain("TOP SECRET");
    expect(bytes).not.toContain("capabilities");
    expect(bytes).not.toContain("internalNotes");
  });

  test("observed (unclaimed) and released claims project to the same 4-field shape", () => {
    const observed = createObserved("url-hostiletest0002", null);
    const pub = projectClaimForViewer(observed, "anonymous") as PublicClaimView;
    expect(Object.keys(pub).sort()).toEqual(PUBLIC_KEYS);
    expect(pub.state).toBe("observed");
    expect(pub.sourceUrl).toBeNull();
  });
});

describe("claim projection: authorized viewers", () => {
  test("owner receives the full stored record (manage the claim)", () => {
    const full = hostileClaim();
    const projected = projectClaimForViewer(full, "owner");
    expect(projected).toBe(full);
    const rec = projected as ResourceClaim;
    expect(rec.claimedBy?.actorId).toBe(SECRET_ACTOR_ID);
    expect(rec.verification?.artifacts["token-digest"]).toBe(SECRET_DIGEST);
    expect(rec.history.length).toBeGreaterThan(0);
  });

  test("internal receives the full stored record", () => {
    const full = hostileClaim();
    expect(projectClaimForViewer(full, "internal")).toBe(full);
  });
});

describe("claim projection: fail closed", () => {
  test.each<ClaimViewerKind>(["anonymous", "owner", "internal", "unknown"])(
    "null/undefined/non-object records project to null for viewer %s",
    (viewer) => {
      expect(projectClaimForViewer(null, viewer)).toBeNull();
      expect(projectClaimForViewer(undefined, viewer)).toBeNull();
      expect(
        projectClaimForViewer("not-a-record" as unknown as ResourceClaim, viewer),
      ).toBeNull();
    },
  );

  test("unknown viewer gets null even for a valid rich record", () => {
    expect(projectClaimForViewer(hostileClaim(), "unknown")).toBeNull();
  });

  test("unknown viewer string (cast) fails closed, never defaults to public", () => {
    const sneaky = "superuser" as unknown as ClaimViewerKind;
    expect(projectClaimForViewer(hostileClaim(), sneaky)).toBeNull();
  });

  test("projection version is pinned and documented", () => {
    expect(CLAIM_PROJECTION_VERSION).toBe("fyd.claim-projection@1");
  });
});
