"use client";

/**
 * LikeButton: like/unlike this object via /api/fyd/like.
 * Real state from GET on mount, toggled via POST. Only rendered where
 * the schema grants the like capability (posts).
 */

import { useCallback, useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export function LikeButton({
  objectId,
  className,
}: {
  objectId: string;
  className?: string;
}) {
  const [liked, setLiked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/fyd/like?objectId=" + encodeURIComponent(objectId))
      .then((r) => r.json())
      .then((d) => {
        if (live && typeof d.liked === "boolean") setLiked(d.liked);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [objectId]);

  const toggle = useCallback(async () => {
    if (busy || liked === null) return;
    setBusy(true);
    try {
      const res = await fetch("/api/fyd/like", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId, action: liked ? "unlike" : "like" }),
      });
      const d = await res.json();
      if (d.ok && typeof d.liked === "boolean") setLiked(d.liked);
    } catch {
      // Network failure: leave state unchanged, never fake it.
    } finally {
      setBusy(false);
    }
  }, [busy, liked, objectId]);

  return (
    <button
      type="button"
      className={cn(className)}
      onClick={toggle}
      disabled={busy || liked === null}
      aria-pressed={liked === true}
    >
      <Heart
        className="h-5 w-5"
        aria-hidden="true"
        fill={liked === true ? "currentColor" : "none"}
      />
      {liked === true ? "Liked" : "Like"}
    </button>
  );
}
