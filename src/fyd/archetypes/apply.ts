/**
 * applyArchetype: pure, deterministic profile application.
 *
 * (specBase, profile, graph?) -> composed FYDSiteSpec. Same inputs always
 * yield byte-identical output: the base is deep-cloned through JSON (key
 * order preserved), section reordering is a stable sort, presence objects
 * are id-sorted, and token merging iterates the override literal in order.
 *
 * Effects: stamps archetype, status draft, revision+1; merges
 * profile.tokenOverrides into themeTokens; applies compositionRules per
 * page (filter excludes, order reorders, maxSections caps); populates
 * spec.objectPresence from the graph when provided.
 *
 * It never invents sections, pages, objects, or facts. The generator
 * missing-data law is untouched; filtering only removes.
 */

import type {
  FYDSection,
  FYDSiteSpec,
  FYDThemeTokens,
  ObjectGraph,
  ObjectPresence,
  ObjectPresenceMode,
} from "../sitespec/types";
import type { ArchetypeCompositionRules, ArchetypeProfile } from "./profiles";

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Merge token overrides into the base tokens. Nested token groups merge one
 * level deep (override keys win, base keys survive); scalar fields replace.
 * Deterministic: iterates the override object in its own key order.
 */
export function mergeThemeTokens(
  base: FYDThemeTokens,
  overrides: Partial<FYDThemeTokens>,
): FYDThemeTokens {
  const out: FYDThemeTokens = { ...base };
  const target = out as unknown as Record<string, unknown>;
  for (const key of Object.keys(overrides)) {
    const v = (overrides as Record<string, unknown>)[key];
    if (v === undefined) continue;
    const bv = target[key];
    const bothObjects =
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      bv !== null &&
      typeof bv === "object" &&
      !Array.isArray(bv);
    target[key] = bothObjects
      ? { ...(bv as Record<string, unknown>), ...(v as Record<string, unknown>) }
      : v;
  }
  return out;
}

function orderSections(
  sections: FYDSection[],
  rules: ArchetypeCompositionRules,
): FYDSection[] {
  const rank = new Map(rules.sectionOrder.map((name, i) => [name, i]));
  const fallback = rules.sectionOrder.length;
  const kept = sections.filter((s) => !rules.sectionFilter.includes(s.component));
  const indexed = kept.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => {
    const ra = rank.get(a.s.component) ?? fallback;
    const rb = rank.get(b.s.component) ?? fallback;
    if (ra !== rb) return ra - rb;
    return a.i - b.i;
  });
  const ordered = indexed.map((x) => x.s);
  return rules.maxSections !== undefined ? ordered.slice(0, rules.maxSections) : ordered;
}

function prominenceToMode(prominence: ArchetypeProfile["objectProminence"]): ObjectPresenceMode {
  if (prominence === "rail") return "rail";
  if (prominence === "drawer") return "drawer";
  return "auto";
}

function presenceFor(
  profile: ArchetypeProfile,
  graph: ObjectGraph,
  ownerObjectId: string,
): ObjectPresence | undefined {
  const objects = graph.objects
    .filter((o) => o.visibility === "public" && o.id !== ownerObjectId)
    .map((o) => o.id)
    .sort();
  if (objects.length === 0) return undefined;
  return {
    mode: prominenceToMode(profile.objectProminence),
    objects,
    rules: { collapseBelow: "lg" },
  };
}

export function applyArchetype(
  specBase: FYDSiteSpec,
  profile: ArchetypeProfile,
  graph?: ObjectGraph,
): FYDSiteSpec {
  const spec = deepClone(specBase);
  spec.archetype = profile.archetype;
  spec.status = "draft";
  spec.revision = (typeof specBase.revision === "number" ? specBase.revision : 0) + 1;
  spec.themeTokens = mergeThemeTokens(specBase.themeTokens, profile.tokenOverrides);
  spec.pages = spec.pages.map((page) => ({
    ...page,
    sections: orderSections(page.sections, profile.compositionRules),
  }));
  if (graph) {
    const presence = presenceFor(profile, graph, specBase.ownerObjectId);
    if (presence) {
      spec.objectPresence = presence;
    } else {
      delete spec.objectPresence;
    }
  }
  return spec;
}
