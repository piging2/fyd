#!/usr/bin/env node
/**
 * S8-01 T1: regenerate tools/lint-baseline-srcfyd.json.
 *
 * Runs ESLint over src/fyd (the T1 scope: typescript-eslint
 * recommended-type-checked, no-floating-promises and
 * no-misused-promises as errors, everything else a warning) and
 * records the per-rule warning counts. The baseline is a measurement
 * artifact for later tranches to measure burn-down against; it is
 * NOT a suppression mechanism (lint still prints every warning).
 *
 * Usage: node tools/lint-baseline-srcfyd.mjs
 * Refuses to write a baseline while any error-severity finding
 * exists in src/fyd: the baseline is only meaningful at zero errors.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outPath = path.join(repoRoot, "tools", "lint-baseline-srcfyd.json");

let raw;
try {
  raw = execFileSync("npx", ["eslint", "src/fyd", "--format", "json"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  // ESLint exits non-zero when errors exist; stdout still has the JSON.
  if (err && typeof err.stdout === "string" && err.stdout.length > 0) {
    raw = err.stdout;
  } else {
    throw err;
  }
}

const results = JSON.parse(raw);
const warningsByRule = {};
let errors = 0;
let warnings = 0;
for (const file of results) {
  for (const message of file.messages) {
    if (message.severity === 2) {
      errors += 1;
    } else {
      warnings += 1;
      const key = message.ruleId ?? "(unused-disable-directive)";
      warningsByRule[key] = (warningsByRule[key] ?? 0) + 1;
    }
  }
}

if (errors > 0) {
  console.error(
    `lint-baseline: ${errors} error-severity finding(s) in src/fyd; ` +
      "baseline not written (it is only meaningful at zero errors).",
  );
  process.exit(1);
}

const sortedWarnings = Object.fromEntries(
  Object.entries(warningsByRule).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  ),
);

const baseline = {
  description:
    "S8-01 T1 warning baseline for src/fyd under typescript-eslint " +
    "recommended-type-checked (T1 severity split). Measurement artifact " +
    "for burn-down comparison by later tranches; not a suppression " +
    "mechanism. Regenerate with: node tools/lint-baseline-srcfyd.mjs",
  scope: "src/fyd/**/*.ts, src/fyd/**/*.tsx",
  date: new Date().toISOString().slice(0, 10),
  errorRules: {
    "@typescript-eslint/no-floating-promises": 0,
    "@typescript-eslint/no-misused-promises": 0,
  },
  totalWarnings: warnings,
  warningsByRule: sortedWarnings,
};

fs.writeFileSync(outPath, JSON.stringify(baseline, null, 2) + "\n");
console.log(
  `lint-baseline: wrote ${path.relative(repoRoot, outPath)} ` +
    `(0 errors, ${warnings} warnings across ` +
    `${Object.keys(sortedWarnings).length} rules).`,
);
