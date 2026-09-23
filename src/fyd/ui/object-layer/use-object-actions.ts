"use client";

/**
 * Fail-closed follow/like state for one object id, shared by the margin
 * circle, the cluster member card, and the mobile sheet card.
 *
 * The UI only ever reflects server-confirmed state (null = unknown, the
 * actions stay disabled until the server confirms).
 *
 * CANONICAL WRITE SEAM NOTE: executeFollow / executeLike POST to
 * /api/fyd/follow and /api/fyd/like, which write to the server-side
 * stores in src/fyd/object/follows.ts and src/fyd/object/likes.ts
 * (atomic JSON files, single local demo viewer until real identity
 * exists). The PING gateway envelope path in src/fyd/social/actions.ts
 * (signed RELATIONSHIP_CREATED) is the canonical social write seam but is
 * NOT wired into these routes; wiring it in requires a real viewer
 * identity, which the homepage does not have. Do not present these
 * toggles as gateway-journaled follows.
 */

import * as React from "react";
import { executeFollow, executeLike, openWebsite } from "@/fyd/capabilities/runtime";

export interface ObjectActions {
  following: boolean | null;
  liked: boolean | null;
  toggleFollow: () => Promise<void>;
  toggleLike: () => Promise<void>;
  openSite: () => void;
}

export function useObjectActions(objectId: string, websiteUrl: string | null): ObjectActions {
  const [following, setFollowing] = React.useState<boolean | null>(null);
  const [liked, setLiked] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setFollowing(null);
    setLiked(null);
    fetch(`/api/fyd/follow?objectId=${encodeURIComponent(objectId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d && d.ok === true) setFollowing(!!d.following);
      })
      .catch(() => {});
    fetch(`/api/fyd/like?objectId=${encodeURIComponent(objectId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d && d.ok === true) setLiked(!!d.liked);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [objectId]);

  const toggleFollow = React.useCallback(async () => {
    if (following === null) return;
    setFollowing(await executeFollow(objectId, following));
  }, [objectId, following]);

  const toggleLike = React.useCallback(async () => {
    if (liked === null) return;
    setLiked(await executeLike(objectId, liked));
  }, [objectId, liked]);

  const openSite = React.useCallback(() => {
    if (websiteUrl) openWebsite(websiteUrl);
  }, [websiteUrl]);

  return { following, liked, toggleFollow, toggleLike, openSite };
}
