import * as React from "react";
import { cn } from "@/lib/utils";
import { resolveObjectPresentationIdentity } from "@/fyd/presentation/identity";

interface PingWordmarkProps {
  className?: string;
  /** @deprecated The official PING Social logo is now used instead of text. Kept for API compatibility. */
  wordmark?: string;
}

/**
 * The same transparent PING Social artwork used by its business object.
 * Header and page branding keep the artwork's natural aspect ratio.
 */
export function PingWordmark({ className }: PingWordmarkProps) {
  const { mark } = resolveObjectPresentationIdentity({ id: "ping-fyd", name: "PING Social" });
  if (!mark) return null;
  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <img
        src={mark.src}
        srcSet={mark.srcSet}
        alt="PING Social"
        width={mark.width}
        height={mark.height}
        className="h-10 w-auto object-contain"
        style={{ background: "transparent", border: "none", borderRadius: 0, padding: 0 }}
        decoding="async"
        loading="eager"
      />
    </span>
  );
}
