import * as React from "react";
import { cn } from "@/lib/utils";
import { CardLightSweep } from "@/components/card-light-sweep";

/**
 * CraftCard — premium card component using existing design language.
 * 
 * Inherits craftsmanship from homepage cards:
 * - Layered shadow stack (subtle depth)
 * - Subtle inset highlight (premium feel)
 * - Consistent border radius
 * - Smooth transition with gentle lift
 * 
 * Uses ONLY existing semantic tokens:
 * - border-border (no hardcoded colors)
 * - bg-surface (no hardcoded colors)
 * - shadow tokens from design system
 * 
 * NO gold, NO gradients, NO decoration.
 * Premium feeling comes from depth, spacing, and typography.
 * 
 * CraftCard owns ALL card styling. Only layout classes should be passed via className.
 * 
 * COLOR PAIRING RULE: Cards ALWAYS use light register (bg-surface).
 * Cards never inherit page background. A card on a dark page still uses light surface.
 */
export function CraftCard({ className, children, style }: { className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <CardLightSweep className="block">
      <div 
        className={cn(
          // Base structure - existing tokens only
          "rounded-xl border",
          "bg-surface",
          "border-border/40",
          
          // P0 FIX: position: relative for absolute children positioning
          "relative",
          
          // Premium shadow stack - layered depth (from homepage cards)
          "shadow-[--shadow-card]",
          
          // Smooth transition with gentle lift
          "transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
          
          // Hover state - slightly richer shadow, subtle lift
          "hover:shadow-[--shadow-card-hover]",
          "hover:-translate-y-0.5",
          
          // Only allow layout classes (padding, margin, flex, grid, etc.)
          className
        )}
        style={style}
      >
        {children}
      </div>
    </CardLightSweep>
  );
}

/**
 * Card — legacy component, now uses CraftCard internally.
 * @deprecated Use CraftCard directly for new implementations.
 */
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <CraftCard className={className}>{children}</CraftCard>;
}
