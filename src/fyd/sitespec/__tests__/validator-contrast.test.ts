/**
 * Item 4 (fyd-execution): contrast as token validation.
 *
 * The compiler rejects an invalid foreground/background pairing before it
 * renders: any text-role pairing below WCAG AA 4.5:1 is an error finding and
 * makes the spec unrenderable. This holds for every generated site, forever.
 */

import { HAPPY_PLACE_GRAPH } from "../../proceduralize/__fixtures__/happy-place-graph";
import { COPPERSMITH_GRAPH } from "../../proceduralize/__fixtures__/coppersmith-graph";
import { generateSiteSpec } from "../../proceduralize/generator";
import { isRenderable, validateSiteSpec } from "../validator";
import {
  CONTRAST_TEXT_THRESHOLD,
  contrastRatio,
  ensureTextContrast,
  resolveThemeRoles,
} from "../theme-roles";
import { DEFAULT_FYD_THEME } from "../types";
import type { FYDSiteSpec, ObjectGraph } from "../types";

const OPTS = { generatedAt: "2026-09-21T12:00:00.000Z" };

function specFor(graph: ObjectGraph): FYDSiteSpec {
  return generateSiteSpec(graph, OPTS);
}

function schemasFor(graph: ObjectGraph): Set<string> {
  return new Set(graph.objects.map((o) => o.schema));
}

function contrastFindings(spec: FYDSiteSpec, graph: ObjectGraph) {
  return validateSiteSpec(spec, schemasFor(graph)).filter((f) =>
    f.path.startsWith("themeTokens."),
  );
}

describe("contrast math", () => {
  test("known pairings reproduce the audit measurements", () => {
    // From the item-4 investigation (WCAG relative luminance):
    expect(contrastRatio("#C9A227", "#FFFFFF")).toBeCloseTo(2.42, 1);
    expect(contrastRatio("#1c1917", "#C9A227")).toBeCloseTo(7.23, 1);
    expect(contrastRatio("#232033", "#FFFFFF")).toBeCloseTo(15.84, 1);
  });

  test("unparseable colors return null, never a fabricated ratio", () => {
    expect(contrastRatio("gold", "#FFFFFF")).toBeNull();
    expect(contrastRatio("#C9A227", "paper")).toBeNull();
  });

  test("ensureTextContrast repairs toward the threshold deterministically", () => {
    const a = ensureTextContrast("#C9A227", "#FFFFFF");
    const b = ensureTextContrast("#C9A227", "#FFFFFF");
    expect(a).toBe(b);
    expect(contrastRatio(a, "#FFFFFF")!).toBeGreaterThanOrEqual(CONTRAST_TEXT_THRESHOLD);
    // Already-passing colors pass through untouched.
    expect(ensureTextContrast("#232033", "#FFFFFF")).toBe("#232033");
  });
});

describe("resolveThemeRoles", () => {
  test("defaults preserve historical behavior for base-token specs", () => {
    const roles = resolveThemeRoles({
      accent: "#C9A227",
      accentForeground: "#1c1917",
      surface: "#FFFFFF",
      ink: "#232033",
      radius: "md",
      fontDisplay: "Playfair Display, Georgia, serif",
      fontBody: "Geist, system-ui, sans-serif",
    });
    expect(roles.accentDecorative).toBe("#C9A227");
    expect(roles.foreground).toBe("#232033");
    expect(roles.onAccent).toBe("#1c1917");
    expect(roles.surface).toBe("#FFFFFF");
    expect(contrastRatio(roles.accentText, roles.surface)!).toBeGreaterThanOrEqual(
      CONTRAST_TEXT_THRESHOLD,
    );
    expect(contrastRatio(roles.mutedForeground, roles.surface)!).toBeGreaterThanOrEqual(
      CONTRAST_TEXT_THRESHOLD,
    );
  });

  test("explicit owner roles win over derivation", () => {
    const base = {
      accent: "#C9A227",
      accentForeground: "#1c1917",
      surface: "#FFFFFF",
      ink: "#232033",
      radius: "md" as const,
      fontDisplay: "x",
      fontBody: "y",
      accentText: "#5c4a08",
    };
    expect(resolveThemeRoles(base).accentText).toBe("#5c4a08");
  });

  test("the default theme resolves to contrast-valid roles", () => {
    // Roles are derived at the seams, never stored: the constant keeps only
    // the frozen v1 base fields, so an owner patch to a base token always
    // re-derives its roles from the new value.
    expect(DEFAULT_FYD_THEME.accentText).toBeUndefined();
    const roles = resolveThemeRoles(DEFAULT_FYD_THEME);
    // Base tokens flow through unchanged...
    expect(roles.accentDecorative).toBe("#C9A227");
    expect(roles.foreground).toBe("#232033");
    expect(roles.onAccent).toBe("#1c1917");
    expect(roles.surface).toBe("#FFFFFF");
    // ...and every text-role pairing meets the threshold after derivation.
    const pairs: Array<[string, string]> = [
      [roles.accentText, roles.surface],
      [roles.mutedForeground, roles.surface],
      [roles.foreground, roles.surface],
      [roles.onAccent, DEFAULT_FYD_THEME.accent],
    ];
    for (const [fg, bg] of pairs) {
      expect(contrastRatio(fg, bg)!).toBeGreaterThanOrEqual(CONTRAST_TEXT_THRESHOLD);
    }
  });
});

describe("validateSiteSpec layer 3: token/contrast", () => {
  test("rejects an unreadable accentText pairing", () => {
    const spec = specFor(HAPPY_PLACE_GRAPH);
    // The decorative accent as TEXT on the default surface: 2.42:1.
    spec.themeTokens.accentText = "#C9A227";
    const findings = validateSiteSpec(spec, schemasFor(HAPPY_PLACE_GRAPH));
    const hit = findings.find(
      (f) => f.severity === "error" && f.path === "themeTokens.accentText",
    );
    expect(hit).toBeDefined();
    expect(hit!.message).toMatch(/2\.42/);
    expect(isRenderable(findings)).toBe(false);
  });

  test("the stock generated spec has zero contrast findings", () => {
    const spec = specFor(HAPPY_PLACE_GRAPH);
    // Roles derive at validation time; the generated spec needs no stored roles.
    const findings = contrastFindings(spec, HAPPY_PLACE_GRAPH);
    expect(findings).toEqual([]);
    expect(isRenderable(validateSiteSpec(spec, schemasFor(HAPPY_PLACE_GRAPH)))).toBe(true);
  });

  test("both audit sites pass every text-role pairing (item-12 regression)", () => {
    for (const graph of [HAPPY_PLACE_GRAPH, COPPERSMITH_GRAPH]) {
      const spec = specFor(graph);
      const roles = resolveThemeRoles(spec.themeTokens);
      const pairs: Array<[string, string]> = [
        [roles.accentText, roles.surface],
        [roles.foreground, roles.surface],
        [roles.mutedForeground, roles.surface],
        [roles.onAccent, spec.themeTokens.accent],
        [spec.themeTokens.accentForeground, spec.themeTokens.accent],
      ];
      for (const [fg, bg] of pairs) {
        expect(contrastRatio(fg, bg)!).toBeGreaterThanOrEqual(CONTRAST_TEXT_THRESHOLD);
      }
      expect(contrastFindings(spec, graph)).toEqual([]);
    }
  });

  test("a legacy spec with base tokens only still validates (additive roles)", () => {
    const spec = specFor(HAPPY_PLACE_GRAPH);
    const legacy = JSON.parse(JSON.stringify(spec)) as FYDSiteSpec;
    delete legacy.themeTokens.accentDecorative;
    delete legacy.themeTokens.accentText;
    delete legacy.themeTokens.foreground;
    delete legacy.themeTokens.mutedForeground;
    delete legacy.themeTokens.surfaceForeground;
    delete legacy.themeTokens.onAccent;
    const findings = validateSiteSpec(legacy, schemasFor(HAPPY_PLACE_GRAPH));
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(isRenderable(findings)).toBe(true);
  });

  test("an unreadable owner-overridden foreground is rejected", () => {
    const spec = specFor(HAPPY_PLACE_GRAPH);
    spec.themeTokens.foreground = "#e8e8e8";
    const findings = validateSiteSpec(spec, schemasFor(HAPPY_PLACE_GRAPH));
    expect(
      findings.some((f) => f.severity === "error" && f.path === "themeTokens.foreground"),
    ).toBe(true);
    expect(isRenderable(findings)).toBe(false);
  });

  test("a non-color token value fails closed", () => {
    const spec = specFor(HAPPY_PLACE_GRAPH);
    spec.themeTokens.accentText = "gold";
    const findings = validateSiteSpec(spec, schemasFor(HAPPY_PLACE_GRAPH));
    expect(
      findings.some((f) => f.severity === "error" && f.path === "themeTokens.accentText"),
    ).toBe(true);
    expect(isRenderable(findings)).toBe(false);
  });
});
