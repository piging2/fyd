"use client";

import { useId } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useObjectRelationship } from "./use-object-relationship";

export function LikeButton({ objectId, className }: { objectId: string; className?: string }) {
  const relationship = useObjectRelationship(objectId, "like");
  const messageId = useId();
  const pending = relationship.status === "pending" || relationship.status === "loading";
  const retryable = relationship.status === "retryable-error";
  const terminal = relationship.status === "terminal-error";
  // Focus lifecycle (UI finding 2, 2026-11-12): this control is never
  // natively disabled. A focused button that becomes disabled drops its
  // focus to the document in Chrome-class browsers, so a keyboard user
  // who saved, failed, and landed on the retry state would lose their
  // place entirely. Inert states are expressed with aria-disabled and a
  // withheld handler instead: the element stays focusable through the
  // whole pending, error, retry, success lifecycle, and the status line
  // below announces every transition.
  const inert = pending || terminal || (relationship.state === null && !retryable);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className={cn("focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4", inert && "opacity-60", className)}
        onClick={inert ? undefined : retryable ? relationship.retry : relationship.toggle}
        aria-disabled={inert || undefined}
        aria-pressed={relationship.state === true}
        aria-busy={pending}
        aria-describedby={messageId}
        data-relationship-status={relationship.status}
        data-relationship-scope={relationship.scope ?? "unknown"}
      >
        <Heart className="h-5 w-5" aria-hidden="true" fill={relationship.state ? "currentColor" : "none"} />
        {pending ? (relationship.status === "loading" ? "Loading…" : "Saving…") : retryable ? "Retry like" : terminal ? "Like unavailable" : relationship.state ? "Liked" : "Like"}
      </button>
      <span id={messageId} role="status" className="max-w-64 text-xs opacity-70">{relationship.message}</span>
    </span>
  );
}
