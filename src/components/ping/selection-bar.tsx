"use client";

/**
 * SelectionBar: appears when one or more cards are selected.
 * "Follow selected" follows every selected identity with its own canonical
 * relationship (one POST per identity, no batch fakery), then reports
 * per-item results. Selected posts are reported as skipped: posts cannot
 * be followed. Escape or Clear resets the selection.
 */

import { Loader2, UserPlus, X } from "lucide-react";

export interface BulkFollowResult {
  followed: string[];
  failed: { id: string; name: string; error: string }[];
  skippedPosts: number;
}

interface SelectionBarProps {
  selectedIdentities: number;
  selectedPosts: number;
  running: boolean;
  result: BulkFollowResult | null;
  onFollowSelected: () => void;
  onClear: () => void;
}

export function SelectionBar({ selectedIdentities, selectedPosts, running, result, onFollowSelected, onClear }: SelectionBarProps) {
  const total = selectedIdentities + selectedPosts;
  if (total === 0 && !result) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky bottom-4 z-20 mx-auto mt-6 flex max-w-2xl flex-wrap items-center gap-3 rounded-xl border border-ping-violet/40 bg-surface p-4 shadow-[--shadow-card-hover]"
    >
      <p className="text-sm font-medium text-accent">
        {total} selected
        <span className="font-normal text-accent/60">
          {" "}
          ({selectedIdentities} {selectedIdentities === 1 ? "identity" : "identities"}
          {selectedPosts > 0 && `, ${selectedPosts} ${selectedPosts === 1 ? "post" : "posts"}`})
        </span>
      </p>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onFollowSelected}
          disabled={running || selectedIdentities === 0}
          title={selectedIdentities === 0 ? "Select at least one identity to follow" : "Follow each selected identity"}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
          {running ? "Following" : "Follow selected"}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-accent/70 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Clear
        </button>
      </div>

      {result && (
        <div className="w-full border-t border-border-soft pt-3 text-sm">
          {result.followed.length > 0 && (
            <p className="text-forest">Followed {result.followed.length} {result.followed.length === 1 ? "identity" : "identities"}.</p>
          )}
          {result.skippedPosts > 0 && (
            <p className="text-accent/60">
              Skipped {result.skippedPosts} {result.skippedPosts === 1 ? "post" : "posts"}: posts cannot be followed.
            </p>
          )}
          {result.failed.map((f) => (
            <p key={f.id} className="text-red-700" role="alert">
              Could not follow {f.name}: {f.error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
