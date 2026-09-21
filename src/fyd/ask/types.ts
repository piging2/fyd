/**
 * Ask FYD agent-layer types. The agent context, intents, and review card.
 * Graph and proposal primitives stay in lib/ping/types.
 */

import type {
  AskAnswer,
  AskContext,
  CapabilityPlan,
  FydGrant,
  PingObject,
  PingRelationship,
} from "../../lib/ping/types";
import type { SiteSpecSummary } from "./site-spec";

export type { SiteSpecSummary };
export type { FydGrant };

export interface AskFydContextInput {
  viewer: { id: string | null; displayName: string | null };
  target: PingObject | null;
  relatedObjects: PingObject[];
  relationships: PingRelationship[];
  plan: CapabilityPlan | null;
  grants: FydGrant[];
  siteSpec: SiteSpecSummary | null;
  question: string;
}

/**
 * The bounded agent context: the object-graph context plus the SiteSpec
 * summary, the digest binding, and the capability line the agent reasons
 * under. Built by exactly one builder (context-builder.ts).
 */
export interface AskFydContext {
  base: AskContext;
  siteSpec: SiteSpecSummary | null;
  /** Digest of the spec the agent reasoned over; proposals bind it. */
  siteSpecDigest: string | null;
  /** Grants for this viewer on this target (human/UI view). */
  grants: FydGrant[];
  /** Grants as the agent sees them: forbidden effects stripped. */
  agentGrantList: FydGrant[];
  /** Deterministic capability line for the agent context. */
  capabilitiesLine: string;
  /** Effects the agent may never authorize. */
  forbiddenEffects: readonly FydGrant[];
  request: { question: string };
}

/**
 * Site-change intents Ask FYD can draft. Detection is keyword-anchored and
 * deterministic; authority is checked separately.
 */
export type SitePatchIntent =
  | { kind: "reorder_services_first"; serviceName: string }
  | { kind: "professionalize" }
  | { kind: "feature_object"; objectId: string; objectTitle: string };

/** Human review card for a site_patch proposal. Rendered before approval. */
export interface SitePatchCard {
  title: string;
  before: string[];
  after: string[];
  evidenceReason: string;
  affectedObjects: { id: string; title: string }[];
  operationCount: number;
  siteSpecDigest: string;
}

/** Ask FYD answer: the base answer plus the site-patch review card. */
export interface AskFydAnswer extends AskAnswer {
  sitePatchCard: SitePatchCard | null;
}
