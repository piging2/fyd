/**
 * Before/After Authority - Project-Owned
 * 
 * Before/After should not be hardcoded.
 * Projects own before/after media IDs from media.v1.json.
 * The slider automatically appears if both exist.
 * Otherwise hide gracefully.
 * 
 * Architecture: Project.media.before + Project.media.after → Media Authority → Slider
 */

"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/projects";
import { CraftCard } from "@/components/ui/card";
import { VisualSlot } from "@/components/visual-slot";

export interface BeforeAfterPair {
  id: string;
  title: string;
  beforeMediaId: string;
  afterMediaId: string;
  county?: string;
  service?: string;
}

/**
 * BeforeAfterSlider — draggable before/after reveal.
 * 
 * Uses media.v1.json for image sources (project-owned).
 * Automatically hides if before or after media is missing.
 * Keyboard + reduced-motion accessible.
 * 
 * COLOR PAIRING RULE: Cards ALWAYS use light register (bg-surface).
 * Card text always uses light register tokens regardless of page background.
 */
export function BeforeAfterSlider({
  project,
  className,
}: {
  project: Project;
  className?: string;
}) {
  // P1 FIX: Use pre-validated media objects from project.media (passed public media gate)
  // This prevents bypassing the public media gate by calling getMediaById directly
  const beforeMedia = project.media.beforeMedia;
  const afterMedia = project.media.afterMedia;

  // Hide if media not found or not validated
  if (!beforeMedia || !afterMedia) {
    return null;
  }

  const [pos, setPos] = React.useState(50);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);

  const setFromClientX = React.useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, pct)));
  }, []);

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => dragging.current && setFromClientX(e.clientX);
    const onUp = () => (dragging.current = false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setFromClientX]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 5));
    if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 5));
  };

  const beforeSrc = beforeMedia.variants.original || beforeMedia.variants.webp || beforeMedia.variants.avif;
  const afterSrc = afterMedia.variants.original || afterMedia.variants.webp || afterMedia.variants.avif;

  // Card text colors - always light register (cards are always light surfaces)
  const titleColor = "text-text";
  const subtitleColor = "text-text-subtle";

  return (
    <CraftCard className={cn("group relative select-none overflow-hidden", className)}>
      <div
        ref={containerRef}
        className="relative aspect-[4/3] w-full"
        onMouseDown={(e) => {
          dragging.current = true;
          setFromClientX(e.clientX);
        }}
        onTouchStart={(e) => setFromClientX(e.touches[0].clientX)}
        onTouchMove={(e) => setFromClientX(e.touches[0].clientX)}
      >
        <div className="absolute inset-0 pointer-events-none rounded-xl bg-gradient-to-tr from-black/3 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden="true" />
        {/* AFTER (base) */}
        {afterSrc && (
          <VisualSlot
            id={`slider-right-${project.id}`}
            route="/"
            page="Homepage"
            section="Featured Transformations"
            slotName={`${project.title} Slider Right`}
            currentMediaId={project.media.after || null}
            component="BeforeAfterSlider"
          >
            <Image 
              src={afterSrc} 
              alt={afterMedia.alt || project.title} 
              fill 
              sizes="(max-width: 768px) 100vw, 50vw" 
              className="absolute inset-0 h-full w-full object-cover" 
              draggable={false} 
            />
          </VisualSlot>
        )}
        {/* BEFORE (clipped) */}
        {beforeSrc && (
          <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
            <VisualSlot
              id={`slider-left-${project.id}`}
              route="/"
              page="Homepage"
              section="Featured Transformations"
              slotName={`${project.title} Slider Left`}
              currentMediaId={project.media.before || null}
              component="BeforeAfterSlider"
            >
              <Image 
                src={beforeSrc} 
                alt={beforeMedia.alt || `${project.title} - Before`} 
                fill 
                sizes="(max-width: 768px) 100vw, 50vw" 
                className="absolute inset-0 h-full object-cover [filter:grayscale(0.6)_brightness(0.85)_sepia(0.15)]" 
                draggable={false} 
              />
            </VisualSlot>
          </div>
        )}
        {/* Handle */}
        <div
          className="absolute top-0 bottom-0 z-10 w-1 bg-honey shadow-[0_0_12px_rgba(217,154,78,0.7)]"
          style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
          role="slider"
          tabIndex={0}
          aria-label={`Before/after slider for ${project.title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          onKeyDown={onKey}
        >
          <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-honey text-honey-foreground shadow-md">
            <span className="text-xs font-bold">↔</span>
          </span>
        </div>
        {/* Labels */}
        <span className="absolute left-3 top-3 rounded-full bg-deep/80 px-3 py-1 text-xs font-semibold text-text-on-dark">Before</span>
        <span className="absolute right-3 top-3 rounded-full bg-honey px-3 py-1 text-xs font-semibold text-honey-foreground">After</span>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
        <span className={`font-semibold ${titleColor}`}>{project.title}</span>
        {project.location.county && <span className={subtitleColor}>{project.location.county}</span>}
      </figcaption>
    </CraftCard>
  );
}
