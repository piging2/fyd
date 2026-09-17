import * as React from "react";
import { cn } from "@/lib/utils";
import { getTenant } from "@/lib/tenant-config";

interface PingWordmarkProps {
  className?: string;
  /** Override the wordmark text. Defaults to tenant.brand.wordmark. */
  wordmark?: string;
}

/**
 * Tenant wordmark. Reads the brand wordmark from the tenant authority;
 * Tenant B gets its own wordmark without touching this component.
 *
 * Visual: bold geometric wordmark with a gold signal pulse on the dot.
 */
export function PingWordmark({ className, wordmark }: PingWordmarkProps) {
  const text = wordmark ?? getTenant().brand.wordmark;
  return (
    <span className={cn("relative inline-flex items-center gap-1.5", className)}>
      <span className="font-display text-xl font-bold tracking-tight text-text">
        {text}
      </span>
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-honey opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-honey" />
      </span>
    </span>
  );
}
