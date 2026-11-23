/**
 * S3-03 repair, Stage A negatives (desk charge 2026-11-20, on the evidence
 * of VERDICT-S3-03.md). Written against the UNMODIFIED routes; every case
 * must fail (red) before the fix lands.
 *
 * Charged legs, on local main:
 * 1. POST verify resolves identity through the claim bridge
 *    (resolveClaimIdentity) and fails closed 401 identity-required on null
 *    BEFORE attestOperatorControl: an unauthenticated verify attempt is
 *    refused and the stored record is unchanged.
 * 2. POST claim and POST release carry the env-plus-host gate the
 *    overrides approve stage applies: NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1
 *    AND isDevOwnerHost(host), else 403 demo_owner_mode_required in the
 *    approve stage's shape (error text, demoOwnerMode, hostPrivate).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { POST as verifyPOST } from "../verify/route";
import { POST as claimPOST } from "../claim/route";
import { POST as releasePOST } from "../release/route";
import { claim, createObserved } from "@/fyd/claim/machine";
import { readClaim, writeClaim } from "@/fyd/claim/store";
import type { ClaimedIdentity } from "@/fyd/claim/types";
import { DEMO_OWNER_ACTOR } from "@/fyd/owner-mode/capability";

const DEMO_ENV_VAR = "NEXT_PUBLIC_FYD_DEMO_OWNER_MODE";
const OLD_DEMO_ENV = process.env[DEMO_ENV_VAR];
const RESOURCE_ID = "acme-plumbing";

function makeReq(body: unknown, host = "localhost:3000") {
  return {
    json: async () => {
      if (body === null) throw new Error("no body");
      return body;
    },
    headers: {
      get: (name: string) => (name.toLowerCase() === "host" ? host : null),
    },
  } as unknown as NextRequest;
}

function ctx() {
  return { params: Promise.resolve({ resourceId: RESOURCE_ID }) };
}

function seedClaimed(): void {
  const identity: ClaimedIdentity = {
    kind: "demo-owner",
    actorId: DEMO_OWNER_ACTOR.id,
    actorLabel: DEMO_OWNER_ACTOR.label,
    authenticatedAt: new Date().toISOString(),
    authNote: "Seeded by the S3-03 Stage A fixture.",
  };
  writeClaim(claim(createObserved(RESOURCE_ID), identity));
}

beforeEach(() => {
  process.env.FYD_CLAIM_DIR = mkdtempSync(join(tmpdir(), "fyd-claim-s303-"));
  process.env[DEMO_ENV_VAR] = "1";
});

afterEach(() => {
  if (OLD_DEMO_ENV === undefined) delete process.env[DEMO_ENV_VAR];
  else process.env[DEMO_ENV_VAR] = OLD_DEMO_ENV;
  delete process.env.FYD_CLAIM_DIR;
});

describe("S3-03 stage A negatives", () => {
  // A-14, amended under T3 ruling S303-REFUSAL-ORDER-RULING-T3-20261122
  // (record sha256 9b697b88): gate-first governs the flag-off class, so this
  // case expects the gate's 403. As originally written against the
  // uncomposed branch it expected 401 identity-required; measured on the
  // composed tree (Candidate 1): expected 401, received 403.
  test("verify with demo flag off: 403 demo_owner_mode_required, attest never reached, record unchanged", async () => {
    seedClaimed();
    const before = readClaim(RESOURCE_ID);
    delete process.env[DEMO_ENV_VAR];
    const resp = await verifyPOST(
      makeReq({
        method: "operator-attestation",
        basis: "I am the operator and I control this resource.",
        operatorLabel: "mallory",
      }),
      ctx(),
    );
    const body = (await resp.json()) as Record<string, unknown>;
    expect(resp.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("demo_owner_mode_required");
    expect(body.demoOwnerMode).toBe(false);
    expect(body.hostPrivate).toBe(true);
    const after = readClaim(RESOURCE_ID);
    expect(after?.state).toBe("claimed");
    expect(after?.verification).toBeNull();
    expect(after?.history.length).toBe(before?.history.length);
  });

  test("claim from a public host: 403 demo_owner_mode_required, nothing written", async () => {
    const resp = await claimPOST(makeReq({}, "fyd.example.com"), ctx());
    const body = (await resp.json()) as Record<string, unknown>;
    expect(resp.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("demo_owner_mode_required");
    expect(body.demoOwnerMode).toBe(true);
    expect(body.hostPrivate).toBe(false);
    expect(String(body.error)).toMatch(
      /DEMO OWNER MODE - not real authentication/,
    );
    expect(readClaim(RESOURCE_ID)).toBeNull();
  });

  test("claim with demo flag off: 403 demo_owner_mode_required, nothing written", async () => {
    delete process.env[DEMO_ENV_VAR];
    const resp = await claimPOST(makeReq({}), ctx());
    const body = (await resp.json()) as Record<string, unknown>;
    expect(resp.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("demo_owner_mode_required");
    expect(body.demoOwnerMode).toBe(false);
    expect(readClaim(RESOURCE_ID)).toBeNull();
  });

  test("release with demo flag off: 403 demo_owner_mode_required, record unchanged", async () => {
    seedClaimed();
    delete process.env[DEMO_ENV_VAR];
    const resp = await releasePOST(makeReq({}), ctx());
    const body = (await resp.json()) as Record<string, unknown>;
    expect(resp.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("demo_owner_mode_required");
    expect(body.demoOwnerMode).toBe(false);
    expect(readClaim(RESOURCE_ID)?.state).toBe("claimed");
  });
});

describe("S3-03 stage C positives", () => {
  test("verify on the gated path: CLAIMED reaches VERIFIED-CONTROLLED via operator attestation", async () => {
    seedClaimed();
    const resp = await verifyPOST(
      makeReq({
        method: "operator-attestation",
        basis: "I am the operator and I control this resource.",
        operatorLabel: "demo operator",
      }),
      ctx(),
    );
    const body = (await resp.json()) as Record<string, unknown>;
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
    const after = readClaim(RESOURCE_ID);
    expect(after?.state).toBe("verified-controlled");
    expect(after?.verification?.method).toBe("operator-attestation");
  });

  test("claim on a private host with the flag on: OBSERVED reaches CLAIMED", async () => {
    const resp = await claimPOST(makeReq({}), ctx());
    const body = (await resp.json()) as Record<string, unknown>;
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
    const after = readClaim(RESOURCE_ID);
    expect(after?.state).toBe("claimed");
    expect(after?.claimedBy?.actorId).toBe(DEMO_OWNER_ACTOR.id);
  });

  test("release on a private host with the flag on: CLAIMED returns to OBSERVED, history preserved", async () => {
    seedClaimed();
    const before = readClaim(RESOURCE_ID);
    const resp = await releasePOST(makeReq({}), ctx());
    const body = (await resp.json()) as Record<string, unknown>;
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
    const after = readClaim(RESOURCE_ID);
    expect(after?.state).toBe("observed");
    expect(after?.claimedBy).toBeNull();
    expect(after?.history.length).toBeGreaterThan(before?.history.length ?? 0);
  });
});
