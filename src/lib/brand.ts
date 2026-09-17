/**
 * Brand Authority Adapter
 * 
 * Provides intent-based access to brand assets.
 * Components never import brand.v1.json directly.
 * 
 * All authority loading flows through AuthorityLoader (CEO 051 constitutional requirement).
 */

import type { BrandManifest, BrandHero, BrandOwnerPortrait } from "@/types/brand";
import { loadAuthority, clearAuthorityCache } from "./authority-loader";

export function loadBrandManifest(): BrandManifest {
  return loadAuthority<BrandManifest>({
    path: "@/config/brand.v1.json",
    fallback: {
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      homepageHero: {
        id: "fallback-hero",
        mediaId: null,
        alt: "Fallback hero",
        fallback: { gradient: true, overlay: true },
      },
      ownerPortrait: {
        id: "fallback-owner",
        mediaId: null,
        alt: "Fallback owner portrait",
        names: [],
      },
      logo: {
        id: "fallback-logo",
        mediaId: null,
        alt: "Fallback logo",
      },
      team: [],
      office: {
        id: "fallback-office",
        mediaId: null,
        alt: "Fallback office",
      },
      marketingAssets: [],
    },
    name: "Brand",
  });
}

/**
 * Get homepage hero image
 * Returns brand hero or null if not set
 * First checks runtime assignment store (Workbench manual assignments)
 * Falls back to static configuration from brand.v1.json
 * Uses public media gate to ensure only PublishedMediaAsset can be returned
 */
export async function getHomepageHero(): Promise<BrandHero | null> {
  const requestId = `hero-get-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const manifest = loadBrandManifest();
  
  console.log('[PUBLIC_READER] HOMEPAGE_HERO_REQUEST', { requestId });
  
  // Check runtime assignment store first (Workbench manual assignments)
  // Assignment key: brand-hero-background (matches slot ID from VisualSlot)
  // EXPLICIT SEMANTICS:
  // - No assignment exists → static fallback
  // - Assignment exists and is valid → runtime asset
  // - Assignment exists but asset is invalid → reject runtime assignment, use static fallback
  // - Assignment store is unavailable during static build → use static fallback (expected)
  // - Assignment store is unavailable at runtime → explicit observable failure (no silent static fallback)
  try {
    const { getServiceCardAssignment } = await import('@/lib/assignment-store');
    const assignment = await getServiceCardAssignment('brand-hero-background', requestId);
    
    if (assignment?.mediaId) {
      console.log('[PUBLIC_READER] RUNTIME_ASSIGNMENT_FOUND', {
        requestId,
        serviceSlug: 'brand-hero-background',
        mediaId: assignment.mediaId,
      });
      
      // Resolve mediaId through public media gate (rejects Drive references)
      const { resolvePublicMedia } = await import('@/lib/media');
      const resolvedMedia = await resolvePublicMedia(assignment.mediaId);
      
      if (resolvedMedia) {
        console.log('[PUBLIC_MEDIA_GATE] BRAND_HERO_APPROVED_FROM_ASSIGNMENT', { 
          requestId, 
          mediaId: assignment.mediaId,
          resolvedMediaId: resolvedMedia.id 
        });
        // Return the full resolved Media object from assignment
        return {
          ...manifest.homepageHero,
          mediaId: assignment.mediaId,
          resolvedMedia,
        };
      } else {
        console.error('[PUBLIC_MEDIA_GATE] BRAND_HERO_ASSIGNMENT_REJECTED', {
          requestId,
          mediaId: assignment.mediaId,
          reason: 'Runtime assignment media failed public media gate'
        });
        // Assignment exists but is invalid - fall back to static explicitly
        console.log('[PUBLIC_READER] INVALID_RUNTIME_ASSIGNMENT - FALLING_BACK_TO_STATIC', { requestId });
      }
    } else {
      console.log('[PUBLIC_READER] NO_RUNTIME_ASSIGNMENT - USING_STATIC_CONFIG', { requestId });
    }
  } catch (error) {
    // Check if this is a static build environment
    const { isStaticBuild } = await import('@/lib/media');
    const staticBuild = isStaticBuild();
    
    // P0 FIX: Assignment store unavailable is an explicit failure state at runtime
    // Do NOT silently fall back to static - this hides broken runtime assignment system
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PUBLIC_READER] ASSIGNMENT_STORE_UNAVAILABLE', {
      requestId,
      error: errorMessage,
      staticBuild,
      note: staticBuild 
        ? 'Static build detected - using static fallback (expected behavior)'
        : 'Assignment store is unavailable. This is an explicit failure state, not a silent fallback.'
    });
    
    // During static build, static fallback is expected and acceptable
    if (staticBuild) {
      console.log('[PUBLIC_READER] STATIC_BUILD - ALLOWING_STATIC_FALLBACK', { requestId });
      // Static build can safely use static configuration
    } 
    // Check if this is a known safe fallback scenario (e.g., DEV_MODE_SKIP_KV)
    else if (errorMessage.includes('DEV_MODE_SKIP_KV') || errorMessage.includes('KvUnavailableError')) {
      console.log('[PUBLIC_READER] DEV_MODE_SKIP_KV - ALLOWING_STATIC_FALLBACK', { requestId });
      // Development-only fallback is acceptable
    } else {
      // Production/runtime failure - throw to make it observable
      throw new Error(`Assignment store unavailable: ${errorMessage}. Runtime assignment system is broken.`);
    }
  }
  
  // Fall back to static configuration from brand.v1.json
  if (manifest.homepageHero.mediaId) {
    console.log('[PUBLIC_READER] STATIC_BRAND_HERO_MEDIA_ID', {
      requestId,
      mediaId: manifest.homepageHero.mediaId
    });
    
    // Resolve mediaId through public media gate (rejects Drive references)
    const { resolvePublicMedia } = await import('@/lib/media');
    const resolvedMedia = await resolvePublicMedia(manifest.homepageHero.mediaId);
    
    if (resolvedMedia) {
      console.log('[PUBLIC_MEDIA_GATE] BRAND_HERO_APPROVED_FROM_STATIC', { 
        requestId, 
        mediaId: manifest.homepageHero.mediaId,
        resolvedMediaId: resolvedMedia.id 
      });
      // Return the full resolved Media object
      return {
        ...manifest.homepageHero,
        mediaId: manifest.homepageHero.mediaId,
        resolvedMedia,
      };
    } else {
      console.error('[PUBLIC_MEDIA_GATE] BRAND_HERO_REJECTED', {
        requestId,
        mediaId: manifest.homepageHero.mediaId
      });
    }
  }

  // P0 FIX: No static fallback - return null mediaId if no valid media
  console.log('[PUBLIC_READER] NO_VALID_MEDIA - RETURNING_NULL_MEDIAID', { requestId });
  return {
    ...manifest.homepageHero,
    mediaId: null, // No image without valid media
  };
}

/**
 * Get owner portrait
 * Returns owner portrait or null if not set
 * First checks runtime assignment store (Workbench manual assignments)
 * Falls back to static configuration from brand.v1.json
 * Uses public media gate to ensure only PublishedMediaAsset can be returned
 */
export async function getOwnerPortrait(): Promise<BrandOwnerPortrait | null> {
  const requestId = `portrait-get-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const manifest = loadBrandManifest();
  
  console.log('[BRAND] OWNER_PORTRAIT_REQUEST', { requestId });
  
  // Check runtime assignment store first (Workbench manual assignments)
  // Assignment key: brand-portrait-homepage (matches slot ID from VisualSlot)
  // Homepage uses slot ID: homepage-owner-portrait-slot
  // EXPLICIT SEMANTICS:
  // - No assignment exists → static fallback
  // - Assignment exists and is valid → runtime asset
  // - Assignment exists but asset is invalid → reject runtime assignment, use static fallback
  // - Assignment store is unavailable during static build → use static fallback (expected)
  // - Assignment store is unavailable at runtime → explicit observable failure (no silent static fallback)
  try {
    const { getServiceCardAssignment } = await import('@/lib/assignment-store');
    const assignment = await getServiceCardAssignment('brand-portrait-homepage', requestId);
    
    if (assignment?.mediaId) {
      console.log('[BRAND] RUNTIME_ASSIGNMENT_FOUND', {
        requestId,
        serviceSlug: 'brand-portrait-homepage',
        mediaId: assignment.mediaId,
      });
      
      // Resolve mediaId through public media gate (rejects Drive references)
      const { resolvePublicMedia } = await import('@/lib/media');
      const resolvedMedia = await resolvePublicMedia(assignment.mediaId);
      
      if (resolvedMedia) {
        console.log('[PUBLIC_MEDIA_GATE] BRAND_PORTRAIT_APPROVED_FROM_ASSIGNMENT', { 
          requestId, 
          mediaId: assignment.mediaId,
          resolvedMediaId: resolvedMedia.id 
        });
        // Return the full resolved Media object from assignment
        return {
          ...manifest.ownerPortrait,
          mediaId: assignment.mediaId,
          resolvedMedia,
        };
      } else {
        console.error('[PUBLIC_MEDIA_GATE] BRAND_PORTRAIT_ASSIGNMENT_REJECTED', {
          requestId,
          mediaId: assignment.mediaId,
          reason: 'Runtime assignment media failed public media gate'
        });
        // Assignment exists but is invalid - fall back to static explicitly
        console.log('[BRAND] INVALID_RUNTIME_ASSIGNMENT - FALLING_BACK_TO_STATIC', { requestId });
      }
    } else {
      console.log('[BRAND] NO_RUNTIME_ASSIGNMENT - USING_STATIC_CONFIG', { requestId });
    }
  } catch (error) {
    // Check if this is a static build environment
    const { isStaticBuild } = await import('@/lib/media');
    const staticBuild = isStaticBuild();
    
    // P0 FIX: Assignment store unavailable is an explicit failure state at runtime
    // Do NOT silently fall back to static - this hides broken runtime assignment system
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[BRAND] ASSIGNMENT_STORE_UNAVAILABLE', {
      requestId,
      error: errorMessage,
      staticBuild,
      note: staticBuild 
        ? 'Static build detected - using static fallback (expected behavior)'
        : 'Assignment store is unavailable. This is an explicit failure state, not a silent fallback.'
    });
    
    // During static build, static fallback is expected and acceptable
    if (staticBuild) {
      console.log('[BRAND] STATIC_BUILD - ALLOWING_STATIC_FALLBACK', { requestId });
      // Static build can safely use static configuration
    } 
    // Check if this is a known safe fallback scenario (e.g., DEV_MODE_SKIP_KV)
    else if (errorMessage.includes('DEV_MODE_SKIP_KV') || errorMessage.includes('KvUnavailableError')) {
      console.log('[BRAND] DEV_MODE_SKIP_KV - ALLOWING_STATIC_FALLBACK', { requestId });
      // Development-only fallback is acceptable
    } else {
      // Production/runtime failure - throw to make it observable
      throw new Error(`Assignment store unavailable: ${errorMessage}. Runtime assignment system is broken.`);
    }
  }
  
  // Fall back to static configuration from brand.v1.json
  if (manifest.ownerPortrait.mediaId) {
    console.log('[BRAND] STATIC_OWNER_PORTRAIT_MEDIA_ID', {
      requestId,
      mediaId: manifest.ownerPortrait.mediaId
    });
    
    // Resolve mediaId through public media gate (rejects Drive references)
    const { resolvePublicMedia } = await import('@/lib/media');
    const resolvedMedia = await resolvePublicMedia(manifest.ownerPortrait.mediaId);
    
    if (resolvedMedia) {
      console.log('[PUBLIC_MEDIA_GATE] BRAND_PORTRAIT_APPROVED_FROM_STATIC', { 
        requestId, 
        mediaId: manifest.ownerPortrait.mediaId,
        resolvedMediaId: resolvedMedia.id 
      });
      // Return the full resolved Media object
      return {
        ...manifest.ownerPortrait,
        mediaId: manifest.ownerPortrait.mediaId,
        resolvedMedia,
      };
    } else {
      console.error('[PUBLIC_MEDIA_GATE] BRAND_PORTRAIT_REJECTED', {
        requestId,
        mediaId: manifest.ownerPortrait.mediaId
      });
    }
  }

  // P0 FIX: No static fallback - return null mediaId if no valid media
  console.log('[BRAND] NO_VALID_MEDIA - RETURNING_NULL_MEDIAID', { requestId });
  return {
    ...manifest.ownerPortrait,
    mediaId: null, // No image without valid media
  };
}

/**
 * Get logo
 */
export function getLogo() {
  const manifest = loadBrandManifest();
  return manifest.logo;
}

/**
 * Get team photos
 */
export function getTeamPhotos() {
  const manifest = loadBrandManifest();
  return manifest.team;
}

/**
 * Get office photo
 */
export function getOffice() {
  const manifest = loadBrandManifest();
  return manifest.office;
}

/**
 * Get marketing assets
 */
export function getMarketingAssets() {
  const manifest = loadBrandManifest();
  return manifest.marketingAssets;
}
