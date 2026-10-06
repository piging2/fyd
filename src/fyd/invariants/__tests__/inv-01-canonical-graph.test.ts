/**
 * INV-01: same input -> same canonical graph.
 *
 * Machinery under test (real, on the Pig):
 *   src/fyd/owner-mode/facts.ts        extractSiteFacts / factIdFor
 *   src/fyd/proceduralize/generator.ts generateSiteSpec
 *   src/fyd/builder/canonical.ts       semanticDigestOf
 *
 * Relationship to adjacent lanes: LANE-REG proved byte-identity for two
 * generations of the SAME fixture bytes. This probe EXTENDS it: the input
 * graph is deterministically permuted (reversed object/relationship order,
 * deep clone) and the canonical graph + semantic spec digest must still
 * agree. At factory scale the same business will arrive in many emission
 * orders; the canonical graph must not depend on arrival order.
 */

import { extractSiteFacts, factIdFor } from "../../owner-mode/facts";
import { generateSiteSpec } from "../../proceduralize/generator";
import { canonicalizeSpec, semanticDigestOf } from "../../builder/canonical";
import {
  PIN_GENERATED_AT,
  T0,
  clearwaterGraph,
  factKey,
  reversedGraph,
} from "./support";

describe("INV-01 same input -> same canonical graph", () => {
  const graph = clearwaterGraph();

  test("byte-identical input (deep clone) -> identical fact stream", () => {
    const clone = JSON.parse(JSON.stringify(graph));
    expect(extractSiteFacts(clone, T0)).toEqual(extractSiteFacts(graph, T0));
  });

  test("reordered input -> same canonical fact SET (order-independent identity)", () => {
    const a = extractSiteFacts(graph, T0).map(factKey).sort();
    const b = extractSiteFacts(reversedGraph(graph), T0).map(factKey).sort();
    expect(b).toEqual(a);
  });

  test("fact ids are content-derived, never positional", () => {
    const again = factIdFor("cw-biz-01", "hours", 0);
    expect(again).toBe(factIdFor("cw-biz-01", "hours", 0));
    const facts = extractSiteFacts(graph, T0);
    const hours = facts.find(
      (f) => f.objectId === "cw-biz-01" && f.field === "hours",
    );
    expect(hours).toBeDefined();
    expect(hours?.factId).toBe(factIdFor("cw-biz-01", "hours", 0));
    // The conflicting GBP hours fact has a DIFFERENT id (different object).
    const gbp = facts.find(
      (f) => f.objectId === "cw-ext-gbp-01" && f.field === "hours",
    );
    expect(gbp).toBeDefined();
    expect(gbp?.factId).not.toBe(hours?.factId);
  });

  test("same content in any order -> same semantic spec digest", () => {
    const d1 = semanticDigestOf(
      generateSiteSpec(graph, { generatedAt: PIN_GENERATED_AT }),
    );
    const d2 = semanticDigestOf(
      generateSiteSpec(reversedGraph(graph), { generatedAt: PIN_GENERATED_AT }),
    );
    expect(d1).toMatch(/^[0-9a-f]{64}$/);
    expect(d2).toBe(d1);
  });

  test("canonicalizeSpec strips volatile stamps (no timestamps in semantics)", () => {
    const withStamps = JSON.parse(
      canonicalizeSpec(
        generateSiteSpec(graph, { generatedAt: PIN_GENERATED_AT }),
      ),
    ) as unknown;
    const serialized = JSON.stringify(withStamps);
    expect(serialized).not.toContain("generatedAt");
    expect(serialized).not.toContain(PIN_GENERATED_AT);
  });
});
