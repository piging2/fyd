"use client";

import type { ProjectIntakeRecord } from "@/types";
import { cn } from "@/lib/utils";

interface ConfidenceBadgeProps {
  record: ProjectIntakeRecord | null;
  className?: string;
}

/**
 * ConfidenceBadge - Visual indicator of estimate quality
 * 
 * Three-state badge driven by confidence/complexity scores:
 * - "We have everything we need" - High confidence, low complexity
 * - "A few details are estimates" - Medium confidence or complexity
 * - "This one needs a quick site visit" - Low confidence or high complexity/flags
 */
export function ConfidenceBadge({ record, className }: ConfidenceBadgeProps) {
  if (!record) {
    return null;
  }

  const { confidence, complexity, flags } = record;
  
  // Determine badge state
  const needsSiteVisit = confidence < 70 || flags.some(f => f.severity === "site_visit_required");
  const needsReview = complexity >= 8 || flags.some(f => f.severity === "review");
  
  let state: "complete" | "estimates" | "site_visit";
  let label: string;
  let bgColor: string;
  let textColor: string;

  if (needsSiteVisit) {
    state = "site_visit";
    label = "This one needs a quick site visit";
    bgColor = "bg-accent/10";
    textColor = "text-accent";
  } else if (needsReview || confidence < 85) {
    state = "estimates";
    label = "A few details are estimates";
    bgColor = "bg-primary/10";
    textColor = "text-primary";
  } else {
    state = "complete";
    label = "We have everything we need";
    bgColor = "bg-green-500/10";
    textColor = "text-green-600";
  }

  return (
    <div className={cn(
      "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium",
      bgColor,
      textColor,
      className
    )}>
      <span className="relative flex h-2 w-2">
        <span className={cn(
          "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
          state === "complete" ? "bg-green-400" : state === "estimates" ? "bg-primary" : "bg-accent"
        )} />
        <span className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          state === "complete" ? "bg-green-500" : state === "estimates" ? "bg-primary" : "bg-accent"
        )} />
      </span>
      {label}
    </div>
  );
}
