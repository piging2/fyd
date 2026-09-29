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

export type ObjectProvenanceKind =
  | "canonical-journal"
  | "website-derived"
  | "overlay-authored";

export interface ObjectProvenance {
  /** "overlay-authored" (2026-09-22): content added by a demo/overlay
   *  operator into the site record. It is neither the website's own
   *  words nor a recorded journal fact, and must never be
   *  classified as either. */
  kind: ObjectProvenanceKind;
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
  /**
   * Owner-attested field corrections composed onto the projection by the
   * FYD read seam (src/fyd/object/owner-overlay.ts), AFTER the projection's
   * digest verification. The PING dump never writes this key: it is read-
   * model state, not source state. fields[] carries the EFFECTIVE
   * (owner-winning) value; each record here preserves what the source said
   * (sourceValue) alongside what the owner says (ownerValue), plus the
   * correction's own provenance. Absent when the owner corrected nothing.
   */
  ownerFieldCorrections?: OwnerFieldCorrection[];
}

/**
 * One owner-attested field correction. The system of record is the owner
 * store (data/fyd-owner/<objectId>.json); the read seam attaches copies
 * here so every consumer of the projection sees the same effective value
 * with the same provenance. SOURCE SAYS X / OWNER SAYS Y is never
 * collapsed: sourceValue is the source's value when the correction was
 * recorded (the source record itself is untouched), ownerValue is what
 * the owner attests.
 */
export interface OwnerFieldCorrection {
  /**
   * Correctable field. Contact fields (phone/email/website) target the
   * business object; "description" targets a service object via
   * targetObjectId (the render binding-verifier already binds
   * title/description/fields-key assertions per object).
   */
  field: "phone" | "email" | "website" | "description";
  /**
   * Object the correction targets. Absent = the business object (the
   * legacy contact-field corrections, which resolve the single public
   * business object at compose time). Present = the object is resolved
   * by id at compose time (e.g. a service object for a description
   * correction).
   */
  targetObjectId?: string;
  /** Human label, e.g. "Phone". */
  label: string;
  /** What the source projection said when the correction was recorded. Null when the source had no value. */
  sourceValue: string | null;
  /** What the owner says the value is. This is the effective value. */
  ownerValue: string;
  /** ISO timestamp of the correction. */
  correctedAt: string;
  /**
   * Authority label for the actor that recorded the correction. In demo
   * mode this is the seeded demo actor label ("Demo Owner (seeded,
   * unverified)"): an explicit non-identity, never a verified owner.
   * The real-identity seam attaches here later.
   */
  actorLabel: string;
  /** Human basis sentence, e.g. "Owner correction: the owner says this is the main number." */
  basis: string;
  /**
   * Read-model derivation (never stored): true when the source's CURRENT
   * value differs from sourceValue, i.e. the source was re-observed after
   * the correction and now contradicts what it said then. The owner value
   * still wins; this flag makes the drift visible instead of silent.
   */
  sourceDrifted?: boolean;
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
  | "follow" | "unfollow" | "like" | "unlike" | "open" | "open_site" | "open_website"
  | "ask" | "reference" | "reply" | "propose_update" | "propose_create" | "propose_site_patch";

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

/** Per-claim epistemic status for the factual claims in an AskAnswer. */
export interface AskClaimClassification {
  /** The claim text as stated in the answer. */
  claim: string;
  /**
   * Epistemic status. Reuses the extraction pipeline's FactClass vocabulary
   * (DIRECT_FACT, DERIVED_FACT, INFERENCE, GENERATED_COPY, USER_OVERRIDE)
   * when the ask context carries field classes; otherwise the object's own
   * claim kind (e.g. "website_statement").
   */
  classification: string;
  /** Ids into the answer's evidenceRefs supporting this claim. */
  evidenceRefIds: string[];
}

export interface AskProposalBody {
  kind: "object_update" | "object_create";
  targetObjectId: string | null;
  schema: string;
  changes: Record<string, string>;
}

/** Deterministic agent-facing grant identifiers for FYD (Ask FYD). */
export type FydGrant =
  | "site.read"
  | "site.propose"
  | "site.publish"
  | "message.send"
  | "ad.buy"
  | "purchase.make"
  | "provider.call"
  | "business.mutate"
  | "object.reference";

/**
 * A deterministic SiteSpec transition drafted by the agent. Ordered; the
 * agent never applies these directly. Each op carries its Before and After
 * so the human reviewer sees the exact change.
 */
export type SitePatchOperation =
  | {
      op: "reorder_section_objects";
      pageSlug: string;
      sectionId: string;
      before: string[];
      after: string[];
    }
  | {
      op: "set_presentation";
      pageSlug: string;
      sectionId: string;
      field: string;
      before: string | string[] | boolean | null;
      after: string | string[] | boolean | null;
    };

export interface SitePatchPayload {
  /** Stable site object id this patch applies to. */
  siteId: string;
  pageSlug: string;
  operations: SitePatchOperation[];
  /** Digest of the exact SiteSpec the patch was drafted against. */
  siteSpecDigest: string;
  affectedObjects: { id: string; title: string }[];
  /** Why the agent believes this change is warranted, tied to evidence. */
  evidenceReason: string;
}

export interface SitePatchProposalBody {
  kind: "site_patch";
  targetObjectId: string;
  schema: string;
  /** One human-readable line per operation, keyed op1, op2, ... */
  changes: Record<string, string>;
  sitePatch: SitePatchPayload;
}

/** Canonical envelope the agent uses when signing a site_patch draft. */
export interface EnvelopeProof {
  verification_method: "ed25519";
  signature: string;
  public_key: string;
}

export interface SitePatchEnvelope {
  canonical_bytes_hash: string;
  payload_hash: string;
  body: Record<string, unknown>;
  proof: EnvelopeProof;
}

export interface AskProposalBase {
  /**
   * sha256 hex of canonical JSON of the proposal body: for object
   * proposals {kind,targetObjectId,schema,changes}, for site_patch the
   * same plus sitePatch.
   */
  digest: string;
  digestAlgorithm: "sha256-canonical-json-v1";
  note: string;
  /**
   * PROD-4 (repaired): user-facing labels for machine-valued change
   * entries, keyed by change key. The digest-bound `changes` keep raw ids
   * (the governed write needs them); the proposal card renders these
   * labels instead of the raw values. Never digested, never submitted:
   * display only.
   */
  displayChangeLabels?: Record<string, string>;
  /** Present when the agent signed the draft; absent otherwise. */
  envelope?: SitePatchEnvelope | null;
}

export interface ObjectAskProposal extends AskProposalBase, AskProposalBody {}
export interface SitePatchAskProposal extends AskProposalBase, SitePatchProposalBody {}

/**
 * Discriminated union: object update/create proposals plus agent-drafted
 * site_patch proposals. The digest law is shared: canonicalize the body
 * only (never digest, algorithm, note, or envelope) and sha256 it.
 */
export type AskProposal = ObjectAskProposal | SitePatchAskProposal;

export interface AskAnswer {
  /** Sentences; every factual sentence cites evidence as [n]. */
  answer: string;
  evidenceRefs: AskEvidenceRef[];
  relatedObjects: { id: string; schema: string; title: string }[];
  suggestedActions: PlannedAction[];
  /** Draft only. Agents propose, cannot publish. Human approves exact digest. */
  proposal: AskProposal | null;
  partial: boolean;
  /** Per-claim epistemic status for the factual claims in `answer`. */
  claimClassifications: AskClaimClassification[];
  /** What the question asked about that has no supporting evidence. */
  unknowns: string[];
  /** Deduped source URLs behind the evidence (from object provenance refs). */
  sourceUrls: string[];
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
  /** Per-object field epistemic classes, when the caller has them. */
  fieldClasses: Record<string, Record<string, string>>;
  /** Deduped source URLs behind the evidence (from object provenance refs). */
  sourceUrls: string[];
}

/** Everything the Node page needs in one payload. */
export interface NodePayload {
  object: PingObject;
  relationships: PingRelationship[];
  related: PingObject[];
  controller: PingIdentitySummary | null;
  plan: CapabilityPlan;
}
