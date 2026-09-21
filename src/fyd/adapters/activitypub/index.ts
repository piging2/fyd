/**
 * ActivityPub adapter (FYD Social, grill plan item #3). First open-protocol
 * adapter: Facebook is a proving ground only, never the model.
 *
 * Surface:
 * - webfinger.resolveAcct: acct: URI -> remote actor + inbox
 * - follow.buildFollowActivity: FYD follow/unfollow intent -> Follow/Undo
 * - signing.signActivityRequest / generateThrowawayKey: Fedify HTTP Signatures
 * - endpoints.postToInbox / localOutboxEndpoint: delivery + typed stub
 */

export {
  ActivityPubAdapterError,
  type AdapterErrorKind,
  type ActivityIdFactory,
  type Clock,
  type FollowActivity,
  type FollowIntent,
  type FollowIntentTarget,
  type ResolvedRemoteActor,
} from "./types";
export { buildFollowActivity, type BuildFollowOptions } from "./follow";
export { resolveAcct } from "./webfinger";
export { generateThrowawayKey, signActivityRequest, type SigningKey } from "./signing";
export { localOutboxEndpoint, postToInbox, type InboxDelivery } from "./endpoints";
