"use client";

/**
 * PostCard: one PING post object with a live like button. Like counts are
 * projections from canonical relationship events; toggling calls the BFF
 * and the page refreshes from the server.
 */

import { Heart, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PingPost } from "@/lib/ping/types";

interface PostCardProps {
  post: PingPost;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (objectId: string) => void;
  likePending?: boolean;
  onToggleLike?: (post: PingPost) => void;
  sessionActive: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function PostCard({ post, selectable, selected, onToggleSelect, likePending, onToggleLike, sessionActive }: PostCardProps) {
  const checkboxId = `select-post-${post.id}`;

  return (
    <article
      aria-label={`Post by ${post.authorDisplayName}`}
      className={cn(
        "relative rounded-xl border border-border/40 bg-surface p-4 shadow-[--shadow-card]",
        selected && "ring-2 ring-ping-violet ring-offset-2 ring-offset-background",
      )}
    >
      {selectable && (
        <label
          htmlFor={checkboxId}
          className="absolute right-3 top-3 flex cursor-pointer items-center rounded-md bg-background/80 px-1.5 py-1 backdrop-blur"
        >
          <input
            id={checkboxId}
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelect?.(post.id)}
            aria-label={`Select post by ${post.authorDisplayName} for bulk actions`}
            className="h-4 w-4 accent-[#7C5CD6]"
          />
          <span className="sr-only">Select</span>
        </label>
      )}

      <header className="flex items-center gap-2.5 pr-10">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ping-violet/15 text-xs font-bold text-ping-violet"
        >
          {post.authorDisplayName.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-accent">{post.authorDisplayName}</p>
          <p className="truncate text-xs text-accent/60">
            @{post.authorHandle} - {formatTime(post.createdAt)}
          </p>
        </div>
      </header>

      {post.replyTo && (
        <p className="mt-2 text-xs text-accent/50">
          Replying to object <code className="rounded bg-surface-2 px-1">{post.replyTo.slice(0, 12)}</code>
        </p>
      )}

      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-accent/90">{post.text}</p>

      <footer className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleLike?.(post)}
          disabled={!sessionActive || likePending || !onToggleLike}
          aria-pressed={post.likedByViewer}
          aria-label={post.likedByViewer ? `Unlike this post (${post.likeCount})` : `Like this post (${post.likeCount})`}
          title={sessionActive ? undefined : "Select a practice identity to like"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet disabled:opacity-50",
            post.likedByViewer
              ? "border-ping-violet/50 bg-ping-violet/10 text-ping-violet"
              : "border-border-soft text-accent/70 hover:border-ping-violet/50 hover:text-ping-violet",
          )}
        >
          {likePending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Heart className={cn("h-4 w-4", post.likedByViewer && "fill-current")} aria-hidden="true" />
          )}
          <span aria-live="polite">{post.likeCount}</span>
        </button>
      </footer>
    </article>
  );
}
