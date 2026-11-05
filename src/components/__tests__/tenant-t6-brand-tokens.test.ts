/**
 * tenant-t6-brand-tokens.test.ts — pins Website UI audit 2026-11-01
 * finding T6.
 *
 * One tenant's (Happy Place Carpentry's) brand tokens and classes
 * shipped in the GLOBAL stylesheet every surface loads. The fix:
 * the gold-shine rules whose only consumer is HappyBrandSignature
 * moved into a component-scoped stylesheet the component imports;
 * the zero-consumer Happy tokens and classes (happy-light,
 * burnt-cedar, cedar-dust, the six service-category accents, the
 * Playball signature font, .font-signature, .cedar-grain) were
 * deleted outright.
 *
 * Deliberate exceptions, census-backed: --color-walnut STAYS because
 * the global .engraved-corner detail consumes var(--color-walnut)
 * inside the same sheet (deleting it would dangle the var); the
 * generic wood/nature family (oak, pine, moss, river, sky, mist,
 * warm ivory) stays because it is not Happy-specific.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const globals = readFileSync(
  join(__dirname, "..", "..", "app", "globals.css"),
  "utf8",
);
const scoped = readFileSync(
  join(__dirname, "..", "happy-brand-signature.css"),
  "utf8",
);
const component = readFileSync(
  join(__dirname, "..", "happy-brand-signature.tsx"),
  "utf8",
);

describe("tenant audit T6: Happy brand styling is out of the global sheet", () => {
  test("globals.css carries no Happy-specific tokens or classes", () => {
    for (const gone of [
      "--color-happy-light",
      "--color-burnt-cedar",
      "--color-cedar-dust",
      "--color-accent-decks",
      "--color-accent-fences",
      "--color-accent-pergolas",
      "--color-accent-remodeling",
      "--color-accent-repairs",
      "--color-accent-builtins",
      "--font-signature",
      ".font-signature",
      ".cedar-grain",
      "happy-gold",
      "Playball",
    ]) {
      expect(globals).not.toContain(gone);
    }
  });

  test("census-backed exceptions remain: walnut (in-sheet consumer) and the generic wood family", () => {
    expect(globals).toContain("--color-walnut:");
    expect(globals).toContain("var(--color-walnut)");
    expect(globals).toContain("--color-oak:");
    expect(globals).toContain("--color-pine:");
  });

  test("the gold shine lives with its only consumer", () => {
    expect(scoped).toContain(".happy-gold-shine");
    expect(scoped).toContain("@keyframes happy-gold-sweep");
    expect(scoped).toContain(".animate-happy-gold-idle");
    expect(component).toContain('import "./happy-brand-signature.css"');
    expect(component).toContain("happy-gold-shine animate-happy-gold-idle");
  });
});
