/**
 * INV-02: same graph + same context -> same site spec.
 *
 * Machinery under test (real, on the Pig):
 *   src/fyd/proceduralize/generator.ts generateSiteSpec
 *   src/fyd/builder/canonical.ts       semanticDigestOf / canonicalizeSpec
 *   src/fyd/owner-mode/provenance.ts   canonicalJson
 *
 * Relationship to adjacent lanes: LANE-REG step 5 proved two fresh
 * generations are byte-identical. This probe EXTENDS it: it pins the
 * canonical.ts law (different generatedAt must still yield the same
 * SEMANTIC digest) and asserts the generator is a pure function of
 * (graph, context) with no hidden clock/randomness across many runs.
 */

import { generateSiteSpec } from "../../proceduralize/generator";
import { semanticDigestOf } from "../../builder/canonical";
import { canonicalJson } from "../../owner-mode/provenance";
import { PIN_GENERATED_AT, clearwaterGraph, reversedGraph } from "./support";

describe("INV-02 same graph + same context -> same site spec", () => {
  const graph = clearwaterGraph();

  test("repeated generation is byte-identical (5 runs, no hidden state)", () => {
    const first = canonicalJson(
      generateSiteSpec(graph, { generatedAt: PIN_GENERATED_AT }),
    );
    for (let i = 0; i < 4; i++) {
      expect(
        canonicalJson(
          generateSiteSpec(graph, { generatedAt: PIN_GENERATED_AT }),
        ),
      ).toBe(first);
    }
  });

  test("different generatedAt -> same semantic digest (canonical.ts law)", () => {
    const d1 = semanticDigestOf(
      generateSiteSpec(graph, { generatedAt: PIN_GENERATED_AT }),
    );
    const d2 = semanticDigestOf(
      generateSiteSpec(graph, { generatedAt: "2026-01-01T00:00:00.000Z" }),
    );
    // The specs differ in the volatile stamp...
    expect(
      canonicalJson(generateSiteSpec(graph, { generatedAt: PIN_GENERATED_AT })),
    ).not.toBe(
      canonicalJson(
        generateSiteSpec(graph, { generatedAt: "2026-01-01T00:00:00.000Z" }),
      ),
    );
    // ...but the semantic identity is unchanged.
    expect(d2).toBe(d1);
  });

  test("same content, permuted order, same context -> byte-identical spec", () => {
    const a = canonicalJson(
      generateSiteSpec(graph, { generatedAt: PIN_GENERATED_AT }),
    );
    const b = canonicalJson(
      generateSiteSpec(reversedGraph(graph), { generatedAt: PIN_GENERATED_AT }),
    );
    expect(b).toBe(a);
  });

  test("spec carries the owner object identity deterministically", () => {
    const spec = generateSiteSpec(graph, { generatedAt: PIN_GENERATED_AT });
    expect(spec.ownerObjectId).toBe("cw-biz-01");
    expect(spec.kind).toBe("fyd.sitespec@1");
  });
});
