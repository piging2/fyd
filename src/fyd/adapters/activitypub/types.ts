/**
 * ActivityPub adapter types (FYD Social, grill plan item #3).
 *
 * The adapter is mapping code: FYD follow intents in, ActivityStreams 2.0
 * out. Protocol plumbing (WebFinger, HTTP Signatures, JSON-LD) belongs to
 * Fedify; nothing here reimplements it.
 */

/** FYD follow intent, structurally compatible with the planner's PlannedAction. */
export interface FollowIntent {
  /** Must be "follow" or "unfollow"; anything else is rejected as invalid_intent. */
  kind: string;
  target: FollowIntentTarget;
}

export type FollowIntentTarget =
  | { kind: "identity"; identityId: string }
  | { kind: "object"; objectId: string; schema: string }
  | { kind: "url"; url: string }
  | { kind: "ask"; objectId: string | null; prefill: string | null }
  | { kind: "reference"; referenceId: string }
  | null;

/** A remote actor resolved through WebFinger plus its actor document. */
export interface ResolvedRemoteActor {
  /** "user@host" form, without the acct: scheme. */
  acct: string;
  /** Canonical ActivityStreams actor URI. */
  actorUri: string;
  /** The actor's inbox endpoint; POST Follow activities here. */
  inboxUri: string;
}

/** Minimal ActivityStreams 2.0 Follow / Undo activity document. */
export interface FollowActivity {
  "@context": string | string[];
  id: string;
  type: "Follow" | "Undo";
  actor: string;
  object: string | FollowActivity;
  to?: string[];
  published?: string;
}

export type AdapterErrorKind =
  | "invalid_intent"
  | "self_follow"
  | "webfinger_not_found"
  | "actor_unresolvable"
  | "signing_failed"
  | "delivery_failed"
  | "network_error"
  | "not_implemented";

export class ActivityPubAdapterError extends Error {
  readonly kind: AdapterErrorKind;
  readonly detail?: string;
  /** HTTP status when the failure came from an HTTP response, else undefined. */
  readonly status?: number;

  constructor(kind: AdapterErrorKind, message: string, detail?: string, status?: number) {
    super(message);
    this.name = "ActivityPubAdapterError";
    this.kind = kind;
    this.detail = detail;
    this.status = status;
  }
}

/** Clock seam: inject a fixed clock in tests for deterministic output. */
export type Clock = () => Date;

/**
 * Activity id factory seam. Receives the local actor URI and a hint
 * ("follow" or "undo"); the default implementation mints a UUID-based id.
 */
export type ActivityIdFactory = (localActorUri: string, hint: "follow" | "undo") => string;
