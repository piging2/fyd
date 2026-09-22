/**
 * Archetype composition tests.
 *
 * Determinism: same (specBase, profile) always yields byte-identical
 * output. Absence: no profile means byte-identical current generator
 * output. Survival: owner presentation overrides persist through
 * composition. Derivation: objectPresence comes from the graph, sorted,
 * never invented.
 */

import { HAPPY_PLACE_RICH_GRAPH } from "../../proceduralize/__fixtures__/happy-place-rich-graph";
import { generateSiteSpec } from "../../proceduralize/generator";
import { applyArchetype, mergeThemeTokens } from "../apply";
import {
  ALL_ARCHETYPE_IDS,
  ARCHETYPE_PROFILES,
  KNOWLEDGE_PROFILE,
  TRADES_PROFILE,
  profileForArchetype,
} from "../profiles";
import type { FYDSiteSpec } from "../../sitespec/types";

const OPTS = {
  generatedAt: "2026-09-21T12:00:00.000Z",
  eventSequences: [65, 83] as [number, number],
};

function baseSpec(): FYDSiteSpec {
  return generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
}

describe("applyArchetype", () => {
  test("same inputs produce byte-identical specs", () => {
    const a = applyArchetype(baseSpec(), TRADES_PROFILE, HAPPY_PLACE_RICH_GRAPH);
    const b = applyArchetype(baseSpec(), TRADES_PROFILE, HAPPY_PLACE_RICH_GRAPH);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("absent profile leaves generator output byte-identical", () => {
    const plain = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    const viaOpt = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, { ...OPTS, profile: undefined });
    expect(JSON.stringify(plain)).toBe(JSON.stringify(viaOpt));
    expect(plain.archetype).toBeUndefined();
    expect(plain.objectPresence).toBeUndefined();
    expect(plain.status).toBeUndefined();
    expect(plain.revision).toBeUndefined();
  });

  test("stamps archetype, draft status, and revision", () => {
    const out = applyArchetype(baseSpec(), TRADES_PROFILE);
    expect(out.archetype).toBe("TRADES");
    expect(out.status).toBe("draft");
    expect(out.revision).toBe(1);
  });

  test("reorders sections per profile without inventing any", () => {
    const out = applyArchetype(baseSpec(), TRADES_PROFILE);
    const home = out.pages.find((p) => p.slug === "home");
    expect(home).toBeDefined();
    const rank = new Map(TRADES_PROFILE.compositionRules.sectionOrder.map((n, i) => [n, i]));
    const comps = home!.sections.map((s) => s.component).filter((c) => rank.has(c));
    const ranks = comps.map((c) => rank.get(c) as number);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    const baseIds = new Set(baseSpec().pages.flatMap((p) => p.sections.map((s) => s.id)));
    for (const s of out.pages.flatMap((p) => p.sections)) {
      expect(baseIds.has(s.id)).toBe(true);
    }
  });

  test("maxSections caps the composed pages", () => {
    const capped = {
      ...TRADES_PROFILE,
      compositionRules: { ...TRADES_PROFILE.compositionRules, maxSections: 2 },
    };
    const out = applyArchetype(baseSpec(), capped);
    for (const p of out.pages) {
      expect(p.sections.length).toBeLessThanOrEqual(2);
    }
  });

  test("owner presentation overrides survive composition", () => {
    const base = baseSpec();
    const home = base.pages.find((p) => p.slug === "home");
    expect(home).toBeDefined();
    home!.sections[0].presentation.heading = "Owner custom heading";
    home!.sections[1].presentation.hidden = true;
    const out = applyArchetype(base, KNOWLEDGE_PROFILE);
    const outHome = out.pages.find((p) => p.slug === "home");
    expect(outHome).toBeDefined();
    const edited = outHome!.sections.find((s) => s.id === home!.sections[0].id);
    expect(edited?.presentation.heading).toBe("Owner custom heading");
    const hidden = outHome!.sections.find((s) => s.id === home!.sections[1].id);
    expect(hidden?.presentation.hidden).toBe(true);
  });

  test("token overrides merge without losing base tokens", () => {
    const base = baseSpec();
    const out = applyArchetype(base, TRADES_PROFILE);
    expect(out.themeTokens.radius).toBe("lg");
    expect(out.themeTokens.accent).toBe(base.themeTokens.accent);
    expect(out.themeTokens.typography?.ratio).toBe(1.25);
  });

  test("presence derives from the graph: public non-owner objects, id-sorted", () => {
    const base = baseSpec();
    const out = applyArchetype(base, TRADES_PROFILE, HAPPY_PLACE_RICH_GRAPH);
    const presence = out.objectPresence;
    expect(presence).toBeDefined();
    expect(presence!.mode).toBe("rail");
    const expected = HAPPY_PLACE_RICH_GRAPH.objects
      .filter((o) => o.visibility === "public" && o.id !== base.ownerObjectId)
      .map((o) => o.id)
      .sort();
    expect(expected.length).toBeGreaterThan(0);
    expect(presence!.objects).toEqual(expected);
    expect(presence!.rules.collapseBelow).toBe("lg");
  });

  test("no presence without a graph", () => {
    const out = applyArchetype(baseSpec(), TRADES_PROFILE);
    expect(out.objectPresence).toBeUndefined();
  });

  test("profiles are data: three ids, round-trip through profileForArchetype", () => {
    expect(ALL_ARCHETYPE_IDS).toHaveLength(3);
    for (const p of Object.values(ARCHETYPE_PROFILES)) {
      expect(profileForArchetype(p.archetype)).toBe(p);
      expect(ALL_ARCHETYPE_IDS).toContain(p.profileId);
    }
    expect(() => profileForArchetype("NOPE" as never)).toThrow();
  });

  test("mergeThemeTokens skips undefined and never mutates the base", () => {
    const base = baseSpec().themeTokens;
    const before = JSON.stringify(base);
    const merged = mergeThemeTokens(base, { radius: "sm", accent: undefined as never });
    expect(merged.radius).toBe("sm");
    expect(merged.accent).toBe(base.accent);
    expect(JSON.stringify(base)).toBe(before);
  });
});
