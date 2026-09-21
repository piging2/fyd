/**
 * PING practice data contracts (Lane D).
 *
 * These are the ONLY shapes the browser is allowed to see. The server-side
 * BFF (PingObjectReader) selects and sanitizes public Circle fields from the
 * canonical journal. Raw events, private data, tokens, credentials, private
 * keys, and other tenants never cross this boundary.
 */

export interface PingIdentitySummary {
  id: string;
  displayName: string;
  handle: string;
  /** True only when the canonical profile carries an explicit verified mark. */
  verified: boolean;
  /**
   * True only when the canonical profile carries a verified provider claim
   * of type account_link for Facebook. This is a claim badge: it means
   * "this PING identity linked a Facebook account". It never means Facebook
   * owns the identity.
   */
  facebookConnected: boolean;
  followerCount: number;
  followingCount: number;
  /** Relationship state relative to the current practice session viewer. */
  followedByViewer?: boolean;
}

export interface PublicCircleProjection {
  identity: PingIdentitySummary;
  /** Public bio text. Empty string when the profile has no bio. */
  bio: string;
  /** Canonical profile object id. */
  objectId: string;
  /** ISO timestamp of the latest profile version. */
  updatedAt: string;
  viewerFollowing: boolean;
}

export interface PingPost {
  id: string;
  authorId: string;
  authorDisplayName: string;
  authorHandle: string;
  text: string;
  createdAt: string;
  likeCount: number;
  likedByViewer: boolean;
  replyTo: string | null;
}

export interface CreateIdentityInput {
  displayName: string;
  handle: string;
  bio: string;
}

/** Error payload returned by every /api/practice route. */
export interface PracticeApiError {
  code: string;
  message: string;
}
/* Lane A: object substrate contracts (product + intelligence).
 * Profile / Circle / Node / Feed are PROJECTIONS over the same canonical
 * object/event substrate. Browser-visible shapes only; the BFF sanitizes.
 * No new authorities: PingObjectReader stays the single server adapter. */

export const KNOWN_OBJECT_SCHEMAS = [
  "ping.social.profile@1",
  "ping.social.post@1",
  "ping.social.business@1",
  "ping.social.person@1",
  "ping.social.article@1",
  "ping.social.project@1",
  "ping.social.product@1",
  "ping.social.service@1",
  "ping.social.location@1",
  "ping.social.offer@1",
] as const;

export type KnownObjectSchema = (typeof KNOWN_OBJECT_SCHEMAS)[number];
/** Any schema string; known ones get renderers, unknown get generic preview. */
export type PingObjectSchema = KnownObjectSchema | (string & {});

export function isKnownSchema(schema: string): schema is KnownObjectSchema {
  return (KNOWN_OBJECT_SCHEMAS as readonly string[]).includes(schema);
}

export type ObjectVisibility = "public" | "private";

export interface ObjectProvenance {
  kind: "canonical-journal" | "website-derived";
  /** Canonical: creating event id. Website-derived: source content path. */
  ref: string;
  updatedRefs?: string[];
  derivedAt: string;
}

export interface PingObject {
  id: string;
  schema: string;
  /** Controlling identity id. Website-derived objects use a stable web: id. */
  controllerId: string;
  visibility: ObjectVisibility;
  title: string;
  description: string;
  /** Sanitized public scalar fields (strings or string arrays only). */
  fields: Record<string, string | string[]>;
  createdAt: string;
  updatedAt: string;
  provenance: ObjectProvenance;
}

export interface PingRelationship {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  /** Canonical revocation vocab: "inactive" on the same predicate revokes. */
  status: "active" | "inactive";
  createdAt: string;
  /** Canonical event id this projection was derived from. */
  evidenceRef: string;
}

export type CircleKind = "person" | "business" | "organization" | "agent";

export interface CircleNetworkClaim {
  network: string;
  url?: string;
  label?: string;
}

export interface CircleTopObject {
  id: string;
  schema: string;
  title: string;
}

/** Intelligent Circle card. Missing fields are null/empty; UI omits them. */
export interface IntelligentCircleData {
  identity: PingIdentitySummary;
  /** Canonical profile object id, so the Circle can link to the Node page. */
  objectId: string;
  kind: CircleKind | null;
  description: string;
  website: string | null;
  domain: string | null;
  location: string | null;
  category: string | null;
  avatarUrl: string | null;
  networks: CircleNetworkClaim[];
  topObjects: CircleTopObject[];
  relationshipContext: {
    followedByViewer: boolean;
    followsViewer: boolean;
    mutualCount: number;
  };
  provenanceLabel: string;
  updatedAt: string;
}

export type ActionKind =
  | "follow" | "unfollow" | "like" | "unlike" | "open" | "open_website"
  | "ask" | "reference" | "reply" | "propose_update" | "propose_create";

export interface PlannedAction {
  kind: ActionKind;
  label: string;
  /** Machine-readable target. Same model drives human UI and agent context. */
  target:
    | { kind: "object"; objectId: string; schema: string }
    | { kind: "identity"; identityId: string }
    | { kind: "url"; url: string }
    | { kind: "ask"; objectId: string | null; prefill: string | null }
    | { kind: "reference"; referenceId: string }
    | null;
  reason: string;
}

export interface CapabilityPlan {
  viewerId: string | null;
  targetObjectId: string;
  targetSchema: string;
  viewerIsOwner: boolean;
  actions: PlannedAction[];
  capabilities: string[];
}

export type DiscoveryKind =
  | "object_activity" | "relationship_change" | "new_public_object" | "website_content";

export interface DiscoveryFeedItem {
  kind: DiscoveryKind;
  object: PingObject;
  actorId: string | null;
  actorDisplayName: string | null;
  eventTime: string;
  reason: string;
  score: number;
  evidenceRef: string;
}

export interface AskEvidenceRef {
  kind: "object" | "relationship" | "field";
  id: string;
  label: string;
  detail?: string;
}

export interface AskProposal {
  kind: "object_update" | "object_create";
  targetObjectId: string | null;
  schema: string;
  changes: Record<string, string>;
  /** sha256 hex of canonical JSON of {kind,targetObjectId,schema,changes}. */
  digest: string;
  digestAlgorithm: "sha256-canonical-json-v1";
  note: string;
}

export interface AskAnswer {
  /** Sentences; every factual sentence cites evidence as [n]. */
  answer: string;
  evidenceRefs: AskEvidenceRef[];
  relatedObjects: { id: string; schema: string; title: string }[];
  suggestedActions: PlannedAction[];
  /** Draft only. Agents propose, cannot publish. Human approves exact digest. */
  proposal: AskProposal | null;
  partial: boolean;
}

export interface AskContext {
  viewer: { id: string | null; displayName: string | null };
  target: PingObject | null;
  schemaLabel: string;
  relatedObjects: PingObject[];
  relationships: PingRelationship[];
  evidenceRefs: AskEvidenceRef[];
  plan: CapabilityPlan | null;
  limits: { maxRelated: number; maxRelationships: number; maxFieldChars: number };
}

/** Everything the Node page needs in one payload. */
export interface NodePayload {
  object: PingObject;
  relationships: PingRelationship[];
  related: PingObject[];
  controller: PingIdentitySummary | null;
  plan: CapabilityPlan;
}
