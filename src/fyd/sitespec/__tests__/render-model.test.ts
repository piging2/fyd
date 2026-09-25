/**
 * Semantic render determinism tests.
 *
 * The spec is generated once in-test with a fixed timestamp, written to a
 * fixture file, and fed to TWO separate probe processes. Their canonical
 * outputs must be byte-identical: any Date.now(), Math.random(), module
 * counter, unstable ordering, or process-dependent id in the render path
 * would break the comparison.
 *
 * NOTE (2026-09-21): plain `node --experimental-strip-types` cannot load
 * renderer.tsx (a .tsx file with JSX; node 22.23.2 rejects the extension),
 * so the probe is spawned with the repo's declared `tsx` dependency, which
 * handles .tsx and the @/ tsconfig alias. Same two-process guarantee.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { HAPPY_PLACE_GRAPH } from "../../proceduralize/__fixtures__/happy-place-graph";
import { generateSiteSpec } from "../../proceduralize/generator";
import {
  buildSemanticRenderModel,
  canonicalizeModel,
  canonicalizeOverrides,
  RENDER_MODEL_VERSION,
} from "../render-model";
import { verifyPublicProjection } from "../public-projection";
import type { FieldVisibilityDecision } from "../field-visibility";
import type { FYDSiteSpec } from "../types";

const FIXED_GENERATED_AT = "2026-09-21T13:50:00Z";
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const PROBE = path.join(__dirname, "determinism-probe.ts");
const TSX_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
const CSS_REGISTER = path.join(__dirname, "css-register.cjs");

function buildProbeInput(ownerOverrides: FieldVisibilityDecision[] = []): {
  spec: FYDSiteSpec;
  graph: typeof HAPPY_PLACE_GRAPH;
  ownerOverrides: FieldVisibilityDecision[];
} {
  const spec = generateSiteSpec(HAPPY_PLACE_GRAPH, { generatedAt: FIXED_GENERATED_AT });
  return { spec, graph: HAPPY_PLACE_GRAPH, ownerOverrides };
}

/** The only legal model input: the anonymous verified public projection. */
function verifiedModelInput(ownerOverrides: FieldVisibilityDecision[] = []) {
  const { spec, graph } = buildProbeInput();
  return {
    spec,
    projection: verifyPublicProjection(graph, ownerOverrides, "anonymous"),
  };
}

/** Run the probe in a fresh process; return the canonical model bytes. */
function runProbeOnce(input: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "fyd-det-"));
  const inFile = path.join(dir, "input.json");
  const outFile = path.join(dir, "output.txt");
  writeFileSync(inFile, JSON.stringify(input), "utf8");
  execFileSync(TSX_BIN, ["--import", CSS_REGISTER, PROBE, inFile, outFile], {
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 120000,
  });
  return readFileSync(outFile, "utf8");
}

describe("semantic render determinism", () => {
  test("two separate probe processes produce byte-identical canonical models", () => {
    const input = buildProbeInput();
    const first = runProbeOnce(input);
    const second = runProbeOnce(input);
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    // The canonical form parses and carries the model version.
    const parsed = JSON.parse(first) as { renderModelVersion: number };
    expect(parsed.renderModelVersion).toBe(RENDER_MODEL_VERSION);
  });

  test("model sanity: pages in spec order, sections resolve to object ids, canonical form stable", () => {
    const { spec, projection } = verifiedModelInput();
    const model = buildSemanticRenderModel(spec, projection);
    expect(model.renderModelVersion).toBe(RENDER_MODEL_VERSION);
    // Q-C-02: the model carries the full projection identity: checkpoint,
    // graph digest, decisions digest, viewer policy digest, viewer kind.
    expect(model.viewerKind).toBe("anonymous");
    expect(model.graphDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(model.decisionsDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(model.checkpoint).toBe(projection.provenance.checkpoint);
    expect(model.pages.map((p) => p.slug)).toEqual(spec.pages.map((p) => p.slug));
    for (const page of model.pages) {
      for (const section of page.sections) {
        expect(typeof section.id).toBe("string");
        expect(typeof section.component).toBe("string");
        expect(Array.isArray(section.objectIds)).toBe(true);
        for (const id of section.objectIds) {
          expect(typeof id).toBe("string");
        }
      }
    }
    // Canonicalization is idempotent across a JSON round-trip.
    expect(canonicalizeModel(model)).toBe(
      canonicalizeModel(JSON.parse(JSON.stringify(model))),
    );
  });

  test("owner overrides are an explicit model input: same decisions -> same model, different decisions -> different model", () => {
    const hide: FieldVisibilityDecision = {
      objectId: "owner-1",
      field: "address",
      policy: "hide",
      decidedBy: "owner",
      decidedAt: FIXED_GENERATED_AT,
      source: "owner_override",
      version: 1,
    };
    const show: FieldVisibilityDecision = { ...hide, policy: "show" };
    // Owner overrides enter the model ONLY through the verified projection
    // boundary: the model never sees a raw graph.
    const baseInput = verifiedModelInput();
    const hideInput = verifiedModelInput([hide]);
    const hideAgainInput = verifiedModelInput([hide]);
    const showInput = verifiedModelInput([show]);
    const base = buildSemanticRenderModel(baseInput.spec, baseInput.projection);
    const withHide = buildSemanticRenderModel(hideInput.spec, hideInput.projection);
    const withHideAgain = buildSemanticRenderModel(hideAgainInput.spec, hideAgainInput.projection);
    const withShow = buildSemanticRenderModel(showInput.spec, showInput.projection);
    expect(base.ownerOverrides).toBe("none");
    expect(withHide.ownerOverrides).not.toBe("none");
    // Same decisions -> same canonical model.
    expect(canonicalizeModel(withHideAgain)).toBe(canonicalizeModel(withHide));
    // Different decisions -> different canonical model.
    expect(canonicalizeModel(withShow)).not.toBe(canonicalizeModel(withHide));
    expect(canonicalizeModel(withHide)).not.toBe(canonicalizeModel(base));
  });

  test("canonicalizeOverrides is order-insensitive", () => {
    const a: FieldVisibilityDecision = {
      objectId: "o2",
      field: "phone",
      policy: "hide",
      decidedBy: "owner",
      decidedAt: FIXED_GENERATED_AT,
      source: "owner_override",
      version: 1,
    };
    const b: FieldVisibilityDecision = {
      objectId: "o1",
      field: "address",
      policy: "coarse",
      decidedBy: "owner",
      decidedAt: FIXED_GENERATED_AT,
      source: "owner_override",
      version: 1,
    };
    expect(canonicalizeOverrides([a, b])).toBe(canonicalizeOverrides([b, a]));
    expect(canonicalizeOverrides(undefined)).toBe("none");
    expect(canonicalizeOverrides([])).toBe("none");
  });
});

describe("semantic render determinism: full invariant", () => {
  // The committed invariant (FYD product authority directive 2026-09-25):
  // SAME ObjectGraph + SiteSpec + ViewerContext + OwnerOverrides ->
  // SAME semantic render model, across separate processes. HTML bytes
  // are NOT required to match: the semantic model is the boundary.
  const hideAddress: FieldVisibilityDecision = {
    objectId: "owner-1",
    field: "address",
    policy: "hide",
    decidedBy: "owner",
    decidedAt: FIXED_GENERATED_AT,
    source: "owner_override",
    version: 1,
  };
  const hidePhone: FieldVisibilityDecision = {
    objectId: "owner-1",
    field: "phone",
    policy: "hide",
    decidedBy: "owner",
    decidedAt: FIXED_GENERATED_AT,
    source: "owner_override",
    version: 1,
  };

  function probeInput(overrides: FieldVisibilityDecision[], viewerKind: string) {
    const base = buildProbeInput(overrides);
    return { ...base, viewerKind };
  }

  test("same inputs + same viewer -> byte-identical canonical models across processes", () => {
    for (const viewerKind of ["anonymous", "owner"]) {
      const input = probeInput([hideAddress], viewerKind);
      const first = runProbeOnce(input);
      const second = runProbeOnce(input);
      expect(first.length).toBeGreaterThan(0);
      expect(second).toEqual(first);
      const parsed = JSON.parse(first) as { viewerKind: string };
      expect(parsed.viewerKind).toBe(viewerKind);
    }
  });

  test("owner overrides are an order-insensitive set through the full probe path", () => {
    const ab = runProbeOnce(probeInput([hideAddress, hidePhone], "anonymous"));
    const ba = runProbeOnce(probeInput([hidePhone, hideAddress], "anonymous"));
    expect(ba).toEqual(ab);
  });

  test("different owner overrides -> different models (no silent identity)", () => {
    const base = runProbeOnce(probeInput([], "anonymous"));
    const hidden = runProbeOnce(probeInput([hideAddress], "anonymous"));
    expect(hidden).not.toEqual(base);
  });
});

describe("semantic render model mirrors the real render path", () => {
  // renderSection() (components/renderer.tsx) applies owner presentation
  // intent after query resolution: objectOrder reorders, hiddenObjectIds
  // excludes site-wide, presentation.hidden sections never render. The
  // model mirrors that path; these tests pin the mirror on the fixture.
  function specWithMutator(
    mutate: (spec: FYDSiteSpec) => void,
  ): { spec: FYDSiteSpec; projection: ReturnType<typeof verifyPublicProjection> } {
    const { spec, graph } = buildProbeInput();
    const clone = JSON.parse(JSON.stringify(spec)) as FYDSiteSpec;
    mutate(clone);
    return { spec: clone, projection: verifyPublicProjection(graph, [], "anonymous") };
  }

  function multiObjectSectionIds(spec: FYDSiteSpec): { sectionId: string; ids: string[] } {
    const { projection } = specWithMutator(() => {});
    const model = buildSemanticRenderModel(spec, projection);
    for (const page of model.pages) {
      for (const section of page.sections) {
        if (section.objectIds.length >= 2) {
          return { sectionId: section.id, ids: section.objectIds };
        }
      }
    }
    throw new Error("fixture has no section binding >= 2 objects");
  }

  function mutateSection(spec: FYDSiteSpec, sectionId: string, mutate: (s: { presentation: Record<string, unknown> }) => void) {
    for (const page of spec.pages) {
      for (const section of page.sections) {
        if (section.id === sectionId) {
          mutate(section as unknown as { presentation: Record<string, unknown> });
          return;
        }
      }
    }
    throw new Error("section not found: " + sectionId);
  }

  test("owner objectOrder reorders the model's bound objects", () => {
    const { sectionId, ids } = multiObjectSectionIds(buildProbeInput().spec);
    const reversed = ids.slice().reverse();
    expect(reversed).not.toEqual(ids);
    const { spec, projection } = specWithMutator((clone) =>
      mutateSection(clone, sectionId, (s) => {
        s.presentation.objectOrder = reversed;
      }),
    );
    const model = buildSemanticRenderModel(spec, projection);
    const section = model.pages
      .flatMap((p) => p.sections)
      .find((sec) => sec.id === sectionId);
    expect(section).toBeDefined();
    expect(section!.objectIds).toEqual(reversed);
  });

  test("owner hiddenObjectIds excludes the object site-wide", () => {
    const { sectionId, ids } = multiObjectSectionIds(buildProbeInput().spec);
    const hiddenId = ids[0]!;
    const { spec, projection } = specWithMutator((clone) =>
      mutateSection(clone, sectionId, (s) => {
        s.presentation.hiddenObjectIds = [hiddenId];
      }),
    );
    const model = buildSemanticRenderModel(spec, projection);
    for (const page of model.pages) {
      for (const section of page.sections) {
        expect(section.objectIds).not.toContain(hiddenId);
      }
    }
  });

  test("presentation.hidden sections do not appear in the model", () => {
    const { sectionId } = multiObjectSectionIds(buildProbeInput().spec);
    const { spec, projection } = specWithMutator((clone) =>
      mutateSection(clone, sectionId, (s) => {
        s.presentation.hidden = true;
      }),
    );
    const model = buildSemanticRenderModel(spec, projection);
    const allIds = model.pages.flatMap((p) => p.sections.map((sec) => sec.id));
    expect(allIds).not.toContain(sectionId);
  });
});
