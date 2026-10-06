"use client";
import * as React from "react";
import { openWebsite } from "@/fyd/capabilities/runtime";
import { useObjectRelationship } from "../use-object-relationship";

/** Private demo state; no gateway social identity is implied. */
export function useObjectActions(objectId: string, websiteUrl: string | null) {
  const follow = useObjectRelationship(objectId, "follow");
  const like = useObjectRelationship(objectId, "like");
  const openSite = React.useCallback(() => { if (websiteUrl) openWebsite(websiteUrl); }, [websiteUrl]);
  return { following: follow.state, liked: like.state,
    toggleFollow: follow.status === "retryable-error" ? follow.retry : follow.toggle,
    toggleLike: like.status === "retryable-error" ? like.retry : like.toggle,
    follow, like, openSite };
}
export type ObjectActions = ReturnType<typeof useObjectActions>;
