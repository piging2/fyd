/**
 * Site vectors: the composition operating point for a tenant.
 *
 * The DEFAULT source is measurement, not hand-authored presets:
 * vectorForSite measures the 8-dimension archetype vector from the
 * verified object graph (signalsForGraph). The named strategy presets
 * (SITE_STRATEGIES) survive as explicit overrides only: the owner's
 * strategy choice, or the no-graph fallback.
 *
 * The planner itself is fully generic and never branches on tenant
 * identity. Unknown tenants resolve through measurement, never to a 404.
 */

import { getPingObjectGraphSync } from "../data/ping-object-source";
import { quantizeVector, type ArchetypeVector } from "./dimensions";
import { signalsForGraph } from "./signals";
import { SITE_STRATEGIES, isSiteStrategyName } from "./strategies";
import { strategyForSite } from "./strategy-for-site";
import type { ObjectGraph } from "../sitespec/types";
import type { OwnerIntent } from "./owner-intent";

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

/**
 * The composition operating point for a site. Never throws.
 *
 * Precedence, highest first:
 *   1. ownerIntent.strategy naming a known strategy -> that strategy's
 *      vector (the owner's explicit word beats measurement);
 *   2. a graph (supplied, or the site's verified projection loaded from
 *      disk) -> the measured signal vector (the default source);
 *   3. otherwise -> the strategy layer's neutral fallback.
 */
export function vectorForSite(
  siteId: string,
  graph?: ObjectGraph | null,
  ownerIntent?: Partial<OwnerIntent> | null,
): ArchetypeVector {
  const override = ownerIntent?.strategy;
  if (isSiteStrategyName(override)) {
    return quantizeVector(SITE_STRATEGIES[override].vector);
  }
  const g = graph ?? loadGraphForSignals(siteId);
  if (g) {
    return signalsForGraph(g).vector;
  }
  return quantizeVector(strategyForSite(siteId).vector);
}

/**
 * Bridge: the build route resolves the vector from the site id alone, but
 * the signal compiler needs the graph. The projection is verified upstream
 * on that route; this load re-reads the same verified bytes
 * synchronously. Fail-soft: a missing or unverifiable projection yields
 * null and the caller falls back to the strategy layer. Callers that
 * already hold the graph should pass it instead of paying for a re-read.
 */
function loadGraphForSignals(siteId: string): ObjectGraph | null {
  try {
    return getPingObjectGraphSync(siteId).graph;
  } catch {
    return null;
  }
}
