/**
 * Site strategies: the named composition substrate for FYD.
 *
 * Nolan ordered three site strategies as composition policies over one
 * shared substrate:
 *
 *   KNOWLEDGE_WORKER - consultants / professional services: expertise,
 *     people, proof, projects/case studies, insights, services, Ask FYD,
 *     contact.
 *   TRADES - local service: services, service area, location, hours, phone,
 *     trust, projects, emergency, quote, Ask FYD.
 *   TECHNOLOGY - software / dev tools: product, technology, architecture,
 *     projects, docs, capabilities, interactive objects, Ask FYD,
 *     technical credibility.
 *
 * These are NOT templates and NOT customer-specific JSX (zero allowed).
 * Every strategy shares one ObjectGraph, one SiteSpec, one component
 * registry, one set of design tokens, one capability model, one renderer,
 * one evidence model, one Ask FYD, and one proposal path. What differs is
 * declared here: the composition policy (section priority, density,
 * navigation strategy, object emphasis) plus the archetype vector handed
 * to the planner.
 *
 * Determinism law: strategies are module-level constants. The same graph
 * plus the same strategy always yields the same vector and the same
 * policy. No timestamps, no randomness, no platform-dependent iteration.
 * Section-priority lists are validated against the component registry at
 * module load: a strategy may only name components that exist.
 */

import { NAMED_PRESET_VECTORS, type ArchetypeVector } from "./dimensions";
import { getComponentDef } from "../components/registry";

/** The three named site strategies. */
export type SiteStrategyName = "KNOWLEDGE_WORKER" | "TRADES" | "TECHNOLOGY";

/** The three strategy names in canonical order (validation, tie-breaks). */
export const SITE_STRATEGY_NAMES: readonly SiteStrategyName[] = [
  "KNOWLEDGE_WORKER",
  "TRADES",
  "TECHNOLOGY",
];

/** True exactly for the three named strategies. Fail closed on garbage. */
export function isSiteStrategyName(v: unknown): v is SiteStrategyName {
  return typeof v === "string" && (SITE_STRATEGY_NAMES as readonly string[]).includes(v);
}

/**
 * Composition policy: the named strategy's declared composition intent.
 *
 * NOTE: this is the strategy-layer policy, not the planner-layer
 * CompositionPolicy in ./dimensions (sectionBoosts derived arithmetically
 * from the archetype vector). The planner still takes the strategy's
 * vector; this policy is the substrate's declared intent that the vector
 * implements, and the surface that future composition work (navigation
 * strategy, density emphasis, object emphasis) reasons over.
 */
export interface CompositionPolicy {
  /** Component IDs (registry names) in priority order, highest first. */
  sectionPriority: string[];
  density: "compact" | "comfortable" | "airy";
  navigationStrategy: "tabs" | "single-page";
  /** Schema role -> emphasis weight in [0, 1]. */
  objectEmphasis: Record<string, number>;
}

/** A named site strategy: policy plus the planner's operating vector. */
export interface SiteStrategy {
  name: SiteStrategyName;
  vector: ArchetypeVector;
  policy: CompositionPolicy;
}

const KNOWLEDGE_WORKER_POLICY: CompositionPolicy = {
  sectionPriority: [
    "Hero",
    "People",
    "Posts",
    "SocialProof",
    "ObjectGrid",
    "Services",
    "BusinessSummary",
    "AskFYD",
    "CTA",
    "Contact",
    "IdentityCard",
    "RecentObjects",
    "ObjectFeed",
    "Products",
    "Locations",
    "Links",
    "ObjectRail",
    "GenericObjectCard",
  ],
  density: "comfortable",
  navigationStrategy: "single-page",
  objectEmphasis: {
    business: 0.6,
    service: 0.7,
    product: 0.4,
    location: 0.3,
    person: 1.0,
    post: 0.8,
    article: 0.9,
  },
};

const TRADES_POLICY: CompositionPolicy = {
  sectionPriority: [
    "Hero",
    "CTA",
    "Contact",
    "Services",
    "Locations",
    "SocialProof",
    "ObjectGrid",
    "People",
    "BusinessSummary",
    "Posts",
    "IdentityCard",
    "Links",
    "ObjectFeed",
    "RecentObjects",
    "Products",
    "AskFYD",
    "ObjectRail",
    "GenericObjectCard",
  ],
  density: "compact",
  navigationStrategy: "single-page",
  objectEmphasis: {
    business: 0.8,
    service: 1.0,
    product: 0.3,
    location: 0.9,
    person: 0.6,
    post: 0.4,
    article: 0.2,
  },
};

const TECHNOLOGY_POLICY: CompositionPolicy = {
  sectionPriority: [
    "Hero",
    "Products",
    "Posts",
    "ObjectGrid",
    "IdentityCard",
    "SocialProof",
    "Services",
    "BusinessSummary",
    "ObjectFeed",
    "RecentObjects",
    "People",
    "CTA",
    "Contact",
    "AskFYD",
    "Links",
    "Locations",
    "ObjectRail",
    "GenericObjectCard",
  ],
  density: "compact",
  navigationStrategy: "tabs",
  objectEmphasis: {
    business: 0.6,
    service: 0.6,
    product: 1.0,
    location: 0.2,
    person: 0.4,
    post: 0.7,
    article: 0.9,
  },
};

/**
 * The three named strategies. Vectors are the NAMED_PRESET_VECTORS points:
 * KNOWLEDGE -> KNOWLEDGE_WORKER, TRADES -> TRADES,
 * TECHNICAL_ENTERPRISE -> TECHNOLOGY.
 */
export const SITE_STRATEGIES: Record<SiteStrategyName, SiteStrategy> = {
  KNOWLEDGE_WORKER: {
    name: "KNOWLEDGE_WORKER",
    vector: NAMED_PRESET_VECTORS.KNOWLEDGE,
    policy: KNOWLEDGE_WORKER_POLICY,
  },
  TRADES: {
    name: "TRADES",
    vector: NAMED_PRESET_VECTORS.TRADES,
    policy: TRADES_POLICY,
  },
  TECHNOLOGY: {
    name: "TECHNOLOGY",
    vector: NAMED_PRESET_VECTORS.TECHNICAL_ENTERPRISE,
    policy: TECHNOLOGY_POLICY,
  },
};

/** Schema roles the objectEmphasis table may weight. Mirrors SCHEMA_ROLES. */
const KNOWN_EMPHASIS_ROLES: readonly string[] = [
  "business",
  "service",
  "product",
  "location",
  "person",
  "post",
  "article",
];

/**
 * Fail-closed validation of the declared policies: every sectionPriority
 * entry must be a registry component, every objectEmphasis key a known
 * schema role, every weight in [0, 1]. Runs at module load so a bad
 * policy can never silently compose a site.
 */
for (const name of SITE_STRATEGY_NAMES) {
  const policy = SITE_STRATEGIES[name].policy;
  for (const id of policy.sectionPriority) {
    if (!getComponentDef(id)) {
      throw new Error('SiteStrategy "' + name + '": unknown component "' + id + '" in sectionPriority.');
    }
  }
  for (const role of Object.keys(policy.objectEmphasis)) {
    if (!KNOWN_EMPHASIS_ROLES.includes(role)) {
      throw new Error('SiteStrategy "' + name + '": unknown schema role "' + role + '" in objectEmphasis.');
    }
    const w = policy.objectEmphasis[role];
    if (typeof w !== "number" || !Number.isFinite(w) || w < 0 || w > 1) {
      throw new Error(
        'SiteStrategy "' + name + '": objectEmphasis weight for "' + role + '" must be a finite number in [0, 1].',
      );
    }
  }
}

Object.freeze(SITE_STRATEGIES);
for (const name of SITE_STRATEGY_NAMES) {
  Object.freeze(SITE_STRATEGIES[name]);
  Object.freeze(SITE_STRATEGIES[name].policy);
}
