/**
 * S8-01 anti-empty-gate canary test.
 *
 * Finding FYD-S8-01: the repo lint gate was simultaneously red and
 * empty (zero rules, no TypeScript parser, TS never visited). Tranches
 * T0/T0.5 restored a green-but-empty baseline with the parser wired and
 * the plugins registered; the type-checked ruleset lands per tranche
 * from T1 on. This test is the guard that keeps the gate from ever
 * going silently empty again:
 *
 * (a) It runs ESLint on the committed canary file
 *     (src/fyd/net/__canary__/lint-canary.ts) with the T1-intended
 *     ruleset configuration supplied by THIS test (typescript-eslint
 *     parser + tsconfig.eslint.json project + the two correctness
 *     rules), and asserts both expected ruleIds are flagged. This
 *     proves the parser, the plugin, the eslint tsconfig, and the
 *     rules genuinely work end to end on this tree.
 * (b) It loads the SHIPPED flat config for a real src/fyd file and
 *     asserts a TypeScript parser is registered and the
 *     @typescript-eslint, react-hooks, and @next/next plugins are
 *     present. If anyone removes the parser wiring or the plugin
 *     registrations from eslint.config.mjs, this goes red. At T1
 *     (2026-11-19) it also asserts the shipped config resolves
 *     @typescript-eslint/no-floating-promises and
 *     @typescript-eslint/no-misused-promises at error severity for
 *     the src/fyd probe file, with a non-zero @typescript-eslint
 *     rule count: removing the T1 scope block, downgrading the two
 *     promise rules, or narrowing the scope away from src/fyd turns
 *     this red the same day. At T2 (2026-11-19) the probe also
 *     reads the shipped config for a src/lib probe file, a
 *     src/components probe file, and a src/lib test file,
 *     asserting the T2 scope resolves the same two rules at
 *     error severity for the production probes and that the
 *     test-file carve-out holds in the test probe (unsafe-* off,
 *     promise rules still errors): removing the T2 scope block,
 *     restoring the src/lib / src/components ignores, or dropping
 *     the carve-out turns this red the same day.
 *     At T3 (2026-11-19) the probe also reads the shipped
 *     config for a src/app probe file, a src/motion probe
 *     file, and a src/app test file, asserting the T3 scope
 *     resolves the same two rules at error severity for the
 *     production probes and that the test-file carve-out
 *     holds in the T3 test probe. Together with the T1 and
 *     T2 probes this asserts the full coverage claim: a
 *     probe file from every scoped area of src resolves the
 *     two promise rules at error severity, so removing any
 *     tranche's scope block, restoring any tranche's
 *     ignores, or downgrading the error rules turns this
 *     red the same day. With T3 every TS/TSX file under
 *     src is inside a scoped block.
 *
 * Both checks execute in a child Node process, not in Jest's module
 * registry: Jest's CommonJS registry cannot dynamic-import the ESM
 * flat config ("A dynamic import callback was invoked without
 * --experimental-vm-modules") and does not give typescript-estree a
 * working program for type-aware rules. The probe below is plain
 * Node ESM run with cwd at the repo root; it prints one JSON line
 * that the assertions consume. The probe logic is identical in shape
 * to running the same ESLint calls from any Node script.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const repoRoot = path.resolve(__dirname, "../../../..");
const canaryPath = path.join(
  repoRoot,
  "src/fyd/net/__canary__/lint-canary.ts",
);
const fydProbePath = path.join(repoRoot, "src/fyd/net/rate-limit.ts");
const libProbePath = path.join(repoRoot, "src/lib/metrics.ts");
const compProbePath = path.join(repoRoot, "src/components/visual-slot.tsx");
const libTestProbePath = path.join(
  repoRoot,
  "src/lib/__tests__/media-authority-route.test.ts",
);
const appProbePath = path.join(
  repoRoot,
  "src/app/api/mc/approvals/route.ts",
);
const motionProbePath = path.join(repoRoot, "src/motion/index.ts");
const appTestProbePath = path.join(
  repoRoot,
  "src/app/api/readyz/__tests__/route.test.ts",
);

// The probe builds a type-aware TS program over all of src; allow time.
jest.setTimeout(300_000);

const PROBE = [
  'import { ESLint } from "eslint";',
  'import tsParser from "@typescript-eslint/parser";',
  'import tsPlugin from "@typescript-eslint/eslint-plugin";',
  'import * as fs from "node:fs";',
  'import * as path from "node:path";',
  "const repoRoot = process.cwd();",
  'const canaryPath = path.join(repoRoot, "src/fyd/net/__canary__/lint-canary.ts");',
  'const probePath = path.join(repoRoot, "src/fyd/net/rate-limit.ts");',
  'const libProbePath = path.join(repoRoot, "src/lib/metrics.ts");',
  'const compProbePath = path.join(repoRoot, "src/components/visual-slot.tsx");',
  'const libTestProbePath = path.join(repoRoot, "src/lib/__tests__/media-authority-route.test.ts");',
  'const appProbePath = path.join(repoRoot, "src/app/api/mc/approvals/route.ts");',
  'const motionProbePath = path.join(repoRoot, "src/motion/index.ts");',
  'const appTestProbePath = path.join(repoRoot, "src/app/api/readyz/__tests__/route.test.ts");',
  "const a = new ESLint({",
  "  cwd: repoRoot,",
  "  overrideConfigFile: true,",
  "  overrideConfig: [",
  "    {",
  '      files: ["**/*.ts", "**/*.tsx"],',
  "      languageOptions: {",
  "        parser: tsParser,",
  "        parserOptions: {",
  '          project: path.join(repoRoot, "tsconfig.eslint.json"),',
  "          tsconfigRootDir: repoRoot,",
  "        },",
  "      },",
  '      plugins: { "@typescript-eslint": tsPlugin },',
  "      rules: {",
  '        "@typescript-eslint/no-floating-promises": "error",',
  '        "@typescript-eslint/no-explicit-any": "error",',
  "      },",
  "    },",
  "  ],",
  "});",
  'const code = fs.readFileSync(canaryPath, "utf8");',
  "const results = await a.lintText(code, { filePath: canaryPath });",
  "const ruleIds = Array.from(new Set(results[0].messages.map((m) => m.ruleId).filter(Boolean)));",
  "const b = new ESLint({ cwd: repoRoot });",
  "const cfg = await b.calculateConfigForFile(probePath);",
  "const parserName = cfg && cfg.languageOptions && cfg.languageOptions.parser && cfg.languageOptions.parser.meta ? cfg.languageOptions.parser.meta.name : null;",
  "const plugins = cfg && cfg.plugins ? Object.keys(cfg.plugins) : [];",
  "const rules = (cfg && cfg.rules) || {};",
  "const sevOf = (name) => { const v = rules[name]; if (v === undefined) return null; const s = Array.isArray(v) ? v[0] : v; return s === \"error\" ? 2 : s === \"warn\" ? 1 : s === \"off\" ? 0 : s; };",
  "const tsRuleCount = Object.keys(rules).filter((k) => k.startsWith(\"@typescript-eslint/\")).length;",
  "const sevFor = (r, n) => { const v = r[n]; if (v === undefined) return null; const s = Array.isArray(v) ? v[0] : v; return s === \"error\" ? 2 : s === \"warn\" ? 1 : s === \"off\" ? 0 : s; };",
  "const summarize = (c) => { const r = (c && c.rules) || {}; const unsafe = Object.keys(r).filter((k) => k.startsWith(\"@typescript-eslint/no-unsafe-\")); return { floating: sevFor(r, \"@typescript-eslint/no-floating-promises\"), misused: sevFor(r, \"@typescript-eslint/no-misused-promises\"), tsCount: Object.keys(r).filter((k) => k.startsWith(\"@typescript-eslint/\")).length, unsafeOff: unsafe.filter((k) => sevFor(r, k) === 0).length, unsafeNonOff: unsafe.filter((k) => sevFor(r, k) !== 0).length }; };",
  "const libSummary = summarize(await b.calculateConfigForFile(libProbePath));",
  "const compSummary = summarize(await b.calculateConfigForFile(compProbePath));",
  "const testSummary = summarize(await b.calculateConfigForFile(libTestProbePath));",
  "const appSummary = summarize(await b.calculateConfigForFile(appProbePath));",
  "const motionSummary = summarize(await b.calculateConfigForFile(motionProbePath));",
  "const appTestSummary = summarize(await b.calculateConfigForFile(appTestProbePath));",
  "console.log(JSON.stringify({ ruleIds, parserName, plugins, floatingSeverity: sevOf(\"@typescript-eslint/no-floating-promises\"), misusedSeverity: sevOf(\"@typescript-eslint/no-misused-promises\"), tsRuleCount, lib: libSummary, comp: compSummary, test: testSummary, app: appSummary, motion: motionSummary, appTest: appTestSummary }));",
].join("\n");

interface ScopeSummary {
  floating: number | null;
  misused: number | null;
  tsCount: number;
  unsafeOff: number;
  unsafeNonOff: number;
}

interface ProbeResult {
  ruleIds: string[];
  parserName: string | null;
  plugins: string[];
  floatingSeverity: number | null;
  misusedSeverity: number | null;
  tsRuleCount: number;
  lib: ScopeSummary;
  comp: ScopeSummary;
  test: ScopeSummary;
  app: ScopeSummary;
  motion: ScopeSummary;
  appTest: ScopeSummary;
}

let probeResult: ProbeResult;

beforeAll(() => {
  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", PROBE],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 280_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const lastLine = out.trim().split("\n").pop() ?? "";
  probeResult = JSON.parse(lastLine) as ProbeResult;
});

describe("S8-01 lint canary (anti-empty-gate guard)", () => {
  it("flags both deliberate violations in the canary file under the T1-intended ruleset", () => {
    expect(fs.existsSync(canaryPath)).toBe(true);
    expect(probeResult.ruleIds).toContain(
      "@typescript-eslint/no-floating-promises",
    );
    expect(probeResult.ruleIds).toContain("@typescript-eslint/no-explicit-any");
  });

  it("shipped flat config registers the TypeScript parser and plugins for src/fyd files", () => {
    expect(fs.existsSync(fydProbePath)).toBe(true);
    // The parser's registered meta name drops the npm scope.
    expect(probeResult.parserName).toBe("typescript-eslint/parser");
    expect(probeResult.plugins).toContain("@typescript-eslint");
    expect(probeResult.plugins).toContain("react-hooks");
    expect(probeResult.plugins).toContain("@next/next");
  });

  it("shipped flat config resolves the T1 error rules at error severity for src/fyd files", () => {
    // T1: the shipped config itself carries the src/fyd scope now.
    // Severity 2 is "error" in the calculated config.
    expect(probeResult.floatingSeverity).toBe(2);
    expect(probeResult.misusedSeverity).toBe(2);
    expect(probeResult.tsRuleCount).toBeGreaterThan(0);
  });

  it("shipped flat config resolves the T2 error rules at error severity for src/lib and src/components files", () => {
    // T2: removing the T2 scope block (or restoring the src/lib /
    // src/components ignores) turns this red the same day.
    expect(fs.existsSync(libProbePath)).toBe(true);
    expect(fs.existsSync(compProbePath)).toBe(true);
    expect(probeResult.lib.floating).toBe(2);
    expect(probeResult.lib.misused).toBe(2);
    expect(probeResult.lib.tsCount).toBeGreaterThan(0);
    expect(probeResult.comp.floating).toBe(2);
    expect(probeResult.comp.misused).toBe(2);
    expect(probeResult.comp.tsCount).toBeGreaterThan(0);
  });

  it("test files under the T2 scope carry the carve-out: unsafe-* off, promise rules still errors", () => {
    // BASELINE.md section 4: in test files the unsafe-* family is
    // off, but the correctness rules stay on at error severity.
    expect(fs.existsSync(libTestProbePath)).toBe(true);
    expect(probeResult.test.floating).toBe(2);
    expect(probeResult.test.misused).toBe(2);
    expect(probeResult.test.unsafeOff).toBeGreaterThan(0);
    expect(probeResult.test.unsafeNonOff).toBe(0);
  });

  it("shipped flat config resolves the T3 error rules at error severity for src/app and remainder files (full coverage)", () => {
    // T3: removing the T3 scope block (or restoring the
    // src/app / src/motion / src/services / src/types /
    // src/config ignores) turns this red the same day. With
    // the T1 probe (src/fyd), the T2 probes (src/lib,
    // src/components), and these T3 probes (src/app,
    // src/motion for the remainder areas), a probe file from
    // every scoped area of src resolves the two promise
    // rules at error severity: the full-coverage claim.
    expect(fs.existsSync(appProbePath)).toBe(true);
    expect(fs.existsSync(motionProbePath)).toBe(true);
    expect(probeResult.app.floating).toBe(2);
    expect(probeResult.app.misused).toBe(2);
    expect(probeResult.app.tsCount).toBeGreaterThan(0);
    expect(probeResult.motion.floating).toBe(2);
    expect(probeResult.motion.misused).toBe(2);
    expect(probeResult.motion.tsCount).toBeGreaterThan(0);
  });

  it("test files under the T3 scope carry the carve-out: unsafe-* off, promise rules still errors", () => {
    // Same shape as the T2 carve-out (BASELINE.md section 4).
    expect(fs.existsSync(appTestProbePath)).toBe(true);
    expect(probeResult.appTest.floating).toBe(2);
    expect(probeResult.appTest.misused).toBe(2);
    expect(probeResult.appTest.unsafeOff).toBeGreaterThan(0);
    expect(probeResult.appTest.unsafeNonOff).toBe(0);
  });
});
