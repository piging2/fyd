/**
 * LANE-CLAIM render-path attacks: run the real render path for the two
 * demo tenants (coppersmith-plumbing, happy-place) and check the
 * BindingVerifier invariant end to end.
 *
 * This is the production render path for these sites: generateSiteSpec
 * (src/app/sites/happy-place/page.tsx, src/app/sites/coppersmith-plumbing/
 * page.tsx) + SitePageView + renderToStaticMarkup.
 *
 * Failing tests here are the deliverable: they name genuine holes where
 * what renders is not what the verifier graded.
 *
 * Run (note the CSS stub: the renderer imports a CSS module, and the
 * repo tsconfig sets jsx:preserve so the transform needs the jsx override):
 *   npx jest --transform '{"^.+\\.tsx?$":["ts-jest",{"isolatedModules":true,"tsconfig":{"jsx":"react-jsx","target":"es2020","module":"commonjs","esModuleInterop":true,"allowSyntheticDefaultImports":true,"skipLibCheck":true}}]}' \
 *     --moduleNameMapper '{"^@/(.*)$":"<rootDir>/src/$1","\\.css$":"<rootDir>/src/fyd/claim/__tests__/css-stub.js"}' \
 *     src/fyd/claim/__tests__/attack-render-path.test.ts
 */
import { renderToStaticMarkup } from "react-dom/server";
import { SitePageView } from "../../components/renderer";
import { generateSiteSpec } from "../../proceduralize/generator";
import { COPPERSMITH_GRAPH } from "../../proceduralize/__fixtures__/coppersmith-graph";
import { HAPPY_PLACE_GRAPH } from "../../proceduralize/__fixtures__/happy-place-graph";
import {
  buildVerifiedRenderModel,
  ownerAssertionsFromGraph,
  verifyBinding,
} from "../../sitespec/binding-verifier";
import { resolveBoundField } from "../../sitespec/graph";
import type { ObjectGraph, FYDSiteSpec } from "../../sitespec/types";

/** Render every page of a site through the real renderer to plain text. */
function renderSiteText(graph: ObjectGraph): { text: string; spec: FYDSiteSpec } {
  const spec = generateSiteSpec(graph, {
    generatedAt: "2026-09-21T12:00:00.000Z",
    eventSequences: [1, 2],
  });
  const ctx = {
    spec,
    graph,
    viewer: { viewerId: null as string | null, displayName: null as string | null },
  };
  let html = "";
  for (const page of spec.pages) {
    html += renderToStaticMarkup(SitePageView({ page, ctx }));
  }
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return { text, spec };
}

/**
 * Every factual value that appears in the rendered text must bind as
 * direct evidence. Returns the values that render but do not bind.
 */
function auditRenderedClaims(
  graph: ObjectGraph,
  text: string,
): { checked: number; misses: string[] } {
  const assertions = ownerAssertionsFromGraph(graph);
  const misses: string[] = [];
  let checked = 0;
  for (const o of graph.objects) {
    const pairs: Array<[string, string]> = [
      ["title", o.title],
      ["description", o.description],
    ];
    for (const [k, v] of Object.entries(o.fields)) {
      pairs.push([k, Array.isArray(v) ? v.join(", ") : v]);
    }
    for (const [field, raw] of pairs) {
      const value = raw.trim();
      if (value.length < 5) continue;
      if (!text.includes(value)) continue;
      checked++;
      const verdict = verifyBinding(
        { objectId: o.id, field, classification: "direct" },
        graph,
        assertions,
      );
      if (verdict.status !== "BOUND") {
        misses.push(
          o.id + "#" + field + " -> " + (verdict as { reason: string }).reason,
        );
      }
    }
  }
  return { checked, misses };
}

const COPPER = COPPERSMITH_GRAPH as ObjectGraph;
const HAPPY = HAPPY_PLACE_GRAPH as ObjectGraph;
const COPPER_BIZ = "website-business-2f1327c09d622175";

describe("render-path claim audit: coppersmith-plumbing", () => {
  const { text } = renderSiteText(COPPER);

  test("the site renders factual content through the real path", () => {
    expect(text.length).toBeGreaterThan(1000);
    expect(text).toContain("Coppersmith");
  });

  test("every rendered factual value binds as direct evidence", () => {
    const { checked, misses } = auditRenderedClaims(COPPER, text);
    expect(checked).toBeGreaterThan(0);
    // A miss here is a false positive: a rendered, evidenced claim the
    // verifier cannot bind (or an unbound claim the render path published).
    expect(misses).toEqual([]);
  });

  test("curated claims: phone, locality, tenure render and bind", () => {
    for (const [field, needle] of [
      ["phone", "970-245-3869"],
      ["locality", "Grand Junction"],
      ["description", "over 25 years"],
    ] as Array<[string, string]>) {
      expect(text).toContain(needle);
      const verdict = verifyBinding(
        { objectId: COPPER_BIZ, field, classification: "direct" },
        COPPER,
        ownerAssertionsFromGraph(COPPER),
      );
      expect(verdict.status).toBe("BOUND");
    }
  });
});

describe("render-path claim audit: happy-place", () => {
  const { text } = renderSiteText(HAPPY);

  test("the site renders factual content through the real path", () => {
    expect(text.length).toBeGreaterThan(1000);
    expect(text).toContain("Happy Place");
  });

  test("every rendered factual value binds as direct evidence", () => {
    const { checked, misses } = auditRenderedClaims(HAPPY, text);
    expect(checked).toBeGreaterThan(0);
    expect(misses).toEqual([]);
  });
});

describe("render-path holes", () => {
  test("R-H4: the render path resolves owner_authored claims the BindingVerifier refuses", () => {
    // The renderer reads through resolveBoundField, not through
    // verifyBinding. Same binding, two answers.
    const verdict = verifyBinding(
      { objectId: COPPER_BIZ, field: "phone", classification: "owner_authored" },
      COPPER,
      ownerAssertionsFromGraph(COPPER),
    );
    expect(verdict.status).toBe("UNBOUND");
    const rendered = resolveBoundField(COPPER, {
      objectId: COPPER_BIZ,
      field: "phone",
      classification: "owner_authored",
    });
    // The render path publishes what the BindingVerifier refuses.
    expect(rendered).toBeUndefined();
  });

  test("R-MODEL: rendering is not gated by the verified render model", () => {
    // The planner's emission gate (buildVerifiedRenderModel) runs at plan
    // time. Nothing re-verifies at render time: mutate the graph after
    // verification and the renderer publishes the unverified values.
    const bindings = [
      {
        objectId: COPPER_BIZ,
        field: "phone" as string,
        classification: "direct" as const,
      },
    ];
    const model = buildVerifiedRenderModel(
      bindings,
      COPPER,
      ownerAssertionsFromGraph(COPPER),
      { rendererVersion: "attack@1" },
    );
    expect(model.atoms[0].value).toBe("970-245-3869");

    const tampered: ObjectGraph = {
      objects: COPPER.objects.map((o) =>
        o.id === COPPER_BIZ
          ? { ...o, fields: { ...o.fields, phone: "970-000-0000" } }
          : o,
      ),
      relationships: COPPER.relationships,
    };
    const { text } = renderSiteText(tampered);
    // The renderer must not publish a value the verified model never saw.
    expect(text).not.toContain("970-000-0000");
    expect(text).toContain("970-245-3869");
  });

  test("R-CORRECTED: an owner-corrected number renders, then grades as direct evidence", () => {
    // Owner corrects the phone: fields[] carries the owner-winning value,
    // exactly as the read seam composes it. The contact section renders it
    // through the owner_authored path (no assertion check at render time).
    const corrected: ObjectGraph = {
      objects: COPPER.objects.map((o) =>
        o.id === COPPER_BIZ
          ? {
              ...o,
              fields: { ...o.fields, phone: "970-000-0001" },
              ownerFieldCorrections: [
                {
                  field: "phone",
                  label: "Phone",
                  sourceValue: "970-245-3869",
                  ownerValue: "970-000-0001",
                  correctedAt: "2026-09-20T00:00:00.000Z",
                  actorLabel: "Demo Owner (seeded, unverified)",
                  basis: "Owner correction.",
                  sourceDrifted: false,
                },
              ],
            }
          : o,
      ),
      relationships: COPPER.relationships,
    };
    const { text } = renderSiteText(corrected);
    expect(text).toContain("970-000-0001");
    // But a direct binding grades the OWNER's value as DIRECT EVIDENCE,
    // though the provenance ref covers the SOURCE value (970-245-3869).
    const verdict = verifyBinding(
      { objectId: COPPER_BIZ, field: "phone", classification: "direct" },
      corrected,
      ownerAssertionsFromGraph(corrected),
    );
    expect(verdict.status).toBe("BOUND");
    if (verdict.status === "BOUND") {
      expect(verdict.source).not.toBe("evidence-ref");
    }
  });
});
