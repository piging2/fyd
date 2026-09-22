/**
 * FYD archetype profiles: DATA, not code.
 *
 * Three parameterized starting points over the SAME components, layout
 * primitives, tokens, SiteSpec shape, and renderer. Different composition
 * rules, density, type scale, media treatment, CTA emphasis, and object
 * prominence. Profiles are inputs to the deterministic composer
 * (applyArchetype in ./apply.ts); site-level overrides remain owner intent
 * and survive regeneration.
 *
 * No customer-specific values: every profile is generic composition policy.
 */

import type { FYDThemeTokens, FYDSiteArchetype } from "../sitespec/types";

export type ArchetypeProfileId =
  | "fyd.archetype/KNOWLEDGE"
  | "fyd.archetype/TRADES"
  | "fyd.archetype/TECHNICAL_ENTERPRISE";

export interface ArchetypeCompositionRules {
  /**
   * Registry component names in desired order. Components absent from the
   * list keep their original relative order after the listed ones.
   */
  sectionOrder: string[];
  /** Registry component names to exclude from the composed spec. */
  sectionFilter: string[];
  /** Max sections per page after ordering; undefined means no cap. */
  maxSections?: number;
}

export interface ArchetypeProfile {
  profileId: ArchetypeProfileId;
  archetype: FYDSiteArchetype;
  compositionRules: ArchetypeCompositionRules;
  density: "compact" | "comfortable" | "spacious";
  typographyScale: { base: number; ratio: number };
  mediaTreatment: "documentary" | "polished" | "schematic";
  ctaEmphasis: "high" | "medium" | "low";
  objectProminence: "rail" | "drawer" | "subtle";
  tokenOverrides: Partial<FYDThemeTokens>;
}

export const KNOWLEDGE_PROFILE: ArchetypeProfile = {
  profileId: "fyd.archetype/KNOWLEDGE",
  archetype: "KNOWLEDGE",
  compositionRules: {
    sectionOrder: [
      "Hero",
      "BusinessSummary",
      "Posts",
      "ObjectFeed",
      "RecentObjects",
      "People",
      "Locations",
      "Contact",
      "Links",
      "CTA",
      "AskFYD",
    ],
    sectionFilter: [],
  },
  density: "comfortable",
  typographyScale: { base: 16, ratio: 1.2 },
  mediaTreatment: "documentary",
  ctaEmphasis: "medium",
  objectProminence: "rail",
  tokenOverrides: {
    radius: "md",
    typography: { base: 16, ratio: 1.2 },
    media: { treatment: "documentary" },
  },
};

export const TRADES_PROFILE: ArchetypeProfile = {
  profileId: "fyd.archetype/TRADES",
  archetype: "TRADES",
  compositionRules: {
    sectionOrder: [
      "Hero",
      "Services",
      "Products",
      "SocialProof",
      "Locations",
      "People",
      "BusinessSummary",
      "Contact",
      "Links",
      "CTA",
      "AskFYD",
    ],
    sectionFilter: [],
  },
  density: "spacious",
  typographyScale: { base: 16, ratio: 1.25 },
  mediaTreatment: "polished",
  ctaEmphasis: "high",
  objectProminence: "rail",
  tokenOverrides: {
    radius: "lg",
    typography: { base: 16, ratio: 1.25 },
    media: { treatment: "polished" },
  },
};

export const TECHNICAL_ENTERPRISE_PROFILE: ArchetypeProfile = {
  profileId: "fyd.archetype/TECHNICAL_ENTERPRISE",
  archetype: "TECHNICAL_ENTERPRISE",
  compositionRules: {
    sectionOrder: [
      "Hero",
      "IdentityCard",
      "BusinessSummary",
      "ObjectGrid",
      "People",
      "Locations",
      "Contact",
      "Links",
      "CTA",
      "AskFYD",
    ],
    sectionFilter: [],
  },
  density: "compact",
  typographyScale: { base: 15, ratio: 1.125 },
  mediaTreatment: "schematic",
  ctaEmphasis: "low",
  objectProminence: "drawer",
  tokenOverrides: {
    radius: "sm",
    typography: { base: 15, ratio: 1.125 },
    media: { treatment: "schematic" },
  },
};

export const ARCHETYPE_PROFILES: Record<ArchetypeProfileId, ArchetypeProfile> = {
  "fyd.archetype/KNOWLEDGE": KNOWLEDGE_PROFILE,
  "fyd.archetype/TRADES": TRADES_PROFILE,
  "fyd.archetype/TECHNICAL_ENTERPRISE": TECHNICAL_ENTERPRISE_PROFILE,
};

export const ALL_ARCHETYPE_IDS = Object.keys(ARCHETYPE_PROFILES) as ArchetypeProfileId[];

/** Profile for an archetype name; throws on unknown names (fail closed). */
export function profileForArchetype(archetype: FYDSiteArchetype): ArchetypeProfile {
  const found = (Object.values(ARCHETYPE_PROFILES) as ArchetypeProfile[]).find(
    (p) => p.archetype === archetype,
  );
  if (!found) throw new Error("Unknown archetype: " + archetype);
  return found;
}
