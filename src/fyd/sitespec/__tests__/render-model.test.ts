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
import type { FieldVisibilityDecision } from "../field-visibility";
import type { FYDSiteSpec, ViewerContext } from "../types";

const FIXED_GENERATED_AT = "2026-09-21T13:50:00Z";
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const PROBE = path.join(__dirname, "determinism-probe.ts");
const TSX_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");

function buildProbeInput(): {
  spec: FYDSiteSpec;
  graph: typeof HAPPY_PLACE_GRAPH;
  viewer: ViewerContext;
  asOf: string;
} {
  const spec = generateSiteSpec(HAPPY_PLACE_GRAPH, { generatedAt: FIXED_GENERATED_AT });
  return {
    spec,
    graph: HAPPY_PLACE_GRAPH,
    viewer: { viewerId: null, displayName: null },
    asOf: FIXED_GENERATED_AT,
  };
}

/** Run the probe in a fresh process; return the canonical model bytes. */
function runProbeOnce(input: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "fyd-det-"));
  const inFile = path.join(dir, "input.json");
  const outFile = path.join(dir, "output.txt");
  writeFileSync(inFile, JSON.stringify(input), "utf8");
  execFileSync(TSX_BIN, [PROBE, inFile, outFile], {
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
    const { spec, graph, viewer, asOf } = buildProbeInput();
    const model = buildSemanticRenderModel(spec, graph, viewer, { asOf });
    expect(model.renderModelVersion).toBe(RENDER_MODEL_VERSION);
    expect(model.asOf).toBe(FIXED_GENERATED_AT);
    expect(model.viewerId).toBeNull();
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
    const { spec, graph, viewer, asOf } = buildProbeInput();
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
    const base = buildSemanticRenderModel(spec, graph, viewer, { asOf });
    const withHide = buildSemanticRenderModel(spec, graph, viewer, {
      asOf,
      ownerOverrides: [hide],
    });
    const withHideAgain = buildSemanticRenderModel(spec, graph, viewer, {
      asOf,
      ownerOverrides: [hide],
    });
    const withShow = buildSemanticRenderModel(spec, graph, viewer, {
      asOf,
      ownerOverrides: [show],
    });
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
