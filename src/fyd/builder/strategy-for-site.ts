/**
 * Strategy resolution for a site: which named site strategy composes it.
 *
 * Precedence, highest first:
 *   1. ownerIntent.strategy, when set to a known strategy name
 *      (the owner's word beats inference);
 *   2. inferStrategy(graph).candidate, deterministic schema-role counting;
 *   3. KNOWLEDGE_WORKER, the neutral default (no graph supplied).
 *
 * There are no tenant pins: hand-authored per-site overrides short-circuit
 * inference and silently win over measured graph signals (falsifier F1).
 * Callers that need the composition operating point should prefer
 * vectorForSite(siteId, graph) in ./site-vectors, which measures the
 * 8-dimension vector from the graph via ./signals instead of selecting a
 * hand-authored preset.
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
  if (graph) {
    return SITE_STRATEGIES[inferStrategy(graph).candidate];
  }
  return SITE_STRATEGIES.KNOWLEDGE_WORKER;
}

export type { SiteStrategyName };
