/**
 * Demo-owner-mode gate tests for POST /api/fyd/claims/[resourceId]/verify.
 *
 * Verification WRITES claim state (CLAIMED -> VERIFIED-CONTROLLED), so it
 * requires DEV/DEMO OWNER MODE (NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1) on a
 * localhost/private-network host. Anything else fails closed with a typed
 * 403 demo_owner_mode_required and nothing is written.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { POST } from "../verify/route";
import { claim, createObserved } from "@/fyd/claim/machine";
import { readClaim, writeClaim } from "@/fyd/claim/store";

const DEMO_ENV_VAR = "NEXT_PUBLIC_FYD_DEMO_OWNER_MODE";
const OLD_DEMO_ENV = process.env[DEMO_ENV_VAR];
const OLD_CLAIM_DIR = process.env.FYD_CLAIM_DIR;
const OLD_DEV_HOSTS = process.env.FYD_DEV_OWNER_HOSTS;
let claimDirectory: string;

function req(body: unknown, host = "localhost:3000", resourceId = "happy-place") {
  return {
    req: {
      json: async () => {
        if (body === null) throw new Error("no body");
        return body;
      },
      headers: {
        get: (name: string) => (name.toLowerCase() === "host" ? host : null),
      },
    } as unknown as NextRequest,
    params: Promise.resolve({ resourceId }),
  };
}

async function call(body: unknown, host = "localhost:3000", resourceId = "happy-place") {
  const { req: r, params } = req(body, host, resourceId);
  const resp = await POST(r, { params });
  return {
    status: resp.status,
    body: (await resp.json()) as Record<string, unknown>,
  };
}

beforeEach(() => {
  claimDirectory = mkdtempSync(join(tmpdir(), "fyd-claim-test-"));
  process.env.FYD_CLAIM_DIR = claimDirectory;
  process.env[DEMO_ENV_VAR] = "1";
  delete process.env.FYD_DEV_OWNER_HOSTS;
});

afterEach(() => {
  if (OLD_DEMO_ENV === undefined) delete process.env[DEMO_ENV_VAR];
  else process.env[DEMO_ENV_VAR] = OLD_DEMO_ENV;
  if (OLD_CLAIM_DIR === undefined) delete process.env.FYD_CLAIM_DIR;
  else process.env.FYD_CLAIM_DIR = OLD_CLAIM_DIR;
  if (OLD_DEV_HOSTS === undefined) delete process.env.FYD_DEV_OWNER_HOSTS;
  else process.env.FYD_DEV_OWNER_HOSTS = OLD_DEV_HOSTS;
  rmSync(claimDirectory, { recursive: true, force: true });
});

describe("verify route demo-owner-mode gate", () => {
  test("env unset: denied with typed 403, nothing written", async () => {
    delete process.env[DEMO_ENV_VAR];
    const { status, body } = await call({
      method: "operator-attestation",
      basis: "I am the operator and I control this resource.",
      operatorLabel: "demo operator",
    });
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("demo_owner_mode_required");
    expect(String(body.error)).toMatch(
      /DEMO OWNER MODE - not real authentication/,
    );
  });

  test("env on but public host: denied with typed 403", async () => {
    const { status, body } = await call(
      {
        method: "operator-attestation",
        basis: "I am the operator and I control this resource.",
        operatorLabel: "demo operator",
      },
      "fyd.example.com",
    );
    expect(status).toBe(403);
    expect(body.code).toBe("demo_owner_mode_required");
    expect(body.demoOwnerMode).toBe(true);
    expect(body.hostPrivate).toBe(false);
  });

  test("env on + localhost: gate passes (reaches method validation)", async () => {
    // No body: the gate passes and the route proceeds to body parsing,
    // which fails with 400 invalid-body. That 400 proves the 403 gate let
    // the request through.
    const { status, body } = await call(null);
    expect(status).toBe(400);
    expect(body.code).toBe("invalid-body");
  });

  test.each([
    { enabled: false, host: "localhost:3000" },
    { enabled: true, host: "fyd.example.com" },
    { enabled: true, host: "" },
  ])("denied request cannot verify an existing claim: %j", async ({ enabled, host }) => {
    const before = claim(createObserved("url-fixture"), {
      kind: "demo-owner", actorId: "fixture-owner", actorLabel: "Fixture owner",
      authenticatedAt: "2026-11-12T00:00:00.000Z",
      authNote: "DEMO OWNER MODE - not real authentication.",
    });
    writeClaim(before);
    if (!enabled) delete process.env[DEMO_ENV_VAR];
    const { status } = await call({ method: "operator-attestation", basis: "I control the fixture resource." }, host, before.resourceId);
    expect(status).toBe(403);
    expect(readClaim(before.resourceId)).toEqual(before);
  });

  test("explicit demo owner on localhost can verify the existing claim", async () => {
    const before = claim(createObserved("url-fixture"), {
      kind: "demo-owner", actorId: "fixture-owner", actorLabel: "Fixture owner",
      authenticatedAt: "2026-11-12T00:00:00.000Z",
      authNote: "DEMO OWNER MODE - not real authentication.",
    });
    writeClaim(before);
    const { status } = await call({ method: "operator-attestation", basis: "I control the fixture resource." }, "localhost:3000", before.resourceId);
    expect(status).toBe(200);
    const after = readClaim(before.resourceId)!;
    expect(after.state).toBe("verified-controlled");
    expect(after.history.slice(0, before.history.length)).toEqual(before.history);
    expect(after.history.at(-1)?.type).toBe("verified");
  });
});
