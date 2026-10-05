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
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className={cn("focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-60", className)}
        onClick={retryable ? relationship.retry : relationship.toggle}
        disabled={pending || terminal || (relationship.state === null && !retryable)}
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
