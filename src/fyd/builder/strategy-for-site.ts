/**
 * Strategy resolution for a site: which named site strategy composes it.
 *
 * Precedence, highest first:
 *   1. ownerIntent.strategy, when set to a known strategy name
 *      (the owner's word beats inference);
 *   2. STRATEGY_PINS[siteId], the explicit tenant pin;
 *   3. inferStrategy(graph).candidate, deterministic schema-role counting;
 *   4. KNOWLEDGE_WORKER, the neutral default (no graph supplied).
 *
 * Never throws: unknown site ids, missing graphs, and invalid owner
 * overrides all resolve to a real strategy. Deterministic: the same
 * (siteId, graph, ownerIntent) always resolves the same strategy.
 */

import {
  SITE_STRATEGIES,
  isSiteStrategyName,
  type SiteStrategy,
  type SiteStrategyName,
} from "./strategies";
import { inferStrategy } from "./infer-strategy";
import type { ObjectGraph } from "../sitespec/types";
import type { OwnerIntent } from "./owner-intent";

/**
 * Explicit tenant -> strategy pins. These are operating parameters, not
 * customer JSX: they name which named strategy a tenant composes under.
 * ping-fyd is the dogfood technology consultancy; coppersmith-plumbing is
 * the local trade demo. Unknown tenants fall through to inference, never
 * to a 404.
 */
export const STRATEGY_PINS: Record<string, SiteStrategyName> = {
  "ping-fyd": "TECHNOLOGY",
  "coppersmith-plumbing": "TRADES",
};

/** The composition strategy for a site. Never throws. */
export function strategyForSite(
  siteId: string,
  graph?: ObjectGraph | null,
  ownerIntent?: Partial<OwnerIntent> | null,
): SiteStrategy {
  const override = ownerIntent?.strategy;
  if (isSiteStrategyName(override)) {
    return SITE_STRATEGIES[override];
  }
  const pin = STRATEGY_PINS[siteId];
  if (pin !== undefined) {
    return SITE_STRATEGIES[pin];
  }
  if (graph) {
    return SITE_STRATEGIES[inferStrategy(graph).candidate];
  }
  return SITE_STRATEGIES.KNOWLEDGE_WORKER;
}
