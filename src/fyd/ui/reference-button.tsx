"use client";

/**
 * ReferenceButton: copy a stable link to this object (its /o node).
 * The honest primitive behind the "reference" capability: no backend,
 * no fake action, just the object's address on the clipboard.
 */

import { useState } from "react";
import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ReferenceButton({
  objectId,
  className,
  compact,
}: {
  objectId: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cn(className)}
      aria-live="polite"
      onClick={async () => {
        const url =
          window.location.origin + "/o/" + encodeURIComponent(objectId);
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard unavailable: leave the label unchanged, never fake it.
        }
      }}
    >
      <Link2 className="h-5 w-5" aria-hidden="true" />
      {copied ? "Link copied" : "Reference"}
    </button>
  );
}
