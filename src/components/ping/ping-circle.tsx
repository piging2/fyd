"use client";

/**
 * PingCircle: the reusable public projection of a PING identity.
 *
 * States:
 * - COMPACT: avatar dot, name, handle, badges. One line of presence.
 * - EXPANDED: full card with bio, counts, and an action slot.
 * - FOCUS: keyboard focus is always visible (focus-visible ring); Enter or
 *   Space toggles expanded when interactive, Escape collapses and blurs.
 * - LOADING: skeleton, no fake content.
 * - ERROR: message plus retry. Never a silent empty card.
 *
 * Accessibility: interactive circles are keyboard-focusable (tabIndex 0),
 * expose role="button" with aria-expanded, and every control inside the
 * expanded card remains a real semantic button. Click and tap toggle the
 * same way keyboard does.
 */

import * as React from "react";
import { AlertTriangle, BadgeCheck, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PingIdentitySummary } from "@/lib/ping/types";

export type CircleVariant = "compact" | "expanded";
export type CircleStatus = "ready" | "loading" | "error";

interface PingCircleProps {
  identity: PingIdentitySummary | null;
  bio?: string;
  variant?: CircleVariant;
  status?: CircleStatus;
  errorMessage?: string;
  onRetry?: () => void;
  /** When true the circle toggles expanded/collapsed on click and keyboard. */
  interactive?: boolean;
  defaultExpanded?: boolean;
  /** Slot for follow buttons or other actions in the expanded card. */
  action?: React.ReactNode;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}

function Avatar({ name, size }: { name: string; size: "sm" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-ping-violet/15 font-bold text-ping-violet",
        size === "sm" ? "h-9 w-9 text-sm" : "h-14 w-14 text-xl",
      )}
    >
      {initials(name)}
    </span>
  );
}

function VerifiedMark() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-forest">
      <BadgeCheck className="h-4 w-4" aria-hidden="true" />
      Verified
    </span>
  );
}

function FacebookClaimBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-accent"
      title="This PING identity linked a Facebook account. Facebook does not own the identity."
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ping-violet" />
      Facebook Connected
    </span>
  );
}

function LoadingSkeleton({ variant }: { variant: CircleVariant }) {
  return (
    <div aria-label="Loading Circle" role="status" className="animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-surface-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-2/5 rounded bg-surface-muted" />
          <div className="h-2.5 w-1/4 rounded bg-surface-muted" />
        </div>
      </div>
      {variant === "expanded" && (
        <div className="mt-4 space-y-2">
          <div className="h-2.5 w-full rounded bg-surface-muted" />
          <div className="h-2.5 w-3/4 rounded bg-surface-muted" />
        </div>
      )}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function PingCircle({
  identity,
  bio,
  variant = "compact",
  status = "ready",
  errorMessage,
  onRetry,
  interactive = false,
  defaultExpanded = false,
  action,
  className,
}: PingCircleProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded || variant === "expanded");
  const expandedNow = variant === "expanded" || expanded;

  const toggle = React.useCallback(() => {
    if (interactive) setExpanded((v) => !v);
  }, [interactive]);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!interactive) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape") {
        setExpanded(false);
        (e.currentTarget as HTMLElement).blur();
      }
    },
    [interactive, toggle],
  );

  const frameClass = cn(
    "rounded-xl border border-border/40 bg-surface p-4 shadow-[--shadow-card]",
    interactive &&
      "cursor-pointer transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    className,
  );

  if (status === "loading") {
    return (
      <div className={frameClass}>
        <LoadingSkeleton variant={expandedNow ? "expanded" : "compact"} />
      </div>
    );
  }

  if (status === "error" || !identity) {
    return (
      <div className={frameClass} role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-honey" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-accent">Circle unavailable</p>
            <p className="mt-1 text-sm text-accent/70">{errorMessage || "The Circle could not be loaded."}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const inner = (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={identity.displayName} size={expandedNow ? "lg" : "sm"} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("truncate font-semibold text-accent", expandedNow ? "text-lg" : "text-sm")}>
              {identity.displayName}
            </span>
            {identity.verified && <VerifiedMark />}
          </div>
          <p className="truncate text-sm text-accent/60">@{identity.handle}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {identity.facebookConnected && <FacebookClaimBadge />}
          </div>
        </div>
        {interactive && !expandedNow && (
          <span className="sr-only">Press Enter to expand</span>
        )}
      </div>

      {expandedNow && (
        <div className="mt-4">
          {bio ? (
            <p className="text-sm leading-relaxed text-accent/80">{bio}</p>
          ) : (
            <p className="text-sm italic text-accent/50">No bio yet.</p>
          )}
          <div className="mt-3 flex items-center gap-4 text-sm text-accent/70">
            <span>
              <strong className="font-semibold text-accent">{identity.followerCount}</strong> followers
            </span>
            <span>
              <strong className="font-semibold text-accent">{identity.followingCount}</strong> following
            </span>
          </div>
          {action && <div className="mt-4">{action}</div>}
        </div>
      )}
    </>
  );

  if (!interactive) {
    return (
      <div className={frameClass} aria-label={`Circle for ${identity.displayName}`}>
        {inner}
      </div>
    );
  }

  return (
    <div
      className={frameClass}
      role="button"
      tabIndex={0}
      aria-expanded={expandedNow}
      aria-label={`${expandedNow ? "Collapse" : "Expand"} Circle for ${identity.displayName}`}
      onClick={toggle}
      onKeyDown={onKeyDown}
    >
      {inner}
    </div>
  );
}
