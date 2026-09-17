/**
 * Effective Project Gallery Authority
 *
 * Combines deployed project gallery with staged mutations (production)
 * to provide the single authoritative ordered gallery for projection.
 *
 * Architecture:
 * - Immutable media identity: PublishedMediaAsset
 * - Mutable editorial ordering: project.media.gallery[]
 * - Production staging: Redis KV mutations
 * - Effective authority: deployed + staged (merged)
 *
 * This resolver ensures the website projection always sees the current
 * editorial state, whether it's the deployed baseline or staged mutations.
 */

import { loadProjectsManifest } from './projects';
import { getKvNamespace, getEnvironment } from './environment';
import { Redis } from '@upstash/redis';

const WORKBENCH_STAGING_PREFIX = 'workbench-staging:';

/**
 * Get the effective project gallery (deployed + staged mutations)
 *
 * This is the single authoritative source for gallery ordering.
 * In production, it merges the deployed baseline with staged KV mutations.
 * In development, it returns the deployed baseline directly.
 *
 * @param projectId - The project ID
 * @returns The effective ordered gallery array (media IDs)
 */
export async function getEffectiveProjectGallery(projectId: string): Promise<string[]> {
  const manifest = loadProjectsManifest();
  const project = manifest.projects.find((p: any) => p.id === projectId);
  
  if (!project) {
    console.error('[EFFECTIVE_GALLERY] PROJECT_NOT_FOUND', { projectId });
    return [];
  }

  // Baseline gallery from deployed projects.v1.json
  const baselineGallery = project.media?.gallery || [];
  const baselineRevision = project.media?.galleryRevision || 0;

  console.log('[EFFECTIVE_GALLERY] BASELINE_LOADED', {
    projectId,
    baselineGalleryLength: baselineGallery.length,
    baselineGalleryIds: baselineGallery,
    baselineRevision,
  });

  // In production, check for staged mutations
  const environment = getEnvironment();
  const isProduction = environment === 'production';

  if (!isProduction) {
    console.log('[EFFECTIVE_GALLERY] DEV_MODE - Returning baseline', {
      projectId,
      environment,
      galleryLength: baselineGallery.length,
    });
    return baselineGallery;
  }

  // Production: Check for staged KV mutations
  const redis = getRedisClient();
  if (!redis) {
    console.warn('[EFFECTIVE_GALLERY] REDIS_UNAVAILABLE - Returning baseline', {
      projectId,
      reason: 'KV credentials not configured or Redis unavailable',
    });
    return baselineGallery;
  }

  try {
    // Check if there's a current staged transaction for this project
    const projectStagingKey = `${getKvNamespace()}${WORKBENCH_STAGING_PREFIX}project:${projectId}:current-transaction`;
    const currentStagedTransactionId = await redis.get(projectStagingKey);
    
    if (!currentStagedTransactionId || typeof currentStagedTransactionId !== 'string') {
      console.log('[EFFECTIVE_GALLERY] NO_STAGED_MUTATION - Returning baseline', {
        projectId,
        projectStagingKey,
      });
      return baselineGallery;
    }

    // Load the specific staged transaction
    const specificStagingKey = `${getKvNamespace()}${WORKBENCH_STAGING_PREFIX}${currentStagedTransactionId}:project:${projectId}:gallery`;
    const stagedData = await redis.get(specificStagingKey);
    
    if (!stagedData) {
      console.warn('[EFFECTIVE_GALLERY] STAGED_DATA_INVALID - Returning baseline', {
        projectId,
        specificStagingKey,
        reason: 'Staged data is null',
      });
      return baselineGallery;
    }

    // P0 FIX: Upstash automatically deserializes JSON objects
    // Accept both string (needs JSON.parse) and object (already parsed)
    let parsed: any;
    if (typeof stagedData === 'string') {
      parsed = JSON.parse(stagedData);
    } else if (typeof stagedData === 'object') {
      parsed = stagedData;
    } else {
      console.warn('[EFFECTIVE_GALLERY] STAGED_DATA_INVALID - Returning baseline', {
        projectId,
        specificStagingKey,
        reason: `Staged data has invalid type: ${typeof stagedData}`,
      });
      return baselineGallery;
    }

    const stagedGallery = parsed.gallery;
    const stagedRevision = parsed.currentRevision;

    console.log('[EFFECTIVE_GALLERY] STAGED_MUTATION_APPLIED', {
      projectId,
      baselineGalleryLength: baselineGallery.length,
      stagedGalleryLength: stagedGallery.length,
      baselineRevision,
      stagedRevision,
      transactionId: currentStagedTransactionId,
    });

    // Validate staged gallery structure
    if (!Array.isArray(stagedGallery)) {
      console.error('[EFFECTIVE_GALLERY] STAGED_GALLERY_INVALID - Returning baseline', {
        projectId,
        reason: 'Staged gallery is not an array',
      });
      return baselineGallery;
    }

    // Validate no duplicates
    const uniqueStaged = new Set(stagedGallery);
    if (uniqueStaged.size !== stagedGallery.length) {
      console.error('[EFFECTIVE_GALLERY] STAGED_GALLERY_DUPLICATES - Returning baseline', {
        projectId,
        reason: 'Staged gallery contains duplicates',
      });
      return baselineGallery;
    }

    // Validate no null/undefined
    if (stagedGallery.some(id => id === null || id === undefined)) {
      console.error('[EFFECTIVE_GALLERY] STAGED_GALLERY_NULL_VALUES - Returning baseline', {
        projectId,
        reason: 'Staged gallery contains null/undefined values',
      });
      return baselineGallery;
    }

    // Validate no empty strings
    if (stagedGallery.some(id => typeof id === 'string' && id.trim() === '')) {
      console.error('[EFFECTIVE_GALLERY] STAGED_GALLERY_EMPTY_STRINGS - Returning baseline', {
        projectId,
        reason: 'Staged gallery contains empty strings',
      });
      return baselineGallery;
    }

    // Staged gallery is valid - return it as the effective authority
    return stagedGallery;
  } catch (error) {
    console.error('[EFFECTIVE_GALLERY] STAGED_MUTATION_ERROR - Returning baseline', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    return baselineGallery;
  }
}

/**
 * Get Redis client for KV access
 * 
 * P0 FIX: Support integration-generated credential namespacing
 * Checks both primary KV_REST_API_URL/TOKEN and integration-generated variants
 */
function getRedisClient(): Redis | null {
  try {
    // Primary credentials
    let url = process.env.KV_REST_API_URL;
    let token = process.env.KV_REST_API_TOKEN;
    
    // Integration-generated credentials (for CI/production deployments)
    const integrationUrl = process.env.KV_REST_API__KV_REST_API_URL || process.env.KV_REST_API__REDIS_URL || process.env.KV_REST_API__KV_URL;
    const integrationToken = process.env.KV_REST_API__KV_REST_API_TOKEN;
    
    // Use integration credentials if primary not set
    if (!url && integrationUrl) {
      url = integrationUrl;
    }
    if (!token && integrationToken) {
      token = integrationToken;
    }
    
    if (!url || !token) return null;
    
    console.log('[EFFECTIVE_GALLERY] KV_CREDENTIALS', {
      hasUrl: !!url,
      hasToken: !!token,
      usingIntegration: !!integrationUrl || !!integrationToken,
      urlPrefix: url ? url.substring(0, 20) + '...' : 'none'
    });
    
    return new Redis({ url, token });
  } catch {
    console.error('[EFFECTIVE_GALLERY] KV_CLIENT_CREATION_FAILED');
    return null;
  }
}
