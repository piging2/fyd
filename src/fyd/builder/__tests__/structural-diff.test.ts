/**
 * Structural diff: the two-tenant material-difference proof.
 * Same planner, different tenants -> materially different output.
 */
import { planSite } from "../planner";
import { COPPERSMITH_VECTOR, PING_DOGFOOD_VECTOR } from "../dimensions";
import { diffSiteSpecs, renderStructuralDiffReport } from "../structural-diff";
import { knowledgeGraph, tradeGraph } from "./fixtures";

const STAMP = "2026-09-21T12:00:00.000Z";

describe("structural diff", () => {
  test("trade tenant vs knowledge tenant: materially different", () => {
    const trade = planSite({
      ctx: { tenantId: "trade-tenant" },
      graph: tradeGraph(),
      vector: COPPERSMITH_VECTOR,
      generatedAt: STAMP,
    });
    const know = planSite({
      ctx: { tenantId: "knowledge-tenant" },
      graph: knowledgeGraph(),
      vector: PING_DOGFOOD_VECTOR,
      generatedAt: STAMP,
    });
    const d = diffSiteSpecs(trade.spec, know.spec, {
      tenantA: "trade-tenant",
      tenantB: "knowledge-tenant",
      digestA: trade.semanticDigest,
      digestB: know.semanticDigest,
      plannerVersion: trade.plannerVersion,
    });
    expect(d.materiallyDifferent).toBe(true);
    expect(d.materialReasons.length).toBeGreaterThan(0);
    // The knowledge graph has 2 posts vs 1 and a different object mix.
    expect(d.pageDiffs.length).toBeGreaterThan(0);
    const report = renderStructuralDiffReport(d);
    expect(report).toContain("trade-tenant");
    expect(report).toContain("knowledge-tenant");
  });

  test("same tenant, same inputs: no material difference", () => {
    const a = planSite({
      ctx: { tenantId: "trade-tenant" },
      graph: tradeGraph(),
      vector: COPPERSMITH_VECTOR,
      generatedAt: STAMP,
    });
    const b = planSite({
      ctx: { tenantId: "trade-tenant" },
      graph: tradeGraph(),
      vector: COPPERSMITH_VECTOR,
      generatedAt: "2026-09-22T00:00:00.000Z",
    });
    const d = diffSiteSpecs(a.spec, b.spec, {
      tenantA: "trade-tenant",
      tenantB: "trade-tenant",
      digestA: a.semanticDigest,
      digestB: b.semanticDigest,
      plannerVersion: a.plannerVersion,
    });
    expect(d.materiallyDifferent).toBe(false);
    expect(d.materialReasons).toEqual([]);
  });
});
