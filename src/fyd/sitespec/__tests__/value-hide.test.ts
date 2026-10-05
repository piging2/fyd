/**
 * Value-level hide (Item 8, O2).
 *
 * Fact-level hide drops the addressed fact (the business's address) and the
 * zero-disclosure traversal cuts located_at. The residual gap: a second,
 * independently-modeled fact holding the IDENTICAL address string (a
 * home-based consultant's address duplicated on a service-area object with
 * no located_at edge) still surfaces, defeating the owner's intent that
 * the address "must not be public".
 *
 * Minimal coherent semantic: a hide decision on an address-family field
 * captures the hidden VALUES at decision time; the projection drops any
 * field on any object whose normalized value matches. Normalization is
 * case-insensitive + whitespace-collapsed; comparison is exact on the
 * normalized form (no fuzzy matching, by design).
 *
 * Uses a temp FYD_OWNER_DIR; no network, no real tenant state.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PingObject } from "@/lib/ping/types";
import type { ObjectGraph } from "../types";
import { applyOwnerCommand } from "../../object/owner-store";
import {
  applyFieldVisibility,
  normalizeHiddenValue,
} from "../field-visibility";
import { decisionsForGraph } from "../public-projection";

const SITE_ID = "valuehide-test-site";
const BIZ_ID = "valuehide-test-site-biz";
const DUP_ID = "valuehide-test-site-service-area";
const OTHER_ID = "valuehide-test-site-other";

const HIDDEN_STREET = "123 Hidden Lane";
const TOWN = "Secrecyville";
const FULL_ADDRESS = `${HIDDEN_STREET}, ${TOWN}, CO 00000`;
const OTHER_ADDRESS = "999 Other Rd, Otherville, CO 11111";

function obj(partial: Partial<PingObject> & { id: string }): PingObject {
  return {
    schema: "ping.social.business@1",
    controllerId: "web:test",
    visibility: "public",
    title: "Value Hide Test Co",
    description: "test",
    fields: {},
    createdAt: "2026-09-25T00:00:00Z",
    updatedAt: "2026-09-25T00:00:00Z",
    provenance: {
      kind: "website-derived",
      ref: "web:test",
      derivedAt: "2026-09-25T00:00:00Z",
    },
    ...partial,
  } as PingObject;
}

function sourceGraph(): ObjectGraph {
  return {
    objects: [
      obj({ id: BIZ_ID, fields: { phone: "+15551234567", address: FULL_ADDRESS } }),
      // Independently-modeled duplicate of the same address string
      // (different case + padding, no located_at edge): the residual gap
      // fact-level hide leaves open.
      obj({
        id: DUP_ID,
        schema: "ping.social.service-area@1",
        title: "Service area",
        fields: {
          address: `  ${HIDDEN_STREET.toLowerCase()}, ${TOWN}, CO 00000 `,
        },
      }),
      obj({
        id: OTHER_ID,
        schema: "ping.social.service-area@1",
        title: "Other area",
        fields: { address: OTHER_ADDRESS },
      }),
    ],
    relationships: [],
  };
}

describe("value-level hide (O2)", () => {
  let dir: string;
  let saved: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fyd-valuehide-test-"));
    saved = process.env.FYD_OWNER_DIR;
    process.env.FYD_OWNER_DIR = dir;
    applyOwnerCommand(
      SITE_ID,
      { type: "set-address-visibility", visibility: "hide" },
      [],
      new Map(),
      { actorLabel: "valuehide-test" },
    );
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.FYD_OWNER_DIR;
    else process.env.FYD_OWNER_DIR = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  test("hide decision captures the hidden value at decision time", () => {
    const decisions = decisionsForGraph(sourceGraph(), SITE_ID);
    const hide = decisions.find(
      (d) => d.objectId === BIZ_ID && d.policy === "hide",
    );
    expect(hide).toBeDefined();
    expect(hide!.hiddenValues).toContain(normalizeHiddenValue(FULL_ADDRESS));
  });

  test("duplicated fact holding the identical string is dropped", () => {
    const projected = applyFieldVisibility(
      sourceGraph(),
      decisionsForGraph(sourceGraph(), SITE_ID),
    );
    const dup = projected.objects.find((o) => o.id === DUP_ID)!;
    expect(dup.fields).not.toHaveProperty("address");
  });

  test("the addressed fact itself is still dropped (fact-level intact)", () => {
    const projected = applyFieldVisibility(
      sourceGraph(),
      decisionsForGraph(sourceGraph(), SITE_ID),
    );
    const biz = projected.objects.find((o) => o.id === BIZ_ID)!;
    expect(biz.fields).not.toHaveProperty("address");
    // Non-address facts are untouched.
    expect(biz.fields.phone).toBe("+15551234567");
  });

  test("an unrelated address is not collateral: conservative default coarsens", () => {
    const projected = applyFieldVisibility(
      sourceGraph(),
      decisionsForGraph(sourceGraph(), SITE_ID),
    );
    const other = projected.objects.find((o) => o.id === OTHER_ID)!;
    expect(other.fields.address).toBe("Otherville, CO 11111");
  });

  test("normalizer is case- and whitespace-insensitive", () => {
    expect(normalizeHiddenValue("  123 Hidden LANE ")).toBe(
      normalizeHiddenValue("123 hidden lane"),
    );
  });
});
