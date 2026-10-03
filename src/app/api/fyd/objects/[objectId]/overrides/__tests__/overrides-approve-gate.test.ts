/**
 * P0 2026-10-03: the overrides route approve stage is the only stage that
 * mutates the owner store. It must be DEVELOPMENT OWNER MODE only
 * (NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1 on a localhost/private-network/explicit
 * dev host). A spoofed public Host must get 403 demo_owner_mode_required
 * before any input is processed; a localhost host must pass the gate (and
 * then fail on the missing preview digests, proving the gate let it through).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST } from "../route";

jest.mock("@/lib/ping/session", () => ({ getPracticeIdentityId: async () => null }));

const OBJECT_ID = "happy-place";
const SPOOFED_HOST = "evil.example.com";

function approveRequest(host: string): NextRequest {
  const url = `https://${host}/api/fyd/objects/${OBJECT_ID}/overrides`;
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", host },
    body: JSON.stringify({ stage: "approve", command: { type: "noop" } }),
  });
}

async function callApprove(host: string) {
  const params = Promise.resolve({ objectId: OBJECT_ID });
  const resp = await POST(approveRequest(host), { params });
  return { status: resp.status, body: (await resp.json()) as Record<string, unknown> };
}

describe("P0: overrides approve stage requires DEVELOPMENT OWNER MODE", () => {
  const ORIGINAL_MODE = process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE;
  const ORIGINAL_OWNER_DIR = process.env.FYD_OWNER_DIR;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE = "1";
    process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-owner-p0-test-"));
  });

  afterEach(() => {
    if (ORIGINAL_MODE === undefined) delete process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE;
    else process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE = ORIGINAL_MODE;
    if (ORIGINAL_OWNER_DIR === undefined) delete process.env.FYD_OWNER_DIR;
    else process.env.FYD_OWNER_DIR = ORIGINAL_OWNER_DIR;
  });

  test("spoofed public Host: approve is denied 403 before input processing", async () => {
    const { status, body } = await callApprove(SPOOFED_HOST);
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("demo_owner_mode_required");
    expect(String(body.error)).toMatch(/not real authentication/i);
  });

  test("localhost host: approve passes the host gate (fails later on missing digests)", async () => {
    const { status, body } = await callApprove("localhost:3000");
    // 400 approval_not_bound proves the request got PAST the 403 host gate
    // and into input validation: the gate let a dev host through.
    expect(status).toBe(400);
    expect(body.code).toBe("approval_not_bound");
  });

  test("demo mode off: approve is denied even on localhost", async () => {
    process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE = "0";
    const { status, body } = await callApprove("localhost:3000");
    expect(status).toBe(403);
    expect(body.code).toBe("demo_owner_mode_required");
  });
});
