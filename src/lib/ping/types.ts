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
