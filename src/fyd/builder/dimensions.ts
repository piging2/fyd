/**
 * FYD eight-dimension archetype space: the compiler core's composition input.
 *
 * Builder-1 landed three NAMED profiles (KNOWLEDGE / TRADES /
 * TECHNICAL_ENTERPRISE). This module replaces the named-profile path with a
 * continuous eight-dimensional space. Presets are POINTS in the space; the
 * site planner takes the dimension vector, never a name. The three preset
 * names survive only as vocabulary (nearestPresetName stamps the closest
 * name onto the spec for human readability; it changes nothing about the
 * composition).
 *
 * Determinism law: the same dimension vector ALWAYS yields the same
 * composition policy and therefore the same spec. Vectors are quantized to
 * three decimals before use; policy derivation is pure arithmetic over the
 * quantized vector plus fixed tables. No timestamps, no randomness, no
 * platform-dependent iteration anywhere in this module.
 *
 * The roofer vs emergency-plumber bar: two vectors that differ mainly on
 * `urgency` (and its correlates) must produce different information
 * architecture: different section order on the home page, different CTA
 * emphasis, different presence treatment. See policyForVector and the
 * dimensions tests.
 */

import type { FYDSiteArchetype } from "../sitespec/types";

/** All eight dimensions, in canonical order. Every value is in [0, 1]. */
export interface ArchetypeVector {
  /** 0 = research at leisure, 1 = emergency, call now. */
  urgency: number;
  /** 0 = casual browse, 1 = high-stakes trust decision. */
  trust_requirement: number;
  /** 0 = layperson audience, 1 = expert audience. */
  technical_depth: number;
  /** 0 = brand-only, 1 = people-first. */
  human_prominence: number;
  /** 0 = text-first, 1 = media-rich. */
  media_density: number;
  /** 0 = one service, 1 = complex service catalog. */
  service_complexity: number;
  /** 0 = anywhere/remote, 1 = hyperlocal. */
  locality: number;
  /** 0 = claims-light, 1 = proof-heavy. */
  evidence_density: number;
}

export const ARCHETYPE_DIMENSIONS = [
  "urgency",
  "trust_requirement",
  "technical_depth",
  "human_prominence",
  "media_density",
  "service_complexity",
  "locality",
  "evidence_density",
] as const;

export type ArchetypeDimension = (typeof ARCHETYPE_DIMENSIONS)[number];

/** Fail closed on malformed vectors: NaN, infinities, and out-of-range values are refused. */
export function validateVector(v: ArchetypeVector): void {
  for (const dim of ARCHETYPE_DIMENSIONS) {
    const x = v[dim];
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 1) {
      throw new Error(
        "Invalid archetype vector: dimension \"" + dim + "\" must be a finite number in [0, 1].",
      );
    }
  }
}

/** Quantize to three decimals so float noise can never change composition. */
export function quantizeVector(v: ArchetypeVector): ArchetypeVector {
  validateVector(v);
  const out = {} as ArchetypeVector;
  for (const dim of ARCHETYPE_DIMENSIONS) {
    out[dim] = Math.round(v[dim] * 1000) / 1000;
  }
  return out;
}

function vec(v: Partial<ArchetypeVector> & Record<ArchetypeDimension, number>): ArchetypeVector {
  return v;
}

/**
 * The two tenant operating points for this lane.
 *
 * PING/FYD (dogfood/control): a knowledge-heavy technical consultancy.
 * Low urgency, expert audience, proof-heavy.
 */
export const PING_DOGFOOD_VECTOR: ArchetypeVector = vec({
  urgency: 0.2,
  trust_requirement: 0.7,
  technical_depth: 0.9,
  human_prominence: 0.3,
  media_density: 0.4,
  service_complexity: 0.5,
  locality: 0.6,
  evidence_density: 0.8,
});

/**
 * Coppersmith (private demo): an emergency-capable local trade.
 * High urgency, hyperlocal, trust-first.
 */
export const COPPERSMITH_VECTOR: ArchetypeVector = vec({
  urgency: 0.85,
  trust_requirement: 0.8,
  technical_depth: 0.2,
  human_prominence: 0.5,
  media_density: 0.5,
  service_complexity: 0.3,
  locality: 0.9,
  evidence_density: 0.5,
});

/**
 * The three named presets as points in the space: hypotheses/vocabulary
 * only. The planner never branches on these names.
 */
export const NAMED_PRESET_VECTORS: Record<FYDSiteArchetype, ArchetypeVector> = {
  KNOWLEDGE: vec({
    urgency: 0.25,
    trust_requirement: 0.6,
    technical_depth: 0.55,
    human_prominence: 0.35,
    media_density: 0.55,
    service_complexity: 0.4,
    locality: 0.45,
    evidence_density: 0.7,
  }),
  TRADES: vec({
    urgency: 0.6,
    trust_requirement: 0.7,
    technical_depth: 0.25,
    human_prominence: 0.55,
    media_density: 0.55,
    service_complexity: 0.55,
    locality: 0.85,
    evidence_density: 0.5,
  }),
  TECHNICAL_ENTERPRISE: vec({
    urgency: 0.2,
    trust_requirement: 0.75,
    technical_depth: 0.9,
    human_prominence: 0.25,
    media_density: 0.35,
    service_complexity: 0.6,
    locality: 0.3,
    evidence_density: 0.85,
  }),
};

/** Nearest named preset by euclidean distance: vocabulary stamp only. */
export function nearestPresetName(v: ArchetypeVector): FYDSiteArchetype {
  const q = quantizeVector(v);
  let best: FYDSiteArchetype = "KNOWLEDGE";
  let bestDist = Infinity;
  for (const name of Object.keys(NAMED_PRESET_VECTORS) as FYDSiteArchetype[]) {
    const p = NAMED_PRESET_VECTORS[name];
    let d = 0;
    for (const dim of ARCHETYPE_DIMENSIONS) {
      const diff = q[dim] - p[dim];
      d += diff * diff;
    }
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

/**
 * The composition policy: everything the planner needs from the vector,
 * derived deterministically. Section priority is a per-component boost
 * table; the planner subtracts boosts from a fixed base order and stable-
 * sorts, so the same vector always yields the same section order.
 */
export interface CompositionPolicy {
  /** Component name -> priority boost (higher = earlier). */
  sectionBoosts: Record<string, number>;
  density: "compact" | "comfortable" | "spacious";
  typography: { base: number; ratio: number };
  mediaTreatment: "documentary" | "polished" | "schematic";
  ctaEmphasis: "high" | "medium" | "low";
  presenceMode: "auto" | "rail" | "drawer";
  collapseBelow: string;
  maxSectionsPerPage: number;
  radius: "sm" | "md" | "lg";
}

export function policyForVector(input: ArchetypeVector): CompositionPolicy {
  const v = quantizeVector(input);
  const b: Record<string, number> = {};
  const add = (component: string, boost: number) => {
    b[component] = Math.round(((b[component] ?? 0) + boost) * 1000) / 1000;
  };

  // urgency: the visitor may need help NOW. Contact and CTA surface first.
  // These boosts are deliberately large: at high urgency the contact path
  // must outrank informational sections (the roofer vs emergency-plumber
  // bar: urgency alone reorders the home page). Contact boost 11 moves a
  // 0.95-urgency business's Contact (rank 12 - 10.45 = 1.55) ahead of
  // Locations while a 0.3-urgency roofer's Contact (rank 12 - 3.3 = 8.7)
  // stays where visitors expect it.
  add("CTA", 8 * v.urgency);
  add("Contact", 11 * v.urgency);
  // trust_requirement: proof before pitch.
  add("SocialProof", 3 * v.trust_requirement);
  add("RecentObjects", 1.5 * v.trust_requirement);
  add("ObjectFeed", 1 * v.trust_requirement);
  // technical_depth: compact identity, schematic treatment.
  add("IdentityCard", 1 * v.technical_depth);
  add("BusinessSummary", 0.5 * v.technical_depth);
  // human_prominence: the people behind the business.
  add("People", 3 * v.human_prominence);
  // media_density: visual evidence first.
  add("ObjectGrid", 2 * v.media_density);
  add("ObjectFeed", 1.5 * v.media_density);
  add("Posts", 1 * v.media_density);
  // service_complexity: the catalog is the site.
  add("Services", 3 * v.service_complexity);
  add("Products", 1.5 * v.service_complexity);
  // locality: where the business operates.
  add("Locations", 3 * v.locality);
  // evidence_density: claims backed by visible proof.
  add("SocialProof", 2 * v.evidence_density);
  add("Posts", 1.5 * v.evidence_density);
  add("RecentObjects", 1 * v.evidence_density);

  const density =
    v.technical_depth >= 0.65 ? "compact" : v.media_density >= 0.65 ? "spacious" : "comfortable";
  const typography =
    density === "compact"
      ? { base: 15, ratio: 1.125 }
      : density === "spacious"
        ? { base: 16, ratio: 1.25 }
        : { base: 16, ratio: 1.2 };
  const mediaTreatment =
    v.technical_depth >= 0.65 ? "schematic" : v.media_density >= 0.65 ? "polished" : "documentary";
  const ctaEmphasis = v.urgency >= 0.65 ? "high" : v.trust_requirement >= 0.65 ? "medium" : "low";
  const presenceMode =
    v.human_prominence >= 0.6 ? "rail" : v.technical_depth >= 0.65 ? "drawer" : "auto";

  return {
    sectionBoosts: b,
    density,
    typography,
    mediaTreatment,
    ctaEmphasis,
    presenceMode,
    collapseBelow: "lg",
    maxSectionsPerPage: 6 + Math.round(6 * v.service_complexity),
    radius: density === "compact" ? "sm" : density === "spacious" ? "lg" : "md",
  };
}
