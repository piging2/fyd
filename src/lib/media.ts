/**
 * Media Authority Adapter
 * 
 * NEW ARCHITECTURE: Media Authority (media.v1.json + KV)
 * 
 * AUTHORITY MODEL:
 * - KV is the ONLY authority for runtime PublishedMediaAsset
 * - Static files (media.v1.json) are projections for backup/audit only
 * - No process-global caches (eliminates cross-request contamination)
 * - No synchronous authority bypass (all runtime reads go through KV)
 * 
 * Static files can only be used for explicit bootstrap/recovery operations
 * with authorization through admin API with audit trail.
 * 
 * FAIL-CLOSED SEMANTICS:
 * - KV returns null (record does not exist) → FAIL CLOSED
 * - KV throws infrastructure error → FAIL CLOSED (no silent authority bypass)
 */
import type { Media, MediaManifest } from "@/types/media";
import { isDriveReference, isMaterializingMedia, isPublishedMediaAsset, isStaleMedia } from "@/types/media";
import crypto from 'crypto';

// Re-export type guards for convenience
export { isDriveReference, isMaterializingMedia, isPublishedMediaAsset, isStaleMedia };
import { getProjectsByServiceSlug } from "@/lib/projects";
import type { Project } from "@/types/projects";
import { loadAuthority, clearAuthorityCache, findById, sortByOrder } from "./authority-loader";

/**
 * Detect if we're in static build mode
 * During static build, we can tolerate KV unavailability
 * During runtime, KV is a required dependency
 */
export function isStaticBuild(): boolean {
  // Check if we're in Next.js production build phase
  // NEXT_PHASE is set by Next.js: 'phase-production-build' during static generation
  // During runtime, NEXT_PHASE is undefined or set to other values
  const isBuilding = process.env.NEXT_PHASE === 'phase-production-build';
  return isBuilding;
}

/**
 * Compute synthetic content hash (SHA256 of canonical ID)
 * This is used to detect and reject synthetic content identity
 */
function computeSyntheticHash(canonicalId: string): string {
  return crypto.createHash('sha256').update(canonicalId).digest('hex');
}

/**
 * Check if a content hash is synthetic (derived from canonical ID rather than actual bytes)
 */
function isSyntheticContentHash(canonicalId: string, contentHash: string): boolean {
  const synthetic = computeSyntheticHash(canonicalId);
  return contentHash === synthetic;
}

// Load media manifest using shared AuthorityLoader
export function loadMediaManifest(): MediaManifest {
  return loadAuthority<MediaManifest>({
    path: "@/config/media.v1.json",
    fallback: { version: "1.0.0", generatedAt: new Date().toISOString(), media: [] },
    name: "Media"
  });
}

/**
 * Get the full media manifest (for Authority Editor)
 */
export function getMediaManifest(): MediaManifest {
  return loadMediaManifest();
}

/**
 * Load static media authority for bootstrap/recovery operations ONLY
 * 
 * AUTHORITY MODEL: Static files are projections for backup/audit only
 * This function is ONLY for explicit bootstrap/recovery operations
 * It must NOT be used as a runtime authority bypass
 * 
 * CONSTITUTIONAL CHECK: Reject synthetic content identity from static authority
 */
export function getStaticMediaForBootstrap(id: string): Media | null {
  const manifest = loadMediaManifest();
  const staticMedia = findById(manifest.media, id);
  if (!staticMedia) {
    return null;
  }
  
  // CONSTITUTIONAL CHECK: Reject synthetic content identity from static authority
  if (staticMedia.contentHash && isSyntheticContentHash(id, staticMedia.contentHash)) {
    console.error('[MEDIA] STATIC_AUTHORITY_REJECTED: Synthetic content identity', {
      mediaId: id,
      contentHash: staticMedia.contentHash,
      reason: 'Static authority cannot contain synthetic content identity (SHA256(canonicalId))'
    });
    return null;
  }
  return staticMedia;
}

/**
 * Async version that checks KV directly
 * 
 * AUTHORITY MODEL: KV is the ONLY authority for runtime PublishedMediaAsset
 * Static files are projections for backup/audit only, not competing authorities
 * No process-global caches (eliminates cross-request contamination)
 * 
 * FAIL-CLOSED SEMANTICS:
 * - KV returns null (record does not exist) → FAIL CLOSED (no static fallback)
 * - KV throws infrastructure error → FAIL CLOSED (no silent authority bypass)
 */
export async function getMediaByIdAsync(id: string): Promise<Media | null> {
  // Check KV store for runtime PublishedMediaAsset records
  // Runtime authority (materialized assets) is the ONLY authority
  try {
    const { getMedia } = await import('@/lib/media-kv-store');
    const dynamicMedia = await getMedia(id);
    if (dynamicMedia) {
      return dynamicMedia;
    }
    // KV returned null (record does not exist) - fail closed
    console.log('[MEDIA] KV_MEDIA_NOT_FOUND - FAILING_CLOSED', { mediaId: id });
    return null;
  } catch (error) {
    // KV infrastructure error - distinguish between static build and runtime
    if (isStaticBuild()) {
      // During static build, return null to allow build to succeed
      console.log('[MEDIA] KV_UNAVAILABLE_DURING_STATIC_BUILD - returning null', {
        mediaId: id,
      });
      return null;
    }
    
    // DEV_MODE_SKIP_KV: Fall back to static media authority for development testing
    if (error instanceof Error && (error.message.includes('DEV_MODE_SKIP_KV') || error.name === 'KvUnavailableError')) {
      console.log('[MEDIA] DEV_MODE_SKIP_KV - falling back to static media authority', {
        mediaId: id,
      });
      
      // Use static media authority as fallback
      const staticMedia = getStaticMediaForBootstrap(id);
      
      if (staticMedia) {
        console.log('[MEDIA] DEV_MODE_SKIP_KV - using static media', { mediaId: id });
        return staticMedia;
      }
      
      console.log('[MEDIA] DEV_MODE_SKIP_KV - static media not found', { mediaId: id });
      return null;
    }
    
    // During runtime, this is a real dependency failure - fail closed with null
    console.error('[MEDIA] KV_RUNTIME_DEPENDENCY_FAILURE - FAILING_CLOSED:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      mediaId: id,
    });
    return null;
  }
}

/**
 * Public Media Materialization Gate
 * 
 * STRICT CONTRACT: Only returns published/public MediaAssets for production presentation.
 * Rejects source references, materializing state, stale assets, and Drive proxy URLs.
 * 
 * This enforces the Drive → public delivery boundary:
 * - Workbench can see DriveReferences
 * - Website can ONLY see published MediaAssets with public URLs
 * 
 * BUILD SAFETY: During static build, uses static authority (media.v1.json) directly.
 * During runtime, uses KV authority (Redis) for dynamic assignments.
 * 
 * @param id - Media ID to resolve
 * @returns Published MediaAsset OR null (explicit unavailable state)
 * 
 * Rejected states:
 * - drive-prefixed IDs (source references)
 * - lifecycleState === 'source_reference'
 * - lifecycleState === 'materializing'
 * - lifecycleState === 'stale'
 * - Media with /api/drive/* URLs
 * - Media with thumbnailProxyUrl
 * - Media without contentHash
 * - Media without valid dimensions
 * - Media without valid rendition
 * - Media with drive field
 * - Media with source !== 'local'
 */
export async function resolvePublicMedia(id: string): Promise<Media | null> {
  console.log('[PUBLIC_MEDIA_GATE] Resolving public media:', { id, isStaticBuild: isStaticBuild() });

  // REJECT: drive-prefixed IDs (source references)
  // drive- and drive-ref- prefixes are reserved for DriveReference only
  if (id.startsWith('drive-') || id.startsWith('drive-ref-')) {
    console.error('[PUBLIC_MEDIA_GATE] REJECTED: drive-prefixed ID', { id });
    return null;
  }

  // BUILD SAFETY: During static build, use static authority directly
  // This prevents KV lookup failures during static generation
  if (isStaticBuild()) {
    console.log('[PUBLIC_MEDIA_GATE] Using static authority during static build', { id });
    const staticMedia = getStaticMediaForBootstrap(id);
    if (!staticMedia) {
      console.log('[PUBLIC_MEDIA_GATE] Static media not found', { id });
      return null;
    }

    // Apply public media gate validation to static media
    if (!isPublishedMediaAsset(staticMedia)) {
      console.error('[PUBLIC_MEDIA_GATE] REJECTED: static media not a valid PublishedMediaAsset', { 
        id, 
        lifecycleState: staticMedia.lifecycleState,
        source: staticMedia.source,
      });
      return null;
    }

    console.log('[PUBLIC_MEDIA_GATE] APPROVED: static published media', { id });
    return staticMedia;
  }

  // DEV_MODE_SKIP_KV: Use static authority during development without KV
  if (process.env.DEV_MODE_SKIP_KV === 'true') {
    console.log('[PUBLIC_MEDIA_GATE] DEV_MODE_SKIP_KV - using static authority', { id });
    const staticMedia = getStaticMediaForBootstrap(id);
    if (!staticMedia) {
      console.log('[PUBLIC_MEDIA_GATE] DEV_MODE_SKIP_KV - static media not found', { id });
      return null;
    }

    // Apply public media gate validation to static media
    if (!isPublishedMediaAsset(staticMedia)) {
      console.error('[PUBLIC_MEDIA_GATE] REJECTED: static media not a valid PublishedMediaAsset', { 
        id, 
        lifecycleState: staticMedia.lifecycleState,
        source: staticMedia.source,
      });
      return null;
    }

    console.log('[PUBLIC_MEDIA_GATE] DEV_MODE_SKIP_KV - APPROVED: static published media', { id });
    return staticMedia;
  }

  // RUNTIME: Resolve media via KV authority
  const media = await getMediaByIdAsync(id);
  if (!media) {
    console.log('[PUBLIC_MEDIA_GATE] KV media not found', { id });
    return null;
  }

  // REJECT: source_reference lifecycle state using type guard
  if (isDriveReference(media)) {
    console.error('[PUBLIC_MEDIA_GATE] REJECTED: source_reference lifecycle state', { id, lifecycleState: media.lifecycleState });
    return null;
  }

  // REJECT: materializing lifecycle state using type guard
  if (isMaterializingMedia(media)) {
    console.error('[PUBLIC_MEDIA_GATE] REJECTED: materializing lifecycle state', { id, lifecycleState: media.lifecycleState });
    return null;
  }

  // REJECT: stale lifecycle state using type guard
  if (isStaleMedia(media)) {
    console.error('[PUBLIC_MEDIA_GATE] REJECTED: stale lifecycle state', { id, lifecycleState: media.lifecycleState });
    return null;
  }

  // REJECT: Missing or invalid storage field
  // PublishedMediaAsset must have storage: 'static' or 'blob'
  if (media.storage !== 'static' && media.storage !== 'blob') {
    console.error('[PUBLIC_MEDIA_GATE] REJECTED: Missing or invalid storage field', {
      mediaId: id,
      storage: media.storage,
      reason: 'PublishedMediaAsset must have storage field (static or blob)'
    });
    return null;
  }

  // VALIDATE: Must satisfy PublishedMediaAsset contract using type guard
  if (!isPublishedMediaAsset(media)) {
    console.error('[PUBLIC_MEDIA_GATE] REJECTED: not a valid PublishedMediaAsset', { 
      id, 
      lifecycleState: media.lifecycleState,
      source: media.source,
      hasContentHash: typeof media.contentHash === 'string' && media.contentHash.length > 0,
      hasValidDimensions: media.dimensions.width > 0 && media.dimensions.height > 0,
      hasDrive: !!media.drive
    });
    return null;
  }

  // REJECT: Synthetic content identity (contentHash === SHA256(canonicalId)) for Drive assets
  // This must be checked for Drive assets to prevent synthetic back doors
  // Local assets can use synthetic hashes as they're static files with canonical IDs
  if (media.source === 'google-drive' && media.contentHash && isSyntheticContentHash(id, media.contentHash)) {
    console.error('[PUBLIC_MEDIA_GATE] REJECTED: Synthetic content identity', {
      mediaId: id,
      contentHash: media.contentHash,
      reason: 'Content hash is SHA256(canonicalId), not actual bytes'
    });
    return null;
  }

  // REJECT: Missing physical Blob metadata for Blob-storage assets
  // PublishedMediaAsset with storage: 'blob' must have proof of physical bytes
  // Static storage assets (storage: 'static') are served from static files and don't require Blob metadata
  if (media.storage === 'blob' && media.contentHash) {
    try {
      const { getBlobMetadataByContentHash } = await import('@/lib/blob-storage');
      const blobMetadata = await getBlobMetadataByContentHash(media.contentHash);
      if (!blobMetadata) {
        console.error('[PUBLIC_MEDIA_GATE] REJECTED: Missing Blob metadata', {
          mediaId: id,
          contentHash: media.contentHash,
          storage: media.storage,
          reason: 'Blob-storage assets must have Blob metadata with physical Blob proof'
        });
        return null;
      }
    } catch (error) {
      console.error('[PUBLIC_MEDIA_GATE] BLOB_VERIFICATION_ERROR', {
        mediaId: id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Fail closed if Blob verification infrastructure fails
      return null;
    }
  }

  // REJECT: Missing public variant URLs
  // PublishedMediaAsset must have public URLs for presentation
  if (!media.variants || Object.keys(media.variants).length === 0) {
    console.error('[PUBLIC_MEDIA_GATE] REJECTED: No public variant URLs', {
      mediaId: id,
      variants: media.variants
    });
    return null;
  }

  // ADDITIONAL VALIDATION: Check for Drive URLs in variants
  const checkForDriveUrl = (obj: any): boolean => {
    if (!obj) return false;
    if (typeof obj === 'string' && obj.startsWith('/api/drive/')) {
      return true;
    }
    if (typeof obj === 'object') {
      return Object.values(obj).some((val) => checkForDriveUrl(val));
    }
    return false;
  };

  if (checkForDriveUrl(media.variants)) {
    console.error('[PUBLIC_MEDIA_GATE] REJECTED: contains /api/drive/* URL in variants', { id });
    return null;
  }

  // REJECT: Media with thumbnailProxyUrl (Drive reference)
  if ((media as any).thumbnailProxyUrl) {
    console.error('[PUBLIC_MEDIA_GATE] REJECTED: contains thumbnailProxyUrl', { id, thumbnailProxyUrl: (media as any).thumbnailProxyUrl });
    return null;
  }

  console.log('[PUBLIC_MEDIA_GATE] APPROVED: published public media', { id });
  return media;
}

/**
 * Clear media cache (useful for testing or hot reload)
 */
export function clearMediaCache(): void {
  clearAuthorityCache("@/config/media.v1.json");
}

/**
 * INTENT-BASED MEDIA ADAPTER (LEGACY - TEST/DIAGNOSTIC USE ONLY)
 * 
 * ⚠️ SECURITY WARNING: These functions read directly from static media manifest
 * They are for TEST/DIAGNOSTIC purposes only.
 * 
 * DO NOT use these in public rendering paths.
 * Public rendering MUST use resolvePublicMedia() → KV authority.
 * 
 * These functions are kept for:
 * - Test scripts comparing static vs KV authority
 * - Diagnostic tools validating data integrity
 * - Bootstrap/recovery operations
 * 
 * Public rendering paths currently correctly use:
 * - resolvePublicMedia() → KV authority
 * - getProjectWithResolvedMedia() → KV authority
 * - getServiceCardAssignment() → KV authority
 */

/**
 * Get all media for a project, sorted by order
 */
export function getProjectMedia(projectId: string) {
  const manifest = loadMediaManifest();
  const projectMedia = manifest.media.filter((m: Media) => m.projectId === projectId);
  return sortByOrder(projectMedia);
}

/**
 * Get hero image for a project
 */
export function getProjectHero(projectId: string): Media | null {
  const projectMedia = getProjectMedia(projectId);
  return projectMedia.find((m: Media) => m.roles.includes('hero')) || null;
}

/**
 * Get thumbnail for a project (first gallery image or hero)
 */
export function getProjectThumbnail(projectId: string): Media | null {
  const projectMedia = getProjectMedia(projectId);
  return projectMedia.find((m: Media) => m.roles.includes('gallery')) || getProjectHero(projectId);
}

/**
 * Get before/after pair for a project
 */
export function getProjectBeforeAfter(projectId: string): { before: Media | null; after: Media | null } {
  const projectMedia = getProjectMedia(projectId);
  return {
    before: projectMedia.find((m: Media) => m.roles.includes('before')) || null,
    after: projectMedia.find((m: Media) => m.roles.includes('after')) || null,
  };
}

/**
 * Get media by role for a project
 */
export function getProjectMediaByRole(projectId: string, role: string): Media | null {
  const projectMedia = getProjectMedia(projectId);
  return projectMedia.find((m: Media) => m.roles.includes(role as any)) || null;
}

/**
 * Get featured media for a service
 * Returns the hero image of the highest-ranked project for that service
 * 
 * Priority:
 * 1. Featured completed project (most recent)
 * 2. Newest completed project
 * 3. Null (intentional empty state)
 */
export async function getFeaturedServiceMedia(serviceSlug: string): Promise<Media | null> {
  const manifest = loadMediaManifest();
  
  // Get projects for this service from Projects Authority
  const projects = getProjectsByServiceSlug(serviceSlug);
  
  // Filter for completed projects
  const completedProjects = projects.filter((p: Project) => p.status === 'completed');
  
  if (completedProjects.length === 0) return null;
  
  // First try: featured projects
  const featuredProjects = completedProjects.filter((p: Project) => p.featured);
  
  // Sort by completion date (most recent first)
  const sortProjects = (a: Project, b: Project) => {
    const dateA = new Date(a.completionDate || 0).getTime();
    const dateB = new Date(b.completionDate || 0).getTime();
    return dateB - dateA;
  };
  
  featuredProjects.sort(sortProjects);
  completedProjects.sort(sortProjects);
  
  // Get the top project (featured first, otherwise newest)
  const topProject = featuredProjects[0] || completedProjects[0];
  if (!topProject) return null;
  
  // Get hero media for the top project
  const heroMediaId = topProject.media.hero;
  if (!heroMediaId) return null;
  
  // Use async KV authority
  return await getMediaByIdAsync(heroMediaId);
}
