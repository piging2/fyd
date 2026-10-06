/**
 * Owner visibility tri-state regression (TRACK B, 2026-09-25, FYD product
 * authority directive, Nolan: SHOW / HIDE / DEFAULT).
 *
 * SOURCE FACT != OWNER PRESENTATION POLICY. The owner's preference is a
 * presentation policy; hiding must never mutate the source observation or
 * delete evidence. This test walks one site through the full preference
 * lifecycle against the real public projection boundary and asserts, at
 * every step, what the anonymous public sees AND what the source still
 * holds:
 *
 *   DEFAULT: no owner decision; the conservative default applies
 *            (address-bearing fields coarsen to city level, never verbatim
 *            street detail).
 *   HIDE:    the anonymous projection carries zero address disclosure;
 *            the source observation + evidence/provenance are untouched.
 *   SHOW:    the address is restored verbatim in the public projection.
 *   DEFAULT: withdrawing the preference (append-only) returns to the
 *            conservative default; the hide/show history stays in the log.
 *
 * Uses a temp FYD_OWNER_DIR; no network, no real tenant state.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PingObject } from "@/lib/ping/types";
import type { PingRelationship } from "@/lib/ping/types";
import type { ObjectGraph } from "../types";
import { applyOwnerCommand } from "../../object/owner-store";
import { readOwnerEvents } from "../../object/owner-events";
import { resolveFieldVisibility } from "../field-visibility";
import {
  decisionsForGraph,
  verifyPublicProjection,
} from "../public-projection";

const SITE_ID = "tristate-test-site";
const BIZ_ID = "tristate-test-site-biz";
const LOC_ID = "tristate-test-site-biz-location";
const SECRET_STREET = "123 Hidden Lane";
const TOWN = "Secrecyville";
const FULL_ADDRESS = `${SECRET_STREET}, ${TOWN}, CO 00000`;
const COARSE_ADDRESS = `${TOWN}, CO 00000`;

function obj(partial: Partial<PingObject> & { id: string }): PingObject {
  return {
    schema: "ping.social.business@1",
    controllerId: "web:test",
    visibility: "public",
    title: "Tristate Test Co",
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

/** The SOURCE graph: street address + evidence/provenance on the location. */
function sourceGraph(): ObjectGraph {
  const rel: PingRelationship = {
    id: "rel-1",
    subject: BIZ_ID,
    predicate: "located_at",
    object: LOC_ID,
    status: "active",
    createdAt: "2026-09-25T00:00:00Z",
    evidenceRef: "web:test",
  };
  return {
    objects: [
      obj({ id: BIZ_ID, fields: { phone: "+15551234567" } }),
      obj({
        id: LOC_ID,
        schema: "ping.social.location@1",
        title: "Tristate Test Co location",
        fields: { address: FULL_ADDRESS },
      }),
    ],
    relationships: [rel],
  };
}

function anonymousDump(siteId?: string): string {
  const decisions = decisionsForGraph(sourceGraph(), siteId);
  const verified = verifyPublicProjection(sourceGraph(), decisions, "anonymous");
  return JSON.stringify(verified.graph);
}

describe("owner visibility tri-state (SHOW/HIDE/DEFAULT)", () => {
  let dir: string;
  let saved: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fyd-tristate-test-"));
    saved = process.env.FYD_OWNER_DIR;
    process.env.FYD_OWNER_DIR = dir;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.FYD_OWNER_DIR;
    else process.env.FYD_OWNER_DIR = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  function setVisibility(v: "show" | "hide" | "default") {
    return applyOwnerCommand(
      SITE_ID,
      { type: "set-address-visibility", visibility: v },
      [],
      new Map(),
      { actorLabel: "tristate-test" },
    );
  }

  test("DEFAULT: no owner decision; the conservative default coarsens the address", () => {
    const decisions = decisionsForGraph(sourceGraph(), SITE_ID);
    // DEFAULT emits no owner decision for the address.
    expect(
      decisions.filter((d) => d.objectId === BIZ_ID && d.field === "address"),
    ).toEqual([]);
    // The conservative default, not an owner override, governs.
    expect(resolveFieldVisibility(BIZ_ID, "address", decisions, FULL_ADDRESS)).toEqual({
      policy: "coarse",
      source: "conservative_default",
    });
    const dumped = anonymousDump(SITE_ID);
    // Coarse: city survives, the street never appears verbatim.
    expect(dumped).toContain(COARSE_ADDRESS);
    expect(dumped).not.toContain(SECRET_STREET);
  });

  test("HIDE: zero disclosure in the public projection; source + evidence untouched", () => {
    const src = sourceGraph();
    setVisibility("hide");

    const decisions = decisionsForGraph(src, SITE_ID);
    const hits = decisions.filter(
      (d) => d.objectId === BIZ_ID && d.field === "address",
    );
    expect(hits.length).toBe(1);
    expect(hits[0].policy).toBe("hide");
    expect(hits[0].decidedBy).toBe("owner");
    expect(hits[0].source).toBe("owner_override");

    const verified = verifyPublicProjection(src, decisions, "anonymous");
    const dumped = JSON.stringify(verified.graph);
    expect(dumped).not.toContain(SECRET_STREET);
    expect(dumped).not.toContain(TOWN);

    // SOURCE FACT != OWNER PRESENTATION POLICY: the source observation,
    // its evidence reference, and its provenance are all intact.
    const loc = src.objects.find((o) => o.id === LOC_ID);
    expect(loc?.fields["address"]).toBe(FULL_ADDRESS);
    expect(loc?.provenance).toMatchObject({ kind: "website-derived", ref: "web:test" });
    expect(src.relationships[0]?.evidenceRef).toBe("web:test");
    // The owner projection still sees the address (management, not leak).
    const ownerDumped = JSON.stringify(
      verifyPublicProjection(src, decisions, "owner").graph,
    );
    expect(ownerDumped).toContain(SECRET_STREET);
  });

  test("SHOW: the address is restored verbatim in the public projection", () => {
    setVisibility("hide");
    setVisibility("show");

    const decisions = decisionsForGraph(sourceGraph(), SITE_ID);
    const hits = decisions.filter(
      (d) => d.objectId === BIZ_ID && d.field === "address",
    );
    expect(hits.length).toBe(1);
    expect(hits[0].policy).toBe("show");
    expect(hits[0].decidedBy).toBe("owner");
    expect(
      resolveFieldVisibility(BIZ_ID, "address", decisions, FULL_ADDRESS),
    ).toEqual({ policy: "show", source: "owner_override" });

    const dumped = anonymousDump(SITE_ID);
    expect(dumped).toContain(FULL_ADDRESS);
  });

  test("DEFAULT after HIDE/SHOW: the preference is withdrawn, append-only; history survives", () => {
    const src = sourceGraph();
    setVisibility("hide");
    setVisibility("show");
    setVisibility("default");

    // DEFAULT emits no owner decision: the conservative default applies again.
    const decisions = decisionsForGraph(src, SITE_ID);
    expect(
      decisions.filter((d) => d.objectId === BIZ_ID && d.field === "address"),
    ).toEqual([]);
    const dumped = anonymousDump(SITE_ID);
    expect(dumped).toContain(COARSE_ADDRESS);
    expect(dumped).not.toContain(SECRET_STREET);

    // The event log is append-only: hide, show, defaulted. Nothing deleted.
    const events = readOwnerEvents(SITE_ID);
    expect(events.map((e) => e.type)).toEqual([
      "owner.hid-fact",
      "owner.restored-fact",
      "owner.defaulted-fact",
    ]);

    // The source observation and its evidence survive the whole lifecycle.
    const loc = src.objects.find((o) => o.id === LOC_ID);
    expect(loc?.fields["address"]).toBe(FULL_ADDRESS);
    expect(loc?.provenance).toMatchObject({ kind: "website-derived", ref: "web:test" });
  });
});
