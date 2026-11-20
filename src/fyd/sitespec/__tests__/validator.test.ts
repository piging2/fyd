/**
 * SiteSpec validator tests: structure errors, semantic errors, and the
 * renderable gate.
 */

import { HAPPY_PLACE_GRAPH } from "../../proceduralize/__fixtures__/happy-place-graph";
import { generateSiteSpec } from "../../proceduralize/generator";
import { isRenderable, validateSiteSpec } from "../validator";
import type { FYDSection, FYDSiteSpec } from "../types";

const OPTS = { generatedAt: "2026-09-21T12:00:00.000Z" };

function validSpec(): FYDSiteSpec {
  return generateSiteSpec(HAPPY_PLACE_GRAPH, OPTS);
}

function schemas(): Set<string> {
  return new Set(HAPPY_PLACE_GRAPH.objects.map((o) => o.schema));
}

describe("validateSiteSpec", () => {
  test("the generated Happy Place spec is valid and renderable", () => {
    const findings = validateSiteSpec(validSpec(), schemas());
    const errors = findings.filter((f) => f.severity === "error");
    expect(errors).toEqual([]);
    expect(isRenderable(findings)).toBe(true);
  });

  test("unknown component is an error", () => {
    const spec = validSpec();
    spec.pages[0].sections[0].component = "NotAComponent";
    const findings = validateSiteSpec(spec, schemas());
    expect(findings.some((f) => f.severity === "error" && f.path.includes("component"))).toBe(true);
    expect(isRenderable(findings)).toBe(false);
  });

  test("duplicate section ids are an error", () => {
    const spec = validSpec();
    spec.pages[0].sections[1].id = spec.pages[0].sections[0].id;
    const findings = validateSiteSpec(spec, schemas());
    expect(findings.some((f) => f.severity === "error" && f.message.includes("Duplicate section id"))).toBe(true);
  });

  test("nav pointing at a missing page is an error", () => {
    const spec = validSpec();
    spec.navigation.push({ label: "Ghost", pageSlug: "ghost" });
    const findings = validateSiteSpec(spec, schemas());
    expect(findings.some((f) => f.severity === "error" && f.path === "navigation")).toBe(true);
  });

  test("a reference query naming a foreign schema is refused at the validator", () => {
    const spec = validSpec();
    const section = spec.pages[0].sections[spec.pages[0].sections.length - 1];
    section.query = {
      kind: "reference",
      objectIds: ["svc-9"],
      schema: "ping.social.foreign@1",
    } as FYDSection["query"];
    const findings = validateSiteSpec(spec, schemas());
    expect(
      findings.some(
        (f) =>
          f.severity === "error" &&
          f.message.includes("ping.social.foreign@1") &&
          f.message.includes("known schema set"),
      ),
    ).toBe(true);
    expect(isRenderable(findings)).toBe(false);
  });

  test("a reference query naming a known schema passes the membership check", () => {
    const spec = validSpec();
    const section = spec.pages[0].sections[spec.pages[0].sections.length - 1];
    const member = [...schemas()][0];
    section.query = {
      kind: "reference",
      objectIds: ["svc-9"],
      schema: member,
    } as FYDSection["query"];
    const findings = validateSiteSpec(spec, schemas());
    expect(findings.some((f) => f.message.includes("known schema set"))).toBe(false);
    expect(isRenderable(findings)).toBe(true);
  });

  test("a related query's schemas list is a resolution vocabulary, not a membership claim", () => {
    // Scope boundary, pinned on evidence: the generator's own related
    // queries name schema variants the tenant graph does not carry
    // (the ObjectRail query names ping.knowledge.* beside
    // ping.social.*), so the membership refusal governs reference
    // queries only and must not fire here.
    const spec = validSpec();
    const section = spec.pages[0].sections[spec.pages[0].sections.length - 1];
    section.query = {
      kind: "related",
      from: spec.ownerObjectId,
      predicate: "provides",
      schemas: ["ping.social.foreign@1"],
    } as FYDSection["query"];
    const findings = validateSiteSpec(spec, schemas());
    expect(findings.some((f) => f.message.includes("known schema set"))).toBe(false);
  });

  test("non-deterministic section id is a warning, not an error", () => {
    const spec = validSpec();
    spec.pages[0].sections[0].id = "custom-id";
    const findings = validateSiteSpec(spec, schemas());
    expect(findings.some((f) => f.severity === "warning")).toBe(true);
    expect(isRenderable(findings)).toBe(true);
  });
});
