/**
 * Back-compat: specs written before the new optional fields existed
 * (status, revision, archetype, objectPresence, token groups) still
 * validate and render. resolveCollapseBreakpoint works on legacy tokens.
 */

import { HAPPY_PLACE_RICH_GRAPH } from "../../proceduralize/__fixtures__/happy-place-rich-graph";
import { generateSiteSpec } from "../../proceduralize/generator";
import { isRenderable, validateSiteSpec } from "../validator";
import { DEFAULT_FYD_BREAKPOINTS, resolveCollapseBreakpoint } from "../types";

const OPTS = { generatedAt: "2026-09-21T12:00:00.000Z" };

describe("old SiteSpec compatibility", () => {
  test("a spec with only the original required fields validates clean", () => {
    const spec = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    const legacy = JSON.parse(JSON.stringify(spec));
    delete legacy.status;
    delete legacy.revision;
    delete legacy.archetype;
    delete legacy.objectPresence;
    delete legacy.themeTokens.typography;
    delete legacy.themeTokens.spacing;
    delete legacy.themeTokens.colors;
    delete legacy.themeTokens.surfaces;
    delete legacy.themeTokens.shadows;
    delete legacy.themeTokens.layout;
    delete legacy.themeTokens.breakpoints;
    delete legacy.themeTokens.media;
    delete legacy.themeTokens.motion;
    const knownSchemas = new Set(HAPPY_PLACE_RICH_GRAPH.objects.map((o) => o.schema));
    const findings = validateSiteSpec(legacy, knownSchemas);
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(isRenderable(findings)).toBe(true);
  });

  test("resolveCollapseBreakpoint reads tokens and falls back to lg", () => {
    const theme = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS).themeTokens;
    expect(resolveCollapseBreakpoint({ ...theme, breakpoints: { sm: 1, md: 2, lg: 3, xl: 4 } }, "lg")).toBe(3);
    expect(resolveCollapseBreakpoint(theme, "nope")).toBe(DEFAULT_FYD_BREAKPOINTS.lg);
    expect(DEFAULT_FYD_BREAKPOINTS.lg).toBe(1024);
  });
});
