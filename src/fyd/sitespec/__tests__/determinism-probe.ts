/**
 * Semantic render determinism probe.
 *
 * Reads a JSON fixture { spec, graph, viewer, asOf, designTokenVersion? },
 * builds the semantic render model through the real render path, and writes
 * the canonical model encoding to the output file.
 *
 * Usage: <ts-runtime> determinism-probe.ts <input.json> <output.txt>
 *
 * The determinism test spawns two separate processes running this script and
 * compares the outputs byte-for-byte. Success prints nothing to stdout;
 * errors go to stderr and exit nonzero.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { buildSemanticRenderModel, canonicalizeModel } from "../render-model";
import type { FieldVisibilityDecision } from "../field-visibility";
import type { FYDSiteSpec, ObjectGraph, ViewerContext } from "../types";

interface ProbeInput {
  spec: FYDSiteSpec;
  graph: ObjectGraph;
  viewer: ViewerContext;
  asOf: string;
  designTokenVersion?: string;
  ownerOverrides?: FieldVisibilityDecision[];
}

function fail(message: string): never {
  process.stderr.write(`determinism-probe: ${message}\n`);
  process.exit(1);
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) {
  fail("usage: determinism-probe <input.json> <output.txt>");
}

let raw: string;
try {
  raw = readFileSync(inputPath, "utf8");
} catch (err) {
  fail(`cannot read input file: ${err instanceof Error ? err.message : String(err)}`);
}

let input: ProbeInput;
try {
  input = JSON.parse(raw!) as ProbeInput;
} catch (err) {
  fail(`input is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
}

if (!input!.spec || !input!.graph || !input!.viewer || typeof input!.asOf !== "string") {
  fail("input must be { spec, graph, viewer, asOf }");
}

const model = buildSemanticRenderModel(input!.spec, input!.graph, input!.viewer, {
  asOf: input!.asOf,
  designTokenVersion: input!.designTokenVersion,
  ownerOverrides: input!.ownerOverrides,
});

try {
  writeFileSync(outputPath, canonicalizeModel(model), "utf8");
} catch (err) {
  fail(`cannot write output file: ${err instanceof Error ? err.message : String(err)}`);
}
