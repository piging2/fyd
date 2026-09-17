"use client";

import type { EstimatorFlag } from "@/types";
import { ScrollReveal } from "@/components/scroll-reveal";

interface FlagRevealProps {
  flags: EstimatorFlag[];
  className?: string;
}

/**
 * FlagReveal - Staggered reveal of estimator flags
 * 
 * Reveals each flag as a small line item using ScrollReveal pattern.
 * Staggered ~80ms apart if more than one fires at once.
 */
export function FlagReveal({ flags, className }: FlagRevealProps) {
  if (!flags || flags.length === 0) {
    return null;
  }

  // Filter to only show review and site_visit_required flags
  const visibleFlags = flags.filter(f => 
    f.severity === "review" || f.severity === "site_visit_required"
  );

  if (visibleFlags.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {visibleFlags.map((flag, index) => (
        <ScrollReveal 
          key={flag.id} 
          delay={index * 80}
          direction="up"
        >
          <div className="flex items-center gap-2 text-sm text-accent">
            <span className="text-accent">⚠</span>
            <span>{flag.label}</span>
          </div>
        </ScrollReveal>
      ))}
    </div>
  );
}
