#!/usr/bin/env node
/**
 * S8-01 T3: regenerate tools/lint-baseline-app-remainder.json.
 *
 * Runs ESLint over the T3 scope (src/app, src/motion, src/services,
 * src/types, src/config, src/__tests__, and the src root files:
 * typescript-eslint recommended-type-checked, no-floating-promises
 * and no-misused-promises as errors, everything else a warning;
 * test files under the scope carry the T2-shape carve-out, unsafe-*
 * off) and records the per-rule warning counts. The baseline is a
 * measurement artifact for later burn-down comparison; it is NOT a
 * suppression mechanism (lint still prints every warning).
 *
 * Usage: node tools/lint-baseline-app-remainder.mjs
 * Refuses to write a baseline while any error-severity finding
 * exists in the T3 scope: the baseline is only meaningful at zero
 * errors.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outPath = path.join(
  repoRoot,
  "tools",
  "lint-baseline-app-remainder.json",
);
const scopePaths = [
  "src/app",
  "src/motion",
  "src/services",
  "src/types",
  "src/config",
  "src/__tests__",
  "src/middleware.ts",
];

let raw;
try {
  raw = execFileSync(
    "npx",
    ["eslint", ...scopePaths, "--format", "json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
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
    `lint-baseline: ${errors} error-severity finding(s) in the T3 scope; ` +
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
    "S8-01 T3 warning baseline for the remainder of src (src/app, " +
    "src/motion, src/services, src/types, src/config, src/__tests__, " +
    "src root files) under typescript-eslint recommended-type-checked " +
    "(T3 severity split, T2-shape test-file carve-out). Measurement " +
    "artifact for burn-down comparison by later tranches; not a " +
    "suppression mechanism. Regenerate with: node " +
    "tools/lint-baseline-app-remainder.mjs",
  scope:
    "src/app/**/*.ts(x), src/motion/**/*.ts(x), src/services/**/*.ts(x), " +
    "src/types/**/*.ts(x), src/config/**/*.ts(x), src/__tests__/**/*.ts(x), " +
    "src/*.ts, src/*.tsx",
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
