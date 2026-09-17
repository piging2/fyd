import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * PhotoMount — photo frame component, separate from card concept.
 * 
 * This is a visual treatment for images that makes them look like
 * mounted photographs (subtle border, craft details, etc.).
 * 
 * This is NOT a card. Cards contain content. PhotoMounts frame images.
 * 
 * Keep them separate so that:
 * - Text cards don't inherit image frame padding
 * - Review cards don't need photo styling
 * - FAQ cards don't have image-related styling
 * 
 * Only use PhotoMount when you actually have a photo to frame.
 */
export function PhotoMount({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("photo-mounted", className)} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}
    </div>
  );
}
