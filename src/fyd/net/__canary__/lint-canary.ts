/**
 * S8-01 LINT CANARY: deliberate violations. NEVER import this file.
 *
 * This file exists so the anti-empty-gate test
 * (src/fyd/net/__tests__/lint-canary.test.ts) can prove that the
 * TypeScript parser plus the T1-intended type-checked rules
 * (@typescript-eslint/no-floating-promises and
 * @typescript-eslint/no-explicit-any) actually flag real violations.
 * If the parser, the plugin, or the rules ever silently stop working,
 * that test goes red the same day: the gate can never again be
 * silently empty, which is the exact failure finding FYD-S8-01 records.
 *
 * Exclusions (mechanical, verified by the canary test lane):
 * - eslint: "src/fyd/net/__canary__/**" is in the shipped flat config's
 *   global ignores, so production lint runs never visit this file.
 * - build/typecheck: the repo tsconfig.json does not include src/fyd,
 *   so `tsc --noEmit` never sees this file. It IS included in
 *   tsconfig.eslint.json (all of src), which is what lets the test's
 *   type-aware lint run create a program containing it.
 */

async function canaryProbe(): Promise<number> {
  return 42;
}

export function runLintCanary(): void {
  // Deliberate violation: @typescript-eslint/no-floating-promises.
  canaryProbe();
}

// Deliberate violation: @typescript-eslint/no-explicit-any.
export const canaryAnyValue: any = null;
