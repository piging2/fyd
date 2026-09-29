/**
 * PROD-8: the customize panel's load path (overrides route GET) surfaces
 * orphaned corrections.
 *
 * A seeded owner journal holds a service-order correction naming services
 * that do not exist in the current projection graph. The GET response
 * must carry it in `orphanedCorrections` with the owner-facing warning
 * text, so the customize panel can render the warning instead of
 * silently ignoring the correction. The journal is read-only on GET.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { applyOwnerCommand } from "@/fyd/object/owner-store";
import { GET } from "../route";

jest.mock("@/lib/ping/session", () => ({ getPracticeIdentityId: async () => null }));

const OBJECT_ID = "happy-place";
const WARNING =
  "This correction does not apply to anything. ";

function get(objectId = OBJECT_ID) {
  const params = Promise.resolve({ objectId });
  return { params };
}

async function callGet(objectId = OBJECT_ID) {
  const resp = await GET({} as NextRequest, get(objectId));
  return { status: resp.status, body: (await resp.json()) as Record<string, unknown> };
}

beforeEach(() => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-owner-get-test-"));
});

describe("PROD-8: overrides GET surfaces orphaned corrections", () => {
  test("fresh journal: no orphaned corrections", async () => {
    const { status, body } = await callGet();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.orphanedCorrections).toEqual([]);
  });

  test("orphaned service-order correction is carried with the owner-facing warning", async () => {
    // Seed a service order naming services that do not exist in the
    // current projection graph (the Mission-O seq-12 shape).
    applyOwnerCommand(
      OBJECT_ID,
      { type: "move-service", id: "svc-decks", to: "first" },
      ["svc-decks", "svc-fences"],
      new Map([
        ["svc-decks", "Decks"],
        ["svc-fences", "Fences"],
      ]),
    );
    const { status, body } = await callGet();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const orphans = body.orphanedCorrections as {
      target: string;
      reason: string;
      detail: string;
      correction: unknown;
    }[];
    expect(orphans).toHaveLength(1);
    expect(orphans[0].target).toBe("services:order");
    expect(orphans[0].reason).toBe("service-order-orphaned");
    expect(orphans[0].correction).toBeNull();
    expect(orphans[0].detail).toContain(WARNING);
  });
});
