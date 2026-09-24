"use client";

/**
 * FollowButton: follow/unfollow this object via /api/fyd/follow.
 * The button reflects real state (GET on mount) and toggles via POST.
 * Never a dead button: it only renders for capabilities the schema
 * granted, and it talks to the real follows store.
 */

import { useCallback, useEffect, useState } from "react";
import { UserPlus, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function FollowButton({
  objectId,
  className,
}: {
  objectId: string;
  className?: string;
}) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/fyd/follow?objectId=" + encodeURIComponent(objectId))
      .then((r) => r.json())
      .then((d) => {
        if (live && typeof d.following === "boolean") setFollowing(d.following);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [objectId]);

  const toggle = useCallback(async () => {
    if (busy || following === null) return;
    setBusy(true);
    try {
      const res = await fetch("/api/fyd/follow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          objectId,
          action: following ? "unfollow" : "follow",
        }),
      });
      const d = await res.json();
      if (d.ok && typeof d.following === "boolean") setFollowing(d.following);
    } catch {
      // Network failure: leave state unchanged, never fake it.
    } finally {
      setBusy(false);
    }
  }, [busy, following, objectId]);

  return (
    <button
      type="button"
      className={cn(className)}
      onClick={toggle}
      disabled={busy || following === null}
      aria-pressed={following === true}
    >
      {following === true ? (
        <UserCheck className="h-5 w-5" aria-hidden="true" />
      ) : (
        <UserPlus className="h-5 w-5" aria-hidden="true" />
      )}
      {following === true ? "Following" : "Follow"}
    </button>
  );
}
