"use client";

/**
 * TestUserCard: a compact selectable Circle for one practice identity,
 * with follow / unfollow. Follow state comes from the server; the button
 * calls the BFF and the page refreshes from canonical data. Nothing here
 * is local-only.
 */

import { Loader2, UserMinus, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PingIdentitySummary } from "@/lib/ping/types";
import { PingCircle } from "./ping-circle";

interface TestUserCardProps {
  identity: PingIdentitySummary;
  isSelf: boolean;
  selected: boolean;
  onToggleSelect: (identityId: string) => void;
  following: boolean;
  followPending: boolean;
  onToggleFollow: (identity: PingIdentitySummary) => void;
}

export function TestUserCard({
  identity,
  isSelf,
  selected,
  onToggleSelect,
  following,
  followPending,
  onToggleFollow,
}: TestUserCardProps) {
  const checkboxId = `select-identity-${identity.id}`;

  return (
    <div
      className={cn(
        "relative rounded-xl transition-shadow",
        selected && "ring-2 ring-ping-violet ring-offset-2 ring-offset-background",
      )}
    >
      <label
        htmlFor={checkboxId}
        className="absolute left-3 top-3 z-10 flex cursor-pointer items-center gap-1.5 rounded-md bg-background/80 px-1.5 py-1 backdrop-blur"
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(identity.id)}
          aria-label={`Select ${identity.displayName} for bulk follow`}
          className="h-4 w-4 accent-[#7C5CD6]"
        />
        <span className="sr-only">Select</span>
      </label>

      <PingCircle
        identity={identity}
        variant="compact"
        interactive
        className={cn(isSelf && "opacity-70")}
        action={
          isSelf ? (
            <span className="text-xs italic text-accent/50">This is you in this session.</span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFollow(identity);
              }}
              onKeyDown={(e) => e.stopPropagation()}
              disabled={followPending}
              aria-pressed={following}
              aria-label={following ? `Unfollow ${identity.displayName}` : `Follow ${identity.displayName}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet disabled:opacity-50",
                following
                  ? "border border-border-soft bg-background text-accent hover:bg-surface-2"
                  : "bg-primary text-primary-foreground hover:bg-primary-hover",
              )}
            >
              {followPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : following ? (
                <UserMinus className="h-4 w-4" aria-hidden="true" />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              )}
              {following ? "Unfollow" : "Follow"}
            </button>
          )
        }
      />
    </div>
  );
}
