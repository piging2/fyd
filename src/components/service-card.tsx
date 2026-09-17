'use client';

import Link from "next/link";
import Image from "next/image";
import type { Service } from "@/types/registries";
import type { Media } from "@/types/media";
import { Icon } from "@/components/icon";
import { CraftCard } from "@/components/ui/card";
import { PhotoMount } from "@/components/photo-mount";
import { VisualSlot } from "@/components/visual-slot";
import { useState } from "react";

/**
 * ServiceCard — photo-led and dense (CEO review): one iconic image, title,
 * a one-line micro-proof stat, and a clear next step. No large empty areas.
 * 
 * Updated to use new Service type from registries (data-driven configuration).
 * 
 * Service cards use intent-based media lookups from Media Authority.
 * Receives runtimeCardMediaObject as prop from server component (already resolved).
 * Falls back to hero image of the highest-ranked project for that service.
 * Falls back to intentional empty state when no images exist for that service.
 * 
 * COLOR PAIRING RULE: Cards ALWAYS use light register (bg-surface).
 * Card text always uses light register tokens regardless of page background.
 * 
 * NAVIGATION CONTRACT: ServiceCard owns its own navigation to prevent nested Link bugs.
 * When rendered standalone, it links to estimate page with service parameter.
 * When rendered within another Link wrapper, navigation should be handled by the parent.
 */
export function ServiceCard({ service, runtimeCardMediaObject, href }: { service: Service; runtimeCardMediaObject?: Media | null; href?: string }) {
  // Use runtime assignment if available, otherwise fall back to featured project media
  const cardMedia = runtimeCardMediaObject || null;

  // Use provided cardMedia (already resolved through public media gate by server component)
  const featuredMedia = cardMedia;
  const hasImage = featuredMedia !== null;
  
  // Use responsive variants if available to select best quality
  const responsiveVariants = featuredMedia?.variants?.responsive;
  const hasResponsiveVariants = responsiveVariants && responsiveVariants.length > 0;
  
  // Select best variant: use highest resolution from responsive variants, otherwise fallback
  const imageSrc = hasImage 
    ? (hasResponsiveVariants 
        ? responsiveVariants[responsiveVariants.length - 1].webp 
        : (featuredMedia.variants?.web || featuredMedia.variants?.original))
    : null;

  // Card text colors - always light register (cards are always light surfaces)
  const headingColor = "text-text";
  const bodyColor = "text-text-muted";
  const linkColor = "text-text hover:text-honey";

  // Use provided href if available, otherwise default to estimate page
  const cardHref = href || `/estimate?service=${service.slug}`;

  return (
    <Link href={cardHref} className="block">
      <CraftCard className="group flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-xl" style={{ containerType: 'inline-size' }}>
        <PhotoMount className="relative aspect-[4/3] overflow-hidden bg-surface-muted">
          {hasImage && imageSrc ? (
            <>
              {/* P0 FIX: Services page slots are display-only, not interactive drop targets
                  Only homepage service card slots (homepage-service-card-slot-{slug}) are writable.
                  Remove VisualSlot to prevent zero-height element from intercepting drag events. */}
              <Image
                src={imageSrc}
                alt={featuredMedia.alt || service.name}
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover transition-transform duration-200 ease-out group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 pointer-events-none rounded-t-xl bg-gradient-to-tr from-black/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden="true" />
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-deep/80 text-honey">
                <Icon name={service.icon} className="h-5 w-5" />
              </span>
            </div>
          )}
          {hasImage && (
            <span className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl bg-deep/80 text-honey">
              <Icon name={service.icon} className="h-5 w-5" />
            </span>
          )}
          {!hasImage && (
            <div className="absolute bottom-3 right-3 rounded-md bg-deep/80 px-3 py-1.5 text-xs font-medium text-text-on-dark">
              Project photos coming soon
            </div>
          )}
        </PhotoMount>
        <div className="flex flex-1 flex-col p-4 @[300px]:p-5 @[400px]:p-6">
          <h3 className={`font-display text-lg font-bold @[300px]:text-xl @[400px]:text-2xl ${headingColor}`} style={{ lineHeight: 'var(--leading-display)', letterSpacing: 'var(--tracking-display)' }}>{service.name}</h3>
          <p className={`clamp-2 mt-2 flex-1 text-sm @[300px]:text-base ${bodyColor}`} style={{ lineHeight: 'var(--leading-body)', letterSpacing: 'var(--tracking-body)' }}>{service.description}</p>
          <div className={`mt-4 inline-flex items-center gap-1 min-h-[44px] text-sm @[300px]:text-base ${linkColor}`}>
            Start a quote →
          </div>
        </div>
      </CraftCard>
    </Link>
  );
}
