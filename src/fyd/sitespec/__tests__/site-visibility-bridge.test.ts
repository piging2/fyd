/**
 * Site-keyed owner visibility bridge (privacy P0 regression, 2026-09-25).
 *
 * The owner-management routes key owner state by SITE ID (G4: the object id
 * IS the site id), while the public projection boundary resolved visibility
 * decisions only from logs keyed by GRAPH OBJECT ID. A site-level "hide the
 * address" decision was therefore durable but invisible to the boundary:
 * the owner believed the address was hidden while the public API still
 * served it. decisionsForGraph(graph, siteId) bridges the site-keyed log
 * onto the site's business object(s); the zero-disclosure traversal then
 * cuts located_at and orphaned location objects.
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
import {
  decisionsForGraph,
  verifyPublicProjection,
} from "../public-projection";

const SITE_ID = "bridge-test-site";
const BIZ_ID = "bridge-test-site-biz";
const LOC_ID = "bridge-test-site-biz-location";
const SECRET_STREET = "123 Hidden Lane";
const SECRET_TOWN = "Secrecyville";

function obj(partial: Partial<PingObject> & { id: string }): PingObject {
  return {
    schema: "ping.social.business@1",
    controllerId: "web:test",
    visibility: "public",
    title: "Bridge Test Co",
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

function graph(): ObjectGraph {
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
        title: "Bridge Test Co location",
        fields: {
          address: SECRET_STREET,
          locality: SECRET_TOWN,
        },
      }),
    ],
    relationships: [rel],
  };
}

describe("site-keyed owner visibility bridge", () => {
  let dir: string;
  let saved: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fyd-bridge-test-"));
    saved = process.env.FYD_OWNER_DIR;
    process.env.FYD_OWNER_DIR = dir;
    // What the overrides route does: owner state keyed by SITE ID.
    applyOwnerCommand(
      SITE_ID,
      { type: "set-address-visibility", visibility: "hide" },
      [],
      new Map(),
      { actorLabel: "bridge-test" },
    );
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.FYD_OWNER_DIR;
    else process.env.FYD_OWNER_DIR = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  test("site-keyed hide decision reaches the business object", () => {
    const decisions = decisionsForGraph(graph(), SITE_ID);
    const hits = decisions.filter(
      (d) =>
        d.objectId === BIZ_ID && d.field === "address" && d.policy === "hide",
    );
    expect(hits.length).toBe(1);
    expect(hits[0].source).toBe("owner_override");
  });

  test("without the site id the decision is invisible (the old leak)", () => {
    const decisions = decisionsForGraph(graph());
    expect(decisions.length).toBe(0);
  });

  test("anonymous projection has zero address disclosure", () => {
    const decisions = decisionsForGraph(graph(), SITE_ID);
    const verified = verifyPublicProjection(graph(), decisions, "anonymous");
    const dumped = JSON.stringify(verified.graph);
    expect(dumped).not.toContain(SECRET_STREET);
    expect(dumped).not.toContain(SECRET_TOWN);
    // The orphaned location object is dropped by the traversal cut.
    expect(verified.graph.objects.some((o) => o.id === LOC_ID)).toBe(false);
    // FIELD A (phone) stays public.
    expect(dumped).toContain("+15551234567");
  });

  test("owner projection still sees the address (management, not leak)", () => {
    const decisions = decisionsForGraph(graph(), SITE_ID);
    const verified = verifyPublicProjection(graph(), decisions, "owner");
    expect(JSON.stringify(verified.graph)).toContain(SECRET_STREET);
  });

  test("no double emit when site id equals a graph object id", () => {
    // Decision written directly under the graph object id (not the site id).
    applyOwnerCommand(
      BIZ_ID,
      { type: "set-address-visibility", visibility: "hide" },
      [],
      new Map(),
      { actorLabel: "bridge-test" },
    );
    const decisions = decisionsForGraph(graph(), BIZ_ID);
    const hits = decisions.filter(
      (d) =>
        d.objectId === BIZ_ID && d.field === "address" && d.policy === "hide",
    );
    // Per-object loop already read the BIZ_ID log; bridge must not duplicate.
    expect(hits.length).toBe(1);
  });
});
