/**
 * OwnerIntent: the owner's durable intent as planner input.
 *
 * The planner accepts OwnerIntent alongside the object graph; an empty
 * intent reproduces today's behavior exactly. Three fields are HONORED at
 * minimum (hard requirements):
 *
 *  - prohibitedPositioning: claim predicates that must never appear in
 *    generated presentation copy (e.g. "cheapest", "guaranteed"). The
 *    evidence-binding verifier refuses any slot whose text contains them.
 *  - operatingConstraints: operational realities that remove components
 *    (e.g. "no-online-booking"). Unknown constraint strings are recorded
 *    in the manifest notes, never silently applied and never fatal.
 *  - strategy: the named site strategy override (KNOWLEDGE_WORKER,
 *    TRADES, or TECHNOLOGY). The owner's word beats inference: when set
 *    to a known strategy name, strategy resolution uses it ahead of the
 *    tenant pin and the graph inference. An unknown value is dropped to
 *    undefined (fail closed to no override), never applied.
 *
 * The remaining fields (goals, priorities, preferred/undesired customers,
 * brandDirection, conversionPriorities) are carried on the planned output
 * for the owner patch loop and Ask FYD wiring to consume; the planner
 * itself does not invent copy from them (no manufactured facts).
 */

import { isSiteStrategyName, type SiteStrategyName } from "./strategies";

/** Owner intent as planner input. All fields optional on the way in. */
export interface OwnerIntent {
  /** What the owner wants the site to achieve, free text. */
  goals: string[];
  /** Ordered component names or composition hints, e.g. ["Services", "Contact"]. */
  priorities: string[];
  /** Claim predicates that must NEVER appear in generated copy. */
  prohibitedPositioning: string[];
  /** Customer segments the owner wants more of. */
  preferredCustomers: string[];
  /** Customer segments the owner wants to avoid. */
  undesiredCustomers: string[];
  /** Brand direction in the owner's own words, or null. */
  brandDirection: string | null;
  /** Conversion goals in priority order, e.g. ["call", "website-visit"]. */
  conversionPriorities: string[];
  /** Operational realities, e.g. ["no-online-booking", "no-social-proof"]. */
  operatingConstraints: string[];
  /**
   * Named site strategy override. The owner's word beats inference;
   * honored by strategyForSite as the highest-precedence input.
   */
  strategy?: SiteStrategyName;
}

export const EMPTY_OWNER_INTENT: OwnerIntent = {
  goals: [],
  priorities: [],
  prohibitedPositioning: [],
  preferredCustomers: [],
  undesiredCustomers: [],
  brandDirection: null,
  conversionPriorities: [],
  operatingConstraints: [],
  strategy: undefined,
};

/** Normalize a partial intent: absent fields become empty, never undefined. */
export function normalizeOwnerIntent(partial?: Partial<OwnerIntent> | null): OwnerIntent {
  if (!partial) return { ...EMPTY_OWNER_INTENT };
  return {
    goals: [...(partial.goals ?? [])],
    priorities: [...(partial.priorities ?? [])],
    prohibitedPositioning: [...(partial.prohibitedPositioning ?? [])],
    preferredCustomers: [...(partial.preferredCustomers ?? [])],
    undesiredCustomers: [...(partial.undesiredCustomers ?? [])],
    brandDirection: partial.brandDirection ?? null,
    conversionPriorities: [...(partial.conversionPriorities ?? [])],
    operatingConstraints: [...(partial.operatingConstraints ?? [])],
    // Unknown strategy values are dropped: fail closed to no override.
    strategy: isSiteStrategyName(partial.strategy) ? partial.strategy : undefined,
  };
}

/**
 * Operating constraints the planner honors, mapped to removed components.
 * This table is the complete set: a constraint not listed here is unknown
 * and is recorded, not applied. Adding a constraint is a deliberate,
 * reviewed change, never string matching.
 */
export const OPERATING_CONSTRAINT_COMPONENTS: Record<string, string[]> = {
  "no-online-booking": ["CTA"],
  "no-social-proof": ["SocialProof"],
  "no-people": ["People"],
  "no-posts": ["Posts", "RecentObjects", "ObjectFeed"],
  "no-locations": ["Locations"],
  "no-ask": ["AskFYD"],
  "no-contact": ["Contact"],
};

export interface ConstraintResolution {
  /** Components removed by honored constraints, sorted. */
  removed: string[];
  /** Constraint strings with no table entry, sorted. Recorded, not applied. */
  unknown: string[];
}

/** Resolve operating constraints to component removals. Deterministic. */
export function resolveOperatingConstraints(constraints: string[]): ConstraintResolution {
  const removed = new Set<string>();
  const unknown = new Set<string>();
  for (const c of constraints) {
    const mapped = OPERATING_CONSTRAINT_COMPONENTS[c];
    if (mapped) {
      for (const component of mapped) removed.add(component);
    } else {
      unknown.add(c);
    }
  }
  return {
    removed: [...removed].sort(),
    unknown: [...unknown].sort(),
  };
}
