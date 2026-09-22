/**
 * Tenant -> archetype vector operating configuration.
 *
 * The eight-dimension vector is a tenant OPERATING PARAMETER (like design
 * tokens): it selects how a tenant wants to be composed, never what the
 * tenant's facts are. The planner itself is fully generic and never
 * branches on tenant identity; this map only selects the operating point
 * handed to it. Unknown tenants get the neutral default, so the route
 * never breaks on a new site.
 *
 * The two entries below are the two tenants proven in the structural
 * diff: coppersmith-plumbing (local trade) and ping-fyd (dogfood).
 */
import {
  COPPERSMITH_VECTOR,
  PING_DOGFOOD_VECTOR,
  type ArchetypeVector,
} from "./dimensions";

/** Neutral composition: no dimension pulls. */
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

const SITE_VECTORS: Record<string, ArchetypeVector> = {
  "coppersmith-plumbing": COPPERSMITH_VECTOR,
  "ping-fyd": PING_DOGFOOD_VECTOR,
};

/** The composition operating point for a tenant. Never throws. */
export function vectorForSite(siteId: string): ArchetypeVector {
  return SITE_VECTORS[siteId] ?? DEFAULT_VECTOR;
}

/** Tenants with an explicit operating point (for diagnostics, not branching). */
export function configuredSites(): string[] {
  return Object.keys(SITE_VECTORS).sort();
}
