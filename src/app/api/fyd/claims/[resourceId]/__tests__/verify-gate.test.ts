/**
 * Demo-owner-mode gate tests for POST /api/fyd/claims/[resourceId]/verify.
 *
 * Verification WRITES claim state (CLAIMED -> VERIFIED-CONTROLLED), so it
 * requires DEV/DEMO OWNER MODE (NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1) on a
 * localhost/private-network host. Anything else fails closed with a typed
 * 403 demo_owner_mode_required and nothing is written.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { POST } from "../verify/route";

const DEMO_ENV_VAR = "NEXT_PUBLIC_FYD_DEMO_OWNER_MODE";
const OLD_DEMO_ENV = process.env[DEMO_ENV_VAR];

function req(body: unknown, host = "localhost:3000") {
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
    params: Promise.resolve({ resourceId: "happy-place" }),
  };
}

async function call(body: unknown, host = "localhost:3000") {
  const { req: r, params } = req(body, host);
  const resp = await POST(r, { params });
  return {
    status: resp.status,
    body: (await resp.json()) as Record<string, unknown>,
  };
}

beforeEach(() => {
  process.env.FYD_CLAIM_DIR = mkdtempSync(join(tmpdir(), "fyd-claim-test-"));
  process.env[DEMO_ENV_VAR] = "1";
});

afterEach(() => {
  if (OLD_DEMO_ENV === undefined) delete process.env[DEMO_ENV_VAR];
  else process.env[DEMO_ENV_VAR] = OLD_DEMO_ENV;
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
});
