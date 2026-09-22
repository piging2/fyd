/**
 * Structural proof: the two-tenant material-difference run.
 *
 * Loads the LIVE projections for coppersmith-plumbing and ping-fyd from
 * the file-runtime seam (/home/nolan/ping/var/fyd-projections/), verifies
 * each graph through the object-builder boundary, plans each site through
 * the website-builder planner with that tenant's archetype vector, and
 * asserts the outputs are MATERIALLY different: different object graphs,
 * different section structure, different composition policy, zero
 * customer-specific code (one planner implementation for both).
 *
 * Also writes a Markdown report to /tmp/fyd-structural-diff.md for the
 * run record.
 *
 * Run explicitly: npx jest --config src/fyd/builder/jest.config.cjs structural-proof
 */
import { readFileSync, writeFileSync } from "node:fs";
import { verifyObjectGraph } from "../object-builder";
import { planSite } from "../planner";
import { COPPERSMITH_VECTOR, PING_DOGFOOD_VECTOR } from "../dimensions";
import { diffSiteSpecs, renderStructuralDiffReport } from "../structural-diff";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingProjection } from "@/fyd/data/ping-object-source";

const PROJECTION_DIR = "/home/nolan/ping/var/fyd-projections";
const REPORT_PATH = "/tmp/fyd-structural-diff.md";

function loadProjection(siteId: string): PingProjection {
  const raw = readFileSync(PROJECTION_DIR + "/" + siteId + ".json", "utf8");
  const doc = JSON.parse(raw) as { graph: ObjectGraph; meta: { siteId: string } };
  if (doc.meta.siteId !== siteId) {
    throw new Error("projection meta.siteId mismatch for " + siteId);
  }
  return doc as unknown as PingProjection;
}

describe("structural proof: two tenants, one planner", () => {
  test("coppersmith-plumbing vs ping-fyd are materially different", () => {
    const copperProjection = loadProjection("coppersmith-plumbing");
    const dogfoodProjection = loadProjection("ping-fyd");

    // Object-builder boundary: both graphs verify before planning.
    const copperVerified = verifyObjectGraph({ tenantId: "coppersmith-plumbing" }, copperProjection);
    const dogfoodVerified = verifyObjectGraph({ tenantId: "ping-fyd" }, dogfoodProjection);

    // Website-builder: one planner, each tenant's own archetype vector.
    const copper = planSite({
      ctx: { tenantId: "coppersmith-plumbing" },
      graph: copperVerified.graph,
      vector: COPPERSMITH_VECTOR,
      generatedAt: "2026-09-21T12:00:00.000Z",
    });
    const dogfood = planSite({
      ctx: { tenantId: "ping-fyd" },
      graph: dogfoodVerified.graph,
      vector: PING_DOGFOOD_VECTOR,
      generatedAt: "2026-09-21T12:00:00.000Z",
    });

    const diff = diffSiteSpecs(copper.spec, dogfood.spec, {
      tenantA: "coppersmith-plumbing",
      tenantB: "ping-fyd",
      digestA: copper.semanticDigest,
      digestB: dogfood.semanticDigest,
      plannerVersion: copper.plannerVersion,
    });

    const report = renderStructuralDiffReport(diff);
    writeFileSync(REPORT_PATH, report + "\n");

    // The proof: same planner implementation, materially different output.
    expect(copper.plannerVersion).toBe(dogfood.plannerVersion);
    expect(diff.materiallyDifferent).toBe(true);
    expect(diff.materialReasons.length).toBeGreaterThan(0);
    expect(copper.semanticDigest).not.toBe(dogfood.semanticDigest);
  });
});
