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
import type { AskFieldConflict } from "./field-conflicts";
import type { FieldVisibilityDecision } from "../sitespec/field-visibility";

export type { SiteSpecSummary };
export type { FydGrant };

/**
 * The viewer an Ask FYD model context is built for.
 *
 * `verified` is true only when a bound OwnerIdentityProvider verified this
 * viewer. Nothing in the Ask pipeline sets it today, so every current
 * viewer classifies as "visitor" (see classifyAskViewer in
 * ./context-projection.ts). In particular, demo and practice identities
 * are never verified: they classify as visitors.
 */
export interface AskViewerIdentity {
  id: string | null;
  displayName: string | null;
  verified?: boolean;
}

/**
 * Ask FYD viewer classes. "owner" requires a verified identity; every
 * other viewer is "visitor". There is no elevation path that does not
 * go through verification.
 */
export type AskViewerClass = "owner" | "visitor";

export interface AskFydContextInput {
  viewer: AskViewerIdentity;
  target: PingObject | null;
  relatedObjects: PingObject[];
  relationships: PingRelationship[];
  plan: CapabilityPlan | null;
  grants: FydGrant[];
  siteSpec: SiteSpecSummary | null;
  question: string;
  /**
   * Owner field-visibility decisions honored by the projection
   * (context-projection.ts). A HIDE here drops the field from the model
   * context even when the field name is otherwise visitor-safe.
   */
  fieldVisibilityDecisions?: FieldVisibilityDecision[];
  /** Declared unresolved field conflicts (FYD-Q1). Fail-closed. */
  fieldConflicts?: AskFieldConflict[];
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
  /** Declared unresolved field conflicts (FYD-Q1). Fail-closed. */
  fieldConflicts: AskFieldConflict[];
  /** How the viewer classified for this context (fail-closed). */
  viewerClass: AskViewerClass;
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
  /**
   * Consequence + change kind (owner-facing language law): a site_patch
   * is always LOW / change-website (presentation intent, projection
   * only), never a knowledge transition.
   */
  consequence: "LOW";
  changeKind: "change-website";
}

/** Ask FYD answer: the base answer plus the site-patch review card. */
export interface AskFydAnswer extends AskAnswer {
  sitePatchCard: SitePatchCard | null;
}
