import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Badge — status badges, tags, labels.
 * 
 * Uses semantic design tokens for consistent styling.
 * Can be customized via className for different contexts.
 */
export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-accent", className)}>
      {children}
    </span>
  );
}
