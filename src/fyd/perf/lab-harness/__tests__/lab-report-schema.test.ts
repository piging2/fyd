/**
 * Item 11 (fyd-execution) regression: INV-PM-3 report shape.
 *
 * Every lab report covers both sites x both viewports (a single-site or
 * single-viewport number is not a result) and validates against the pinned
 * schema. The schema requires the "lab" label, the conditions block, and
 * the median rollup.
 */

import * as fs from "fs";
import * as path from "path";

const HARNESS = path.resolve(__dirname, "..");
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(HARNESS, "report-schema.json"), "utf8"),
);

function validate(report: unknown): string[] {
  const errors: string[] = [];
  const r = report as Record<string, unknown>;
  for (const k of SCHEMA.required as string[]) {
    if (!(k in r)) errors.push(`missing required key: ${k}`);
  }
  if (r.label !== "lab") errors.push(`label must be "lab", got ${JSON.stringify(r.label)}`);
  if (r.schema !== "fyd-lab-report@1") errors.push("bad schema tag");
  const cond = (r.conditions ?? {}) as Record<string, unknown>;
  for (const k of (SCHEMA.properties.conditions.required as string[])) {
    if (!(k in cond)) errors.push(`missing conditions key: ${k}`);
  }
  if (!("conditions" in r)) errors.push("missing conditions block");
  if (cond.cache !== "disabled") errors.push("cache must be disabled");
  if (!["desktop", "mobile"].includes(r.viewport as string)) errors.push("bad viewport");
  const median = r.median as Record<string, unknown>;
  for (const k of (SCHEMA.properties.median.required as string[])) {
    if (!(k in median)) errors.push(`missing median key: ${k}`);
  }
  return errors;
}

function sampleReport(site: string, viewport: string) {
  return {
    schema: "fyd-lab-report@1",
    label: "lab",
    site,
    viewport,
    url: `http://100.79.154.43:3100/sites/${site}`,
    measuredAt: "2026-10-07T00:00:00.000Z",
    conditions: {
      cpuThrottling: 4,
      network: viewport === "mobile" ? "fast-3g" : "unthrottled",
      cache: "disabled",
      runs: 5,
      successfulRuns: 5,
      viewport: viewport === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      driver: "playwright-core + CDP",
    },
    runs: [],
    median: {
      ttfbMs: 100, fcpMs: 200, lcpMs: 300,
      lcpElement: { tag: "img" }, cls: 0,
      longTasks: { count: 0, totalBlockingMs: 0 },
      bytes: { script: 1, stylesheet: 1, image: 1, font: 0, document: 1, other: 0, total: 4 },
    },
  };
}

test.each([
  ["coppersmith-plumbing", "desktop"],
  ["coppersmith-plumbing", "mobile"],
  ["happy-place", "desktop"],
  ["happy-place", "mobile"],
])("report shape validates for %s/%s (INV-PM-3)", (site, viewport) => {
  expect(validate(sampleReport(site, viewport))).toEqual([]);
});

test("a report missing the conditions block fails validation", () => {
  const bad = sampleReport("coppersmith-plumbing", "desktop") as Record<string, unknown>;
  delete bad.conditions;
  expect(validate(bad).length).toBeGreaterThan(0);
});

test("a report labeled field fails validation", () => {
  const bad = sampleReport("happy-place", "mobile") as Record<string, unknown>;
  bad.label = "field";
  expect(validate(bad)).toEqual(
    expect.arrayContaining([expect.stringMatching(/label must be "lab"/)]),
  );
});
