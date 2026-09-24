/**
 * Tenant -> strategy operating configuration.
 *
 * The named site strategy is a tenant OPERATING PARAMETER (like design
 * tokens): it selects how a tenant wants to be composed, never what the
 * tenant's facts are. The planner itself is fully generic and never
 * branches on tenant identity; strategy resolution (src/fyd/builder/
 * strategy-for-site.ts) selects the strategy, and this module exposes the
 * strategy's archetype vector for the planner. Unknown tenants resolve
 * through inference to the neutral default, so the route never breaks on
 * a new site.
 */
import { strategyForSite, STRATEGY_PINS } from "./strategy-for-site";
import type { ArchetypeVector } from "./dimensions";

/**
 * Neutral composition: no dimension pulls. Kept exported for callers that
 * need an explicit neutral operating point.
 */
export const DEFAULT_VECTOR: ArchetypeVector = {
  urgency: 0.5,
  trust_requirement: 0.5,
  technical_depth: 0.5,
  human_prominence: 0.5,
  media_density: 0.5,
  service_complexity: 0.5,
  locality: 0.5,
  evidence_density: 0.5,
};

/** The composition operating point for a tenant. Never throws. */
export function vectorForSite(siteId: string): ArchetypeVector {
  return strategyForSite(siteId).vector;
}

/** Tenants with an explicit operating point (for diagnostics, not branching). */
export function configuredSites(): string[] {
  return Object.keys(STRATEGY_PINS).sort();
}
