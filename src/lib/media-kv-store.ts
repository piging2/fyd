/**
 * KV Media Store
 * 
 * Manages PublishedMediaAsset records in Upstash Redis KV.
 * Rejects synthetic content identity (SHA256(canonicalId) rather than actual bytes).
 * Requires physical Blob verification for constitutional proof.
 */

import { Redis } from '@upstash/redis';
import crypto from 'crypto';
import type { Media } from '@/types/media';
import { verifyBlobHash, type BlobHashVerificationResult } from '@/lib/blob-storage';
import { getEnvironment, getKvNamespace } from '@/lib/environment';

/**
 * Apply namespace prefix to KV key
 * Prevents cross-environment key collisions
 */
function namespacedKey(key: string): string {
  const namespace = getKvNamespace();
  return `${namespace}${key}`;
}

/**
 * Detect if we're in static build mode
 * During static build, we can tolerate KV unavailability
 * During runtime, KV is a required dependency
 */
function isStaticBuild(): boolean {
  // Check if we're in Next.js build phase.
  // Next.js sets NEXT_PHASE='phase-production-build' during `next build`.
  // It never sets the value 'build', so the previous check was always false and
  // the KvUnavailableError degradation path below was unreachable.
  return process.env.NEXT_PHASE === 'phase-production-build';
}

class KvUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KvUnavailableError';
  }
}

/**
 * KV Client Factory
 * 
 * Creates environment-bound Redis clients to prevent mutable process-global state.
 * Each client is bound to the current environment namespace at creation time.
 * This prevents identity leaks when environments change or credentials rotate.
 */
/**
 * Memoized client handle.
 *
 * This is a connection handle, NOT an authority cache: no media records, no
 * authorization decisions, and no derived state are retained. The handle is
 * keyed on (url, token, environment) so that a credential rotation or an
 * environment change produces a new client instead of reusing a stale one,
 * preserving the original environment-binding guarantee.
 *
 * Rationale: the Upstash REST client is stateless HTTP. Constructing one per
 * record turned a list operation into N client constructions and N log lines.
 */
let cachedClient: { key: string; client: Redis } | null = null;

function createRedisClient(): Redis {
  let url = process.env.KV_REST_API_URL;
  let token = process.env.KV_REST_API_TOKEN;
  
  // Check integration-generated variables
  const integrationUrl = process.env.KV_REST_API__KV_REST_API_URL || process.env.KV_REST_API__REDIS_URL || process.env.KV_REST_API__KV_URL;
  const integrationToken = process.env.KV_REST_API__KV_REST_API_TOKEN;
  const readOnlyToken = process.env.KV_REST_API__KV_REST_API_READ_ONLY_TOKEN;
  
  // Use integration credentials if primary not set
  if (!url && integrationUrl) {
    url = integrationUrl;
  }
  if (!token && integrationToken) {
    token = integrationToken;
  }
  
  // DEV_MODE_SKIP_KV: Allow development without KV credentials
  // This enables testing the assignment loop in local development
  if (process.env.DEV_MODE_SKIP_KV === 'true') {
    console.log('[MEDIA_KV] DEV_MODE_SKIP_KV enabled - KV operations will be skipped');
    throw new KvUnavailableError('DEV_MODE_SKIP_KV: KV operations skipped for development testing');
  }

  // During static build, KV may not be available - throw explicit error
  // Runtime pages will handle this as a dependency failure
  if (!url || !token) {
    if (isStaticBuild()) {
      throw new KvUnavailableError('KV credentials not available during static build');
    }
    throw new Error('Missing required environment variables: KV_REST_API_URL and KV_REST_API_TOKEN');
  }
  
  // Client bound to current environment + credentials
  const env = getEnvironment();
  const namespace = getKvNamespace();
  const bindingKey = `${env}|${namespace}|${url}|${token}`;

  if (cachedClient && cachedClient.key === bindingKey) {
    return cachedClient.client;
  }

  const client = new Redis({ url, token });
  cachedClient = { key: bindingKey, client };

  console.log('[MEDIA_KV] Created environment-bound client', {
    environment: env,
    namespace,
  });

  return client;
}

// KV key prefixes (P1-9: Environment isolation applied)
const MEDIA_PREFIX = 'media:';
const CONTENT_HASH_PREFIX = 'content_hash:';
const BLOB_METADATA_PREFIX = 'blob_metadata:';
const STALE_INDEX_PREFIX = 'stale_index:';
const MEDIA_QUARANTINE_PREFIX = 'media_quarantine:';

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
function isSyntheticContentHash(canonicalId: string, actualContentHash: string): boolean {
  const syntheticHash = computeSyntheticHash(canonicalId);
  return actualContentHash === syntheticHash;
}

/**
 * Verify media state for internal materialization operations
 * This is permissive for intermediate states during materialization
 * Used by ingestion/materialization paths, NOT the public gate
 */
async function verifyMaterializationState(media: Media): Promise<boolean> {
  // DriveReference records are valid source references
  if (media.lifecycleState === 'source_reference') {
    return true;
  }
  
  // MaterializingMedia is valid during materialization phase
  if (media.lifecycleState === 'materializing') {
    return true;
  }
  
  // PublishedMediaAsset must have content hash
  if (media.lifecycleState === 'published' && media.source === 'local') {
    if (!media.contentHash) {
      console.error('[MEDIA_KV] REJECTED: Published local media missing content hash', {
        mediaId: media.id,
        reason: 'PublishedMediaAsset must have content hash'
      });
      return false;
    }
    
    // CRITICAL: Use storage field to distinguish static vs Blob
    // Static storage: served from /public/images/, no Blob metadata required
    // Blob storage: materialized from Drive, requires Blob metadata
    if (media.storage === 'blob') {
      const client = createRedisClient();
      const blobMetadata = await client.get(namespacedKey(`${BLOB_METADATA_PREFIX}${media.contentHash}`));
      
      if (!blobMetadata) {
        console.error('[MEDIA_KV] REJECTED: Blob storage media missing Blob metadata', {
          mediaId: media.id,
          contentHash: media.contentHash,
          storage: media.storage,
          reason: 'Blob-storage assets must have Blob metadata with physical Blob proof'
        });
        return false;
      }
    } else if (media.storage === 'static') {
      // Static storage: no Blob metadata required
      // Just verify the storage field is properly set
      console.log('[MEDIA_KV] STATIC_STORAGE_ACCEPTED', {
        mediaId: media.id,
        storage: media.storage,
        reason: 'Static storage assets do not require Blob metadata'
      });
    } else {
      // Missing or invalid storage field
      console.error('[MEDIA_KV] REJECTED: Missing or invalid storage field', {
        mediaId: media.id,
        storage: media.storage,
        reason: 'Published local media must have storage field (static or blob)'
      });
      return false;
    }
    
    return true;
  }
  
  // Stale records are invalid
  if (media.lifecycleState === 'stale') {
    console.error('[MEDIA_KV] REJECTED: Stale lifecycle state', {
      mediaId: media.id,
      lifecycleState: media.lifecycleState,
      reason: 'Stale records are invalid'
    });
    return false;
  }
  
  // Unknown state/source combinations are invalid
  console.error('[MEDIA_KV] REJECTED: Unknown lifecycle/source combination', {
    mediaId: media.id,
    lifecycleState: media.lifecycleState,
    source: media.source,
    reason: 'Unrecognized state/source combination'
  });
  return false;
}

/**
 * Verify public media authority for the public gate
 * This is STRICT - only fully verified PublishedMediaAsset is publicly assignable
 * source_reference and materializing are NOT publicly assignable
 * Exported for use by reconciliation API and other authority checks
 */
export interface PublicMediaAuthorityOptions {
  /**
   * Re-download the physical Blob bytes and re-derive SHA256 to confirm the
   * stored contentHash.
   *
   * This is WRITE-PATH proof, not read-path proof. Content identity is
   * established from real bytes at materialization time
   * (api/drive/ingest/route.ts computes sha256 over the downloaded Drive bytes
   * before the Blob upload and before storeMedia). Re-deriving it on every read
   * turned a list operation into a full content re-audit: one authenticated
   * Blob HEAD plus a complete image download plus a SHA256 per record, per
   * request.
   *
   * Default false. The structural gate below is ALWAYS enforced and is
   * unchanged: published+local only, contentHash required, synthetic
   * contentHash rejected, storage field must be 'static' or 'blob', blob-backed
   * records must have a blob_metadata record. Nothing that previously failed
   * the structural gate can now pass it.
   *
   * Set true for mutation/reconciliation paths and integrity audits.
   */
  verifyPhysicalBytes?: boolean;

  /**
   * Pre-resolved blob_metadata records, keyed by contentHash.
   *
   * When supplied, the blob_metadata existence check reads from this map
   * instead of issuing its own Redis GET. Used by getMediaBatch() so that N
   * records cost one MGET instead of N GETs. A key that is present with a
   * falsy value is treated exactly as a missing record (fail closed).
   */
  blobMetadataLookup?: Map<string, unknown>;
}

export async function verifyPublicMediaAuthority(
  media: Media,
  options: PublicMediaAuthorityOptions = {}
): Promise<boolean> {
  const { verifyPhysicalBytes = false } = options;
  // ONLY published + local is publicly assignable
  if (media.lifecycleState !== 'published' || media.source !== 'local') {
    console.error('[MEDIA_KV] PUBLIC_GATE_REJECTED: Not published local media', {
      mediaId: media.id,
      lifecycleState: media.lifecycleState,
      source: media.source,
      reason: 'Only published + local media is publicly assignable'
    });
    return false;
  }
  
  // Reject synthetic content identity
  if (media.contentHash && isSyntheticContentHash(media.id, media.contentHash)) {
    console.error('[MEDIA_KV] PUBLIC_GATE_REJECTED: Synthetic content identity', {
      mediaId: media.id,
      contentHash: media.contentHash,
      reason: 'Content hash is SHA256(canonicalId), not actual bytes'
    });
    return false;
  }
  
  // Require contentHash for published records
  if (!media.contentHash) {
    console.error('[MEDIA_KV] PUBLIC_GATE_REJECTED: Missing content hash', {
      mediaId: media.id,
      reason: 'PublishedMediaAsset must have content hash for public gate'
    });
    return false;
  }
  
  // CRITICAL: Use storage field to distinguish static vs Blob
  // Static storage: served from /public/images/, no Blob metadata required
  // Blob storage: materialized from Drive, requires Blob metadata
  if (media.storage === 'blob') {
    const blobMetadata = options.blobMetadataLookup
      ? options.blobMetadataLookup.get(media.contentHash)
      : await createRedisClient().get(namespacedKey(`${BLOB_METADATA_PREFIX}${media.contentHash}`));
    
    if (!blobMetadata) {
      console.error('[MEDIA_KV] PUBLIC_GATE_REJECTED: Missing Blob metadata', {
        mediaId: media.id,
        contentHash: media.contentHash,
        storage: media.storage,
        reason: 'Blob-storage assets must have Blob metadata with physical Blob proof'
      });
      return false;
    }
    
    // Real physical verification: fetch Blob bytes and verify hash
    const blobUrl = media.variants.original;
    
    if (!blobUrl) {
      console.error('[MEDIA_KV] PUBLIC_GATE_REJECTED: Missing original variant URL', {
        mediaId: media.id,
        reason: 'Original variant URL is required for Blob verification'
      });
      return false;
    }
    
    if (!verifyPhysicalBytes) {
      // Structural proof satisfied: blob_metadata record exists and an original
      // variant URL is present. Physical byte re-verification is deferred to the
      // mutation and audit paths (see PublicMediaAuthorityOptions).
      return true;
    }

    const verificationResult = await verifyBlobHash(blobUrl, media.contentHash);
    
    if (!verificationResult.success) {
      console.error('[MEDIA_KV] PUBLIC_GATE_REJECTED: Blob hash verification failed', {
        mediaId: media.id,
        contentHash: media.contentHash,
        blobUrl,
        errorType: verificationResult.errorType,
        actualHash: verificationResult.actualHash,
        reason: verificationResult.errorType === 'INTEGRITY_FAILURE' 
          ? 'Physical Blob bytes do not match content hash'
          : `Blob verification failed: ${verificationResult.errorType}`
      });
      return false;
    }
  } else if (media.storage === 'static') {
    // Static storage: served from /public/images/, no Blob verification required
    // Verify that static files have proper local paths instead of Blob URLs
    if (!media.variants || !media.variants.original) {
      console.error('[MEDIA_KV] PUBLIC_GATE_REJECTED: Static media missing original variant', {
        mediaId: media.id,
        storage: media.storage,
        reason: 'Static storage assets must have original variant path'
      });
      return false;
    }
    
    // Verify static path is properly formatted (starts with /images/)
    if (!media.variants.original.startsWith('/images/')) {
      console.error('[MEDIA_KV] PUBLIC_GATE_REJECTED: Invalid static path format', {
        mediaId: media.id,
        storage: media.storage,
        path: media.variants.original,
        reason: 'Static storage assets must have paths starting with /images/'
      });
      return false;
    }
  } else {
    // Missing or invalid storage field
    console.error('[MEDIA_KV] PUBLIC_GATE_REJECTED: Missing or invalid storage field', {
      mediaId: media.id,
      storage: media.storage,
      reason: 'Published local media must have storage field (static or blob)'
    });
    return false;
  }
  
  return true;
}

/**
 * Get media by ID from KV
 * Returns null if not found or if constitutional proof fails
 * DriveReference records are exempt from constitutional proof
 */
export async function getMedia(id: string): Promise<Media | null> {
  try {
    const client = createRedisClient();
    if (!client) {
      console.warn('[MEDIA_KV] KV unavailable for getMedia', { id });
      return null;
    }
    
    const data = await client.get(namespacedKey(`media:${id}`));
    
    if (!data) {
      return null;
    }
    
    // Handle both JSON strings and already-deserialized objects
    const media = typeof data === 'string' ? JSON.parse(data) : data;
    
    // Verify public media authority before returning (strict public gate)
    if (media.lifecycleState === 'published' && media.source === 'local') {
      // Read path: structural gate only. See PublicMediaAuthorityOptions.
      const hasPublicAuthority = await verifyPublicMediaAuthority(media);
      if (!hasPublicAuthority) {
        console.warn('[MEDIA_KV] Media failed public media authority check', { id });
        return null;
      }
    }
    
    // Stale records are never returned
    if (media.lifecycleState === 'stale') {
      console.warn('[MEDIA_KV] Rejecting stale media record', { id });
      return null;
    }
    
    return media;
  } catch (error) {
    // DEV_MODE_SKIP_KV: Return null to allow higher-level fallback
    if (error instanceof KvUnavailableError && error.message.includes('DEV_MODE_SKIP_KV')) {
      console.log('[MEDIA_KV] DEV_MODE_SKIP_KV - returning null for static fallback', { id });
      return null;
    }
    
    console.error('[MEDIA_KV] Failed to get media:', error);
    throw new Error(`Failed to get media ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Batch variant of getMedia().
 *
 * Applies exactly the same public-media gate and the same stale-record
 * rejection as getMedia(), but resolves N records with a bounded number of
 * round trips instead of N client constructions and 2N GETs:
 *
 *   1 MGET for the media records
 * + 1 MGET for the blob_metadata records of blob-backed candidates
 *
 * Ordering is not guaranteed; callers should use the returned Map.
 * Records that fail the gate are ABSENT from the result, identically to
 * getMedia() returning null. Rejections are still logged individually, so
 * PUBLIC_GATE_REJECTED telemetry is preserved.
 */
export async function getMediaBatch(ids: string[]): Promise<Map<string, Media>> {
  const result = new Map<string, Media>();
  if (ids.length === 0) return result;

  try {
    return await getMediaBatchInner(ids, result);
  } catch (error) {
    // Mirror getMedia()'s failure semantics exactly.
    if (error instanceof KvUnavailableError && error.message.includes('DEV_MODE_SKIP_KV')) {
      console.log('[MEDIA_KV] DEV_MODE_SKIP_KV - returning empty batch for static fallback');
      return result;
    }

    console.error('[MEDIA_KV] Failed to get media batch:', error);
    throw new Error(`Failed to get media batch: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function getMediaBatchInner(ids: string[], result: Map<string, Media>): Promise<Map<string, Media>> {
  const client = createRedisClient();
  const CHUNK = 100;

  const raw: Array<{ id: string; media: any }> = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const values = await client.mget<any[]>(...slice.map(id => namespacedKey(`media:${id}`)));
    slice.forEach((id, idx) => {
      const data = values?.[idx];
      if (!data) return;
      try {
        raw.push({ id, media: typeof data === 'string' ? JSON.parse(data) : data });
      } catch (error) {
        console.error('[MEDIA_KV] BATCH_PARSE_FAILED', { id });
      }
    });
  }

  // Pre-resolve blob_metadata for blob-backed published records in one pass.
  const hashes = Array.from(new Set(
    raw
      .filter(r => r.media?.storage === 'blob' && typeof r.media?.contentHash === 'string')
      .map(r => r.media.contentHash as string)
  ));

  const blobMetadataLookup = new Map<string, unknown>();
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const slice = hashes.slice(i, i + CHUNK);
    const values = await client.mget<any[]>(...slice.map(h => namespacedKey(`${BLOB_METADATA_PREFIX}${h}`)));
    slice.forEach((h, idx) => blobMetadataLookup.set(h, values?.[idx] ?? null));
  }

  // Check order is identical to getMedia(): authority gate first, then stale,
  // so rejection logging matches the single-record path record for record.
  for (const { id, media } of raw) {
    if (media.lifecycleState === 'published' && media.source === 'local') {
      const ok = await verifyPublicMediaAuthority(media, { blobMetadataLookup });
      if (!ok) {
        console.warn('[MEDIA_KV] Media failed public media authority check', { id });
        continue;
      }
    }

    if (media.lifecycleState === 'stale') {
      console.warn('[MEDIA_KV] Rejecting stale media record', { id });
      continue;
    }

    result.set(id, media as Media);
  }

  return result;
}

/**
 * Get media record by ID from KV WITHOUT constitutional proof verification
 * This is used for reconciliation/repair operations to inspect authoritative records
 * even when the public proof gate would reject them (e.g., poisoned records, missing Blob metadata)
 * 
 * CRITICAL: This function bypasses the constitutional proof gate.
 * It should ONLY be used for repair/reconciliation operations, never for public presentation.
 * 
 * @param id - Media ID to retrieve
 * @returns Media record or null if not found
 */
export async function getMediaRecordRaw(id: string): Promise<Media | null> {
  try {
    const client = createRedisClient();
    if (!client) {
      console.warn('[MEDIA_KV] KV unavailable for getMediaRecordRaw', { id });
      return null;
    }
    
    const data = await client.get(namespacedKey(`media:${id}`));
    
    if (!data) {
      return null;
    }
    
    // Handle both JSON strings and already-deserialized objects
    const media = typeof data === 'string' ? JSON.parse(data) : data;
    
    // NO constitutional proof verification - return raw authoritative record
    // This allows reconciliation to inspect DriveReference records and poisoned PublishedMediaAsset records
    console.log('[MEDIA_KV] RAW_MEDIA_RECORD_RETRIEVED', { 
      id, 
      lifecycleState: media.lifecycleState, 
      source: media.source,
      hasDrive: !!media.drive 
    });
    
    return media;
  } catch (error) {
    console.error('[MEDIA_KV] Failed to get raw media record:', error);
    throw new Error(`Failed to get raw media record ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * List all media IDs in KV
 */
export async function listMediaIds(): Promise<string[]> {
  try {
    const client = createRedisClient();
    if (!client) {
      console.warn('[MEDIA_KV] KV unavailable for listMediaIds');
      return [];
    }
    
    const keys: string[] = [];
    let cursor = '0';
    
    do {
      const result = await client.scan(cursor, { match: namespacedKey(`${MEDIA_PREFIX}*`), count: 100 });
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');
    
    const namespace = getKvNamespace();
    return keys.map(key => key.replace(namespace + MEDIA_PREFIX, ''));
  } catch (error) {
    console.error('[MEDIA_KV] Failed to list media IDs:', error);
    throw new Error(`Failed to list media IDs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Save media to KV
 * Stores media record and maintains content hash index for O(1) deduplication
 * Uses atomic Lua script to ensure media record and index remain consistent
 */
export async function saveMedia(media: Media): Promise<void> {
  try {
    // P0 FIX: Enforce storage contract for published local records
    // This prevents invalid PublishedMediaAsset records from being persisted
    if (media.lifecycleState === 'published' && media.source === 'local') {
      // Storage field MUST be present for published local records
      if (!media.storage) {
        throw new Error(`Cannot save media ${media.id}: Published local media requires storage field (static or blob)`);
      }
      
      // Storage must be either static or blob
      if (media.storage !== 'static' && media.storage !== 'blob') {
        throw new Error(`Cannot save media ${media.id}: Published local media storage must be 'static' or 'blob', got '${media.storage}'`);
      }
      
      // Static storage must have valid static path
      if (media.storage === 'static') {
        if (!media.variants?.original) {
          throw new Error(`Cannot save media ${media.id}: Static storage requires variants.original`);
        }
        if (!media.variants.original.startsWith('/images/')) {
          throw new Error(`Cannot save media ${media.id}: Static storage path must start with /images/, got '${media.variants.original}'`);
        }
      }
      
      // Blob storage must have content hash
      if (media.storage === 'blob') {
        if (!media.contentHash) {
          throw new Error(`Cannot save media ${media.id}: Blob storage requires content hash`);
        }
      }
      
      // Verify materialization state before saving (internal operations only)
      // This is permissive for intermediate states during materialization
      const hasValidState = await verifyMaterializationState(media);
      if (!hasValidState) {
        throw new Error(`Cannot save media ${media.id}: Failed materialization state check`);
      }
    }
    
    const client = createRedisClient();
    
    // Use atomic Lua script to maintain media record + index consistency
    const saveScript = `
      local mediaKey = KEYS[1]
      local contentHashKey = KEYS[2]
      local mediaId = ARGV[1]
      local contentHash = ARGV[2]
      local mediaJson = ARGV[3]
      
      -- Set media record
      redis.call('SET', mediaKey, mediaJson)
      
      -- Update content hash index if content hash present
      if contentHash and contentHash ~= '' then
        redis.call('SET', contentHashKey, mediaId)
      end
      
      return 'OK'
    `;
    
    await client.eval(
      saveScript,
      [namespacedKey(`${MEDIA_PREFIX}${media.id}`), namespacedKey(`${CONTENT_HASH_PREFIX}${media.contentHash || ''}`)],
      [media.id, media.contentHash || '', JSON.stringify(media)]
    );
  } catch (error) {
    console.error('[MEDIA_KV] Failed to save media:', error);
    throw new Error(`Failed to save media ${media.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update storage field with Compare-And-Swap (CAS) protection
 * 
 * This is a true atomic CAS operation using Redis Lua script to prevent race conditions
 * during concurrent reconciliation operations.
 * 
 * CAS Conditions:
 * 1. Record must exist
 * 2. Content hash must match expected value (record hasn't changed since classification)
 * 3. Storage field must be either unset or already match proposed value (idempotent)
 * 
 * @param mediaId - The media record ID
 * @param expectedContentHash - The content hash from classification (CAS condition)
 * @param proposedStorage - The proposed storage value ("static" or "blob")
 * @returns true if updated, false if CAS conflict (record modified or already set)
 */
export async function updateStorageFieldCAS(
  mediaId: string,
  expectedContentHash: string,
  proposedStorage: 'static' | 'blob'
): Promise<{ success: boolean; reason?: string }> {
  try {
    const client = createRedisClient();
    
    // Atomic Lua script for CAS-protected storage field update
    const casScript = `
      local mediaKey = KEYS[1]
      local expectedHash = ARGV[1]
      local proposedStorage = ARGV[2]
      
      -- Get current media record
      local mediaJson = redis.call('GET', mediaKey)
      
      -- CAS Check 1: Record must exist
      if not mediaJson then
        return 'RECORD_NOT_FOUND'
      end
      
      -- Parse current record
      local parsed = cjson.decode(mediaJson)
      local currentHash = parsed.contentHash
      local currentStorage = parsed.storage
      
      -- CAS Check 2: Content hash must match (record hasn't changed)
      if currentHash ~= expectedHash then
        return 'HASH_MISMATCH'
      end
      
      -- CAS Check 3: Storage must be unset or already match (idempotent)
      if currentStorage and currentStorage ~= '' and currentStorage ~= proposedStorage then
        return 'STORAGE_ALREADY_SET'
      end
      
      -- All CAS checks passed - update storage field atomically
      parsed.storage = proposedStorage
      local updatedJson = cjson.encode(parsed)
      redis.call('SET', mediaKey, updatedJson)
      
      return 'OK'
    `;
    
    const result = await client.eval(
      casScript,
      [namespacedKey(`${MEDIA_PREFIX}${mediaId}`)],
      [expectedContentHash, proposedStorage]
    ) as string;
    
    if (result === 'OK') {
      console.log('[MEDIA_KV] CAS update successful', { mediaId, storage: proposedStorage });
      return { success: true };
    } else {
      console.warn('[MEDIA_KV] CAS update failed', { mediaId, reason: result });
      return { success: false, reason: result };
    }
  } catch (error) {
    console.error('[MEDIA_KV] Failed CAS update:', error);
    throw new Error(`Failed CAS update for ${mediaId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete media from KV
 * Also removes content hash index entry
 * Uses atomic Lua script to ensure media record and index are deleted together
 */
export async function deleteMedia(id: string): Promise<void> {
  try {
    const client = createRedisClient();
    
    // Use atomic Lua script to delete media record and index together
    const deleteScript = `
      local mediaKey = KEYS[1]
      local contentHashPrefix = KEYS[2]
      
      -- Get current media record to extract content hash
      local mediaJson = redis.call('GET', mediaKey)
      local contentHash = nil
      
      if mediaJson then
        local parsed = cjson.decode(mediaJson)
        if parsed.contentHash then
          contentHash = parsed.contentHash
        end
      end
      
      -- Delete media record
      redis.call('DEL', mediaKey)
      
      -- Delete content hash index if content hash was present
      if contentHash and contentHash ~= '' then
        local actualContentHashKey = contentHashPrefix .. contentHash
        redis.call('DEL', actualContentHashKey)
      end
      
      return 'OK'
    `;
    
    await client.eval(
      deleteScript,
      [namespacedKey(`${MEDIA_PREFIX}${id}`), namespacedKey(CONTENT_HASH_PREFIX)],
      []
    );
  } catch (error) {
    console.error('[MEDIA_KV] Failed to delete media:', error);
    throw new Error(`Failed to delete media ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Alias for saveMedia for backward compatibility
 */
export const storeMedia = saveMedia;

/**
 * Alias for saveMedia for bootstrap operations
 */
export const setMedia = saveMedia;

/**
 * Get Blob metadata by content hash
 * This is the authoritative accessor for Blob metadata
 * Uses environment namespace abstraction
 */
export async function getBlobMetadata(contentHash: string): Promise<Record<string, unknown> | null> {
  try {
    const client = createRedisClient();
    if (!client) {
      console.warn('[MEDIA_KV] KV unavailable for getBlobMetadata', { contentHash });
      return null;
    }
    const data = await client.get(namespacedKey(`${BLOB_METADATA_PREFIX}${contentHash}`));
    if (!data) return null;
    
    // Handle both JSON strings and already-deserialized objects
    if (typeof data === 'string') {
      return JSON.parse(data) as Record<string, unknown>;
    } else if (typeof data === 'object' && data !== null) {
      return data as Record<string, unknown>;
    } else {
      return null;
    }
  } catch (error) {
    console.error('[MEDIA_KV] Error getting blob metadata', { contentHash, error });
    return null;
  }
}

/**
 * Find media by content hash using O(1) index lookup
 * Returns null if not found or if index points to non-existent media (stale index)
 */
export async function findMediaByContentHash(contentHash: string): Promise<Media | null> {
  try {
    const client = createRedisClient();
    if (!client) {
      console.warn('[MEDIA_KV] KV unavailable for findMediaByContentHash', { contentHash });
      return null;
    }
    
    // O(1) lookup via content hash index
    const mediaId = await client.get(namespacedKey(`${CONTENT_HASH_PREFIX}${contentHash}`));
    
    if (!mediaId) {
      return null;
    }
    
    // P0 FIX: Use getMediaRecordRaw for deduplication inspection
    // This allows the deduplication path to see poisoned records that the constitutional proof gate would reject
    // The ingestion path needs to distinguish between DriveReference (upgrade) vs PublishedMediaAsset (deduplicate)
    const media = await getMediaRecordRaw(mediaId as string);
    
    // Fail closed if index points to non-existent media (stale index)
    if (!media) {
      console.error('[MEDIA_KV] STALE_INDEX_ENTRY: content_hash index points to non-existent media', {
        contentHash,
        mediaId,
        reason: 'Index is stale - media record was deleted but index was not cleaned up'
      });
      // Clean up stale index entry
      await client.del(namespacedKey(`${CONTENT_HASH_PREFIX}${contentHash}`));
      return null;
    }
    
    // Verify the content hash actually matches (defensive check)
    if (media.contentHash !== contentHash) {
      console.error('[MEDIA_KV] INDEX_MISMATCH: content_hash index points to media with different hash', {
        contentHash,
        mediaId,
        actualMediaHash: media.contentHash,
        reason: 'Index corruption - cleanup required'
      });
      // Clean up corrupted index entry
      await client.del(namespacedKey(`${CONTENT_HASH_PREFIX}${contentHash}`));
      return null;
    }
    
    console.log('[MEDIA_KV] DEDUPLICATION_LOOKUP_COMPLETED', {
      contentHash,
      mediaId,
      lifecycleState: media.lifecycleState,
      source: media.source,
      hasDrive: !!media.drive,
      isDriveReference: media.lifecycleState === 'source_reference'
    });
    
    return media;
  } catch (error) {
    console.error('[MEDIA_KV] Failed to find media by content hash:', error);
    throw new Error(`Failed to find media by content hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
