/**
 * Semantic render determinism probe.
 *
 * Reads a JSON fixture { spec, graph, ownerOverrides?, designTokenVersion?,
 * viewerKind? }, wraps the graph in the verified public projection for the
 * declared viewer (Q-C-01), builds the semantic render model through the
 * real render path, and writes the canonical model encoding to the output
 * file.
 *
 * Usage: <ts-runtime> determinism-probe.ts <input.json> <output.txt>
 *
 * The determinism test spawns two separate processes running this script and
 * compares the outputs byte-for-byte. Success prints nothing to stdout;
 * errors go to stderr and exit nonzero.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { buildSemanticRenderModel, canonicalizeModel } from "../render-model";
import {
  verifyPublicProjection,
  type PublicViewerKind,
} from "../public-projection";
import type { FieldVisibilityDecision } from "../field-visibility";
import type { FYDSiteSpec, ObjectGraph } from "../types";

interface ProbeInput {
  spec: FYDSiteSpec;
  graph: ObjectGraph;
  ownerOverrides?: FieldVisibilityDecision[];
  designTokenVersion?: string;
  /** Explicit ViewerContext input. Defaults to "anonymous". */
  viewerKind?: PublicViewerKind;
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

if (!input!.spec || !input!.graph) {
  fail("input must be { spec, graph, ownerOverrides? }");
}

// The ONLY boundary the render model may consume: the verified public
// projection for the declared viewer. The probe proves the two-process
// determinism of the full boundary -> model path.
const viewerKind: PublicViewerKind = input!.viewerKind ?? "anonymous";
const projection = verifyPublicProjection(
  input!.graph,
  input!.ownerOverrides ?? [],
  viewerKind,
);
const model = buildSemanticRenderModel(input!.spec, projection, {
  designTokenVersion: input!.designTokenVersion,
});

try {
  writeFileSync(outputPath, canonicalizeModel(model), "utf8");
} catch (err) {
  fail(`cannot write output file: ${err instanceof Error ? err.message : String(err)}`);
}
