import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface PingWordmarkProps {
  className?: string;
  /** @deprecated The official PING Social logo is now used instead of text. Kept for API compatibility. */
  wordmark?: string;
}

/**
 * Official PING Social logo, sourced from the Facebook page.
 * Replaces the previous text-based wordmark.
 */
export function PingWordmark({ className }: PingWordmarkProps) {
  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <Image
        src="/images/ping-social-logo.png"
        alt="PING Social"
        width={120}
        height={80}
        className="h-10 w-auto"
        priority
      />
    </span>
  );
}
