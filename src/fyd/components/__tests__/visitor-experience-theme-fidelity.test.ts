/**
 * Item 5 (fyd-execution): theme authority regression suite.
 *
 * The architectural bug: VisitorExperience ignored ctx.spec.themeTokens and
 * substituted its own hardcoded palette (ink #142d31, accent #d0edb8,
 * Arial/Helvetica) for every site. Correct ownership is OWNER/PLANNER ->
 * DESIGN TOKENS -> SITE SPEC -> RENDERER: the renderer executes the spec,
 * never re-derives ink/accent/accentForeground/typography.
 *
 * These tests render the component tree for specs with distinctive tokens
 * and assert the output carries the spec's values. Any future component
 * that reintroduces a hardcoded palette fails this suite.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VisitorExperience } from "../visitor-experience";
import type { RenderContext } from "../renderer";
import { HAPPY_PLACE_GRAPH } from "../../proceduralize/__fixtures__/happy-place-graph";
import { COPPERSMITH_GRAPH } from "../../proceduralize/__fixtures__/coppersmith-graph";
import { generateSiteSpec } from "../../proceduralize/generator";
import { applySitePatch, proposeSitePatch } from "../../proceduralize/patch";
import { resolveThemeRoles } from "../../sitespec/theme-roles";
import type { FYDThemeTokens, ObjectGraph } from "../../sitespec/types";

const OPTS = { generatedAt: "2026-09-21T12:00:00.000Z" };

/** The hardcoded FYD house palette the renderer must never reimpose. */
const BANNED = ["#142d31", "#d0edb8", "arial,helvetica"];

function contextFor(graph: ObjectGraph, tokens?: Partial<FYDThemeTokens>): RenderContext {
  const spec = generateSiteSpec(graph, OPTS);
  if (tokens) Object.assign(spec.themeTokens, tokens);
  return {
    graph,
    spec,
    viewer: { viewerId: null, displayName: null },
    siteId: "test",
  };
}

function rendered(ctx: RenderContext): string {
  return renderToStaticMarkup(createElement(VisitorExperience, { ctx })).toLowerCase();
}

describe("theme authority: the spec renders, not the renderer's opinion", () => {
  test("renders spec tokens, never the hardcoded house palette", () => {
    const ctx = contextFor(COPPERSMITH_GRAPH, {
      accent: "#2F6B4F",
      accentForeground: "#f4f8f4",
      surface: "#FDFCF8",
      ink: "#1a2b22",
      fontDisplay: "Fraunces, Georgia, serif",
      fontBody: "Inter, system-ui, sans-serif",
    });
    const html = rendered(ctx);
    const roles = resolveThemeRoles(ctx.spec.themeTokens);
    // The spec's own values reach the output (emitted as --fyd-* vars).
    expect(html).toContain("#2f6b4f");
    expect(html).toContain("#1a2b22");
    expect(html).toContain("fraunces");
    expect(html).toContain("inter, system-ui, sans-serif");
    expect(html).toContain(roles.accentText.toLowerCase());
    // The old silent replacement is gone everywhere it used to live.
    for (const banned of BANNED) {
      expect(html).not.toContain(banned);
    }
  });

  test("both audit sites diverge per their own specs (item-12 regression)", () => {
    const copper = contextFor(COPPERSMITH_GRAPH);
    const happy = contextFor(HAPPY_PLACE_GRAPH, {
      accent: "#2F6B4F",
      accentForeground: "#f4f8f4",
      ink: "#1a2b22",
    });
    const copperHtml = rendered(copper);
    const happyHtml = rendered(happy);
    // Coppersmith carries its own spec values...
    expect(copperHtml).toContain("#c9a227");
    expect(copperHtml).toContain("#232033");
    // ...and Happy Place carries ITS spec's values, not Coppersmith's and
    // not the old house palette.
    expect(happyHtml).toContain("#2f6b4f");
    expect(happyHtml).toContain("#1a2b22");
    expect(happyHtml).not.toContain("#c9a227");
    for (const banned of BANNED) {
      expect(happyHtml).not.toContain(banned);
      expect(copperHtml).not.toContain(banned);
    }
  });

  test("the ask widget receives the spec theme, not an override", () => {
    const ctx = contextFor(HAPPY_PLACE_GRAPH, { accent: "#2F6B4F" });
    const html = rendered(ctx);
    // The widget's submit button binds the spec accent pairing...
    expect(html).toContain("background:#2f6b4f");
    // ...and never the old concierge override values.
    expect(html).not.toContain("background:#d0edb8");
  });

  test("owner-intent theme patch still wins (OWNER -> SPEC -> RENDERER)", () => {
    const ctx = contextFor(COPPERSMITH_GRAPH);
    const patch = proposeSitePatch(ctx.spec, {
      kind: "set_theme_token",
      token: "accent",
      value: "#7A3B2E",
    });
    expect(patch.ok).toBe(true);
    const patched = applySitePatch(ctx.spec, patch.proposal!);
    const html = rendered({ ...ctx, spec: patched });
    expect(html).toContain("#7a3b2e");
    expect(html).not.toContain("#c9a227");
    for (const banned of BANNED) {
      expect(html).not.toContain(banned);
    }
  });

  test("a spec with only base tokens still renders (additive roles)", () => {
    const ctx = contextFor(HAPPY_PLACE_GRAPH);
    delete ctx.spec.themeTokens.accentText;
    delete ctx.spec.themeTokens.mutedForeground;
    delete ctx.spec.themeTokens.onAccent;
    const html = rendered(ctx);
    // Derived roles fill in: the readable accent-text variant renders.
    const roles = resolveThemeRoles(ctx.spec.themeTokens);
    expect(html).toContain(roles.accentText.toLowerCase());
    expect(html).toContain("#c9a227");
  });
});
