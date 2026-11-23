import { defineConfig } from "eslint/config";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

// S8-01 tranches T0 + T0.5 (2026-11-18): GREEN-BUT-EMPTY baseline.
// T0: ecmaVersion "latest" clears the 5 espree parse errors in .mjs
// tooling scripts; ignore patterns pointing at directories that no
// longer exist on main were removed (existence census in the lane
// receipt). T0.5: the TypeScript parser is wired for TS/TSX and the
// @typescript-eslint, react-hooks, and @next/next plugins are
// registered (so the source's existing eslint-disable directives
// resolve).
// T1 (2026-11-19): the typescript-eslint recommended-type-checked
// ruleset is scoped to src/fyd/** ONLY, with type information from
// tsconfig.eslint.json. Severity split at adoption (BASELINE.md
// section 4): @typescript-eslint/no-floating-promises and
// @typescript-eslint/no-misused-promises are ERRORS (both burned to
// zero in src/fyd in this tranche); every other enabled rule in the
// set is a WARNING, with per-rule counts recorded in
// tools/lint-baseline-srcfyd.json so later tranches measure
// burn-down against them. Rules the preset itself turns off stay
// off. Outside src/fyd the T0/T0.5 state is unchanged: parser wired,
// plugins registered, no rules enabled. The anti-empty-gate canary
// lives in src/fyd/net/__tests__/lint-canary.test.ts; the canary
// source file itself is ignored below and excluded from the app
// build (the repo tsconfig does not include src/fyd).
// T2 (2026-11-19): the same ruleset is scoped to src/lib/** and
// src/components/** (their ignore patterns are removed below),
// with the same severity split: the two promise rules are ERRORS
// (burned to zero in this scope in this tranche) and every other
// enabled rule is a WARNING, with per-rule counts recorded in
// tools/lint-baseline-lib-components.json. Test files under the
// T2 scope carry the BASELINE.md section 4 carve-out: the unsafe-*
// family is OFF there (43% of repo-wide findings sit in test
// files, overwhelmingly unsafe-* noise at untyped fixture
// boundaries); the correctness rules, including the two promise
// ERROR rules, stay ON in test files. The scoped rules map below
// is shared by the T1 and T2 scope blocks.
// T3 (2026-11-19): the same ruleset is scoped to the remainder
// of the repo's TypeScript: src/app/**, src/motion/**,
// src/services/**, src/types/**, src/config/**, src/__tests__/**,
// and src/*.ts(x) at the src root (their ignore patterns are
// removed below). Same severity split: the two promise rules are
// ERRORS (burned to zero in this scope in this tranche) and every
// other enabled rule is a WARNING, with per-rule counts recorded
// in tools/lint-baseline-app-remainder.json. Test files under
// the T3 scope carry the same carve-out as T2 (unsafe-* OFF;
// correctness rules, including the two promise ERROR rules, stay
// ON). With T3, every TS/TSX file under src is inside a scoped
// block: the green-but-empty era is fully over. The scoped rules
// map is shared by the T1, T2, and T3 scope blocks.

// The plugin's flat recommended-type-checked preset is an array of
// config objects; merge its rule entries into one map.
const typeCheckedPresetRules = Object.assign(
  {},
  ...tsPlugin.configs["flat/recommended-type-checked"].map(
    (entry) => entry.rules ?? {},
  ),
);

const scopedTypeCheckedRules = {};
for (const [ruleName, setting] of Object.entries(typeCheckedPresetRules)) {
  const severity = Array.isArray(setting) ? setting[0] : setting;
  scopedTypeCheckedRules[ruleName] =
    severity === "off" || severity === 0 ? setting : "warn";
}
scopedTypeCheckedRules["@typescript-eslint/no-floating-promises"] = "error";
scopedTypeCheckedRules["@typescript-eslint/no-misused-promises"] = "error";

// T2 test-file carve-out: every unsafe-* rule in the preset is OFF
// in test files under the T2 scope. Derived from the preset so the
// carve-out tracks the family membership exactly.
const testFileCarveOutRules = {};
for (const ruleName of Object.keys(typeCheckedPresetRules)) {
  if (ruleName.startsWith("@typescript-eslint/no-unsafe-")) {
    testFileCarveOutRules[ruleName] = "off";
  }
}

const eslintConfig = defineConfig([
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "package/**",
      "scripts/**",
      "src/fyd/net/__canary__/**",
    ],
  },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
  {
    // Plugin registration only; rules land scoped per tranche below.
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
  },
  {
    // Parser presence for all TS/TSX; type information is attached
    // per tranche scope (src/fyd in the T1 block below).
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
    },
  },
  {
    // T1: recommended-type-checked scoped to src/fyd, type-aware via
    // tsconfig.eslint.json (the repo tsconfig omits src/fyd).
    files: ["src/fyd/**/*.ts", "src/fyd/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: scopedTypeCheckedRules,
  },
  {
    // T2: recommended-type-checked scoped to src/lib + src/components,
    // same severity split as T1, type-aware via tsconfig.eslint.json.
    files: [
      "src/lib/**/*.ts",
      "src/lib/**/*.tsx",
      "src/components/**/*.ts",
      "src/components/**/*.tsx",
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: scopedTypeCheckedRules,
  },
  {
    // T2 test-file carve-out (see header): unsafe-* OFF in test files
    // under the T2 scope; all other scoped rules, including the two
    // promise ERROR rules, still apply there.
    files: [
      "src/lib/**/__tests__/**/*.ts",
      "src/lib/**/__tests__/**/*.tsx",
      "src/lib/**/*.test.ts",
      "src/lib/**/*.test.tsx",
      "src/lib/**/*.spec.ts",
      "src/lib/**/*.spec.tsx",
      "src/components/**/__tests__/**/*.ts",
      "src/components/**/__tests__/**/*.tsx",
      "src/components/**/*.test.ts",
      "src/components/**/*.test.tsx",
      "src/components/**/*.spec.ts",
      "src/components/**/*.spec.tsx",
    ],
    rules: testFileCarveOutRules,
  },
  {
    // T3: recommended-type-checked scoped to the remainder of src
    // (src/app, src/motion, src/services, src/types, src/config,
    // src/__tests__, and the src root), same severity split as
    // T1/T2, type-aware via tsconfig.eslint.json.
    files: [
      "src/app/**/*.ts",
      "src/app/**/*.tsx",
      "src/motion/**/*.ts",
      "src/motion/**/*.tsx",
      "src/services/**/*.ts",
      "src/services/**/*.tsx",
      "src/types/**/*.ts",
      "src/types/**/*.tsx",
      "src/config/**/*.ts",
      "src/config/**/*.tsx",
      "src/__tests__/**/*.ts",
      "src/__tests__/**/*.tsx",
      "src/*.ts",
      "src/*.tsx",
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: scopedTypeCheckedRules,
  },
  {
    // T3 test-file carve-out (same shape as T2): unsafe-* OFF in
    // test files under the T3 scope; all other scoped rules,
    // including the two promise ERROR rules, still apply there.
    files: [
      "src/app/**/__tests__/**/*.ts",
      "src/app/**/__tests__/**/*.tsx",
      "src/app/**/*.test.ts",
      "src/app/**/*.test.tsx",
      "src/app/**/*.spec.ts",
      "src/app/**/*.spec.tsx",
      "src/motion/**/__tests__/**/*.ts",
      "src/motion/**/__tests__/**/*.tsx",
      "src/motion/**/*.test.ts",
      "src/motion/**/*.test.tsx",
      "src/motion/**/*.spec.ts",
      "src/motion/**/*.spec.tsx",
      "src/services/**/__tests__/**/*.ts",
      "src/services/**/__tests__/**/*.tsx",
      "src/services/**/*.test.ts",
      "src/services/**/*.test.tsx",
      "src/services/**/*.spec.ts",
      "src/services/**/*.spec.tsx",
      "src/types/**/__tests__/**/*.ts",
      "src/types/**/__tests__/**/*.tsx",
      "src/types/**/*.test.ts",
      "src/types/**/*.test.tsx",
      "src/types/**/*.spec.ts",
      "src/types/**/*.spec.tsx",
      "src/config/**/__tests__/**/*.ts",
      "src/config/**/__tests__/**/*.tsx",
      "src/config/**/*.test.ts",
      "src/config/**/*.test.tsx",
      "src/config/**/*.spec.ts",
      "src/config/**/*.spec.tsx",
      "src/__tests__/**/*.ts",
      "src/__tests__/**/*.tsx",
    ],
    rules: testFileCarveOutRules,
  },
]);

export default eslintConfig;
