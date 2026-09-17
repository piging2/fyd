/**
 * Vercel Blob Storage for Media Assets
 *
 * Provides persistent storage for image assets on Vercel.
 * Stores original, WebP, AVIF, and thumbnail variants.
 * 
 * Contract corrections:
 * - Never return filename as URL
 * - Persist actual Blob URL as authoritative storage address
 * - Make object identity content-addressed
 * - Eliminate race conditions in idempotency
 */

import { put, head, del } from '@vercel/blob';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';
import { getEnvironment, getKvNamespace } from '@/lib/environment';

/**
 * Verification result with distinct error types
 * Distinguishes transport/auth failures from actual integrity failures
 */
export interface BlobHashVerificationResult {
  success: boolean;
  errorType?: 'BLOB_NOT_FOUND' | 'AUTH_FAILURE' | 'INTEGRITY_FAILURE' | 'TRANSPORT_ERROR' | 'INVALID_URL' | 'UNKNOWN_ERROR';
  actualHash?: string;
}

/**
 * P0 FIX: Eliminate process-global mutable state
 * Create fresh Redis client on each call to prevent identity leaks
 * and cross-request contamination
 */
function getRedisClient(): Redis | null {
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
  
  if (!url || !token) {
    console.warn('[BLOB_STORAGE] KV credentials not configured, returning null client');
    return null;
  }
  
  // Create fresh client on each call (no global cache)
  return new Redis({ url, token });
}

/**
 * Verify that a Blob's actual bytes match the expected content hash
 * This is real physical verification, not just metadata checking
 * 
 * Returns structured error types instead of boolean to enable proper classification
 * - BLOB_NOT_FOUND: Blob object doesn't exist
 * - AUTH_FAILURE: Authorization/transport failure prevented access
 * - INTEGRITY_FAILURE: Blob exists but bytes don't match expected hash
 * - TRANSPORT_ERROR: Network/infrastructure error prevented verification
 * - INVALID_URL: URL format is invalid
 * - UNKNOWN_ERROR: Unclassified error
 */
export async function verifyBlobHash(blobUrl: string, expectedContentHash: string): Promise<BlobHashVerificationResult> {
  try {
    // Extract filename from blobUrl for head() call
    // blobUrl format: https://[region].blob.vercel-storage.com/[account]/[filename]
    const url = new URL(blobUrl);
    const pathname = url.pathname;
    const filename = pathname.split('/').pop();
    
    if (!filename) {
      console.error('[BLOB_STORAGE] Invalid blobUrl format', { blobUrl });
      return { success: false, errorType: 'INVALID_URL' };
    }

    // Use authenticated head() to verify Blob exists and is accessible
    const headResult = await head(filename);
    
    // Now fetch actual bytes for hash verification
    // Use the authenticated URL from head result if available, otherwise use original
    const fetchUrl = headResult.url || blobUrl;
    
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      if (response.status === 404) {
        console.error('[BLOB_STORAGE] Blob not found', { blobUrl, filename });
        return { success: false, errorType: 'BLOB_NOT_FOUND' };
      } else if (response.status === 403) {
        console.error('[BLOB_STORAGE] Blob auth/transport failure', { blobUrl, filename, status: 403 });
        return { success: false, errorType: 'AUTH_FAILURE' };
      } else {
        console.error('[BLOB_STORAGE] Blob fetch failed', { blobUrl, filename, status: response.status });
        return { success: false, errorType: 'TRANSPORT_ERROR' };
      }
    }
    
    const buffer = await response.arrayBuffer();
    const hash = crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');
    
    const matches = hash === expectedContentHash;
    
    if (!matches) {
      console.error('[BLOB_STORAGE] Blob hash mismatch (integrity failure)', {
        blobUrl,
        filename,
        expected: expectedContentHash,
        actual: hash,
      });
      return { success: false, errorType: 'INTEGRITY_FAILURE', actualHash: hash };
    }
    
    return { success: true };
  } catch (error) {
    // Handle Vercel Blob errors with structured classification
    if (error instanceof Error) {
      if (error.message.includes('Blob not found') || error.message.includes('NotFoundError')) {
        console.error('[BLOB_STORAGE] Blob not found (SDK error)', { blobUrl, error: error.message });
        return { success: false, errorType: 'BLOB_NOT_FOUND' };
      } else if (error.message.includes('Access denied') || error.message.includes('Unauthorized')) {
        console.error('[BLOB_STORAGE] Blob auth failure (SDK error)', { blobUrl, error: error.message });
        return { success: false, errorType: 'AUTH_FAILURE' };
      } else {
        console.error('[BLOB_STORAGE] Blob verification error', { blobUrl, error: error.message });
        return { success: false, errorType: 'TRANSPORT_ERROR' };
      }
    } else {
      console.error('[BLOB_STORAGE] Unknown error verifying Blob hash', { blobUrl, error });
      return { success: false, errorType: 'UNKNOWN_ERROR' };
    }
  }
}

export interface BlobUploadResult {
  url: string;
  uploadedAt: string;
  alreadyExisted: boolean;
  contentHash: string;
}

interface BlobMetadata {
  url: string;
  filename: string;
  contentType: string;
  uploadedAt: string;
  contentHash: string;
  byteSize: number;
}

/**
 * Verify that a Blob URL is physically accessible
 * @param blobUrl - The Blob URL to verify
 * @returns true if the Blob exists and is accessible
 */
export async function verifyBlobExists(blobUrl: string): Promise<boolean> {
  try {
    const response = await fetch(blobUrl, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.error('[BLOB_STORAGE] Error verifying Blob existence', { blobUrl, error });
    return false;
  }
}

/**
 * Verify that all required renditions exist in Blob storage
 * This upgrades the contract from "primary content hash exists" to "every required rendition exists"
 * 
 * @param media - The media record to verify
 * @returns object with verification results for each rendition type
 */
export async function verifyRenditionCompleteness(media: any): Promise<{
  complete: boolean;
  details: {
    original: boolean;
    thumbnail: boolean;
    webp: boolean;
    avif: boolean;
    responsive: Array<{ width: number; webp: boolean; avif: boolean }>;
  };
}> {
  const details = {
    original: false,
    thumbnail: false,
    webp: false,
    avif: false,
    responsive: [] as Array<{ width: number; webp: boolean; avif: boolean }>,
  };

  if (!media.variants) {
    return { complete: false, details };
  }

  // Verify original
  if (media.variants.original) {
    details.original = await verifyBlobExists(media.variants.original);
  }

  // Verify thumbnail
  if (media.variants.thumbnail) {
    details.thumbnail = await verifyBlobExists(media.variants.thumbnail);
  }

  // Verify webp (largest responsive or fallback)
  if (media.variants.webp) {
    details.webp = await verifyBlobExists(media.variants.webp);
  }

  // Verify avif (largest responsive or fallback)
  if (media.variants.avif) {
    details.avif = await verifyBlobExists(media.variants.avif);
  }

  // Verify responsive variants
  if (media.variants.responsive && Array.isArray(media.variants.responsive)) {
    for (const variant of media.variants.responsive) {
      const webpExists = variant.webp ? await verifyBlobExists(variant.webp) : false;
      const avifExists = variant.avif ? await verifyBlobExists(variant.avif) : false;
      details.responsive.push({
        width: variant.width,
        webp: webpExists,
        avif: avifExists,
      });
    }
  }

  // Determine overall completeness
  const complete = details.original && details.thumbnail && details.webp;
  // AVIF is optional (not all browsers support it)
  // Responsive variants should be complete if present

  return { complete, details };
}

/**
 * Upload a buffer to Vercel Blob Storage with proper idempotency contract
 * @param buffer - File content
 * @param filename - Target filename
 * @param contentType - MIME type
 * @returns URL of the uploaded blob
 */
export async function uploadToBlob(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<BlobUploadResult> {
  try {
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const byteSize = buffer.length;
    
    // Check if blob already exists with same content hash (idempotency)
    const existingMetadata = await getBlobMetadataByContentHash(contentHash);
    
    if (existingMetadata) {
      // Authority boundary: verify physical bytes before trusting existing metadata
      // Redis metadata is a locator, not cryptographic proof of identity
      const hashMatches = await verifyBlobHash(existingMetadata.url, contentHash);
      
      if (!hashMatches.success) {
        console.error('[BLOB_STORAGE] EXISTING_METADATA_INVALID: Physical bytes do not match recorded hash', {
          contentHash,
          blobUrl: existingMetadata.url,
          errorType: hashMatches.errorType,
          actualHash: hashMatches.actualHash,
          reason: 'Existing Redis metadata points to Blob with wrong physical bytes - metadata is poisoned'
        });
        // Fall through to upload new Blob - metadata will be overwritten
      } else {
        console.log('[BLOB_STORAGE] Blob already exists with verified physical bytes, reusing URL:', existingMetadata.url);
        return {
          url: existingMetadata.url, // Return actual persisted Blob URL
          uploadedAt: existingMetadata.uploadedAt,
          alreadyExisted: true,
          contentHash,
        };
      }
    }
    
    // Generate content-addressed filename to prevent Blob key collisions
    // Use first 12 chars of content hash + original filename extension
    const hashPrefix = contentHash.substring(0, 12);
    const filenameParts = filename.split('.');
    const extension = filenameParts.length > 1 ? filenameParts.pop() : 'bin';
    const baseName = filenameParts.join('.');
    const contentAddressedFilename = `${baseName}-${hashPrefix}.${extension}`;
    
    // Upload to Vercel Blob with content-addressed filename
    const blob = await put(contentAddressedFilename, buffer, {
      access: 'public',
      contentType,
    });
    
    // Store complete metadata including actual Blob URL
    const metadata: BlobMetadata = {
      url: blob.url,
      filename: contentAddressedFilename,
      contentType,
      uploadedAt: new Date().toISOString(),
      contentHash,
      byteSize,
    };
    
    const client = getRedisClient();
    if (!client) {
      console.warn('[BLOB_STORAGE] KV unavailable for metadata storage', { contentHash });
      throw new Error('KV credentials not configured - cannot store blob metadata');
    }
    const namespace = getKvNamespace();
    const metadataKey = `${namespace}blob_metadata:${contentHash}`;
    await client.set(metadataKey, JSON.stringify(metadata));
    
    // CRITICAL: Verify metadata was written and can be read back
    const verifyMetadata = await client.get(metadataKey);
    if (!verifyMetadata) {
      console.error('[BLOB_STORAGE] METADATA_WRITE_VERIFICATION_FAILED', {
        contentHash,
        metadataKey,
        reason: 'Metadata written but cannot be read back - KV write may have failed'
      });
      throw new Error('Blob metadata write verification failed');
    }
    
    console.log('[BLOB_STORAGE] New blob uploaded and metadata stored:', {
      contentHash,
      url: blob.url,
      filename: contentAddressedFilename,
      metadataKey,
      verified: true,
    });
    
    return {
      url: blob.url,
      uploadedAt: new Date().toISOString(),
      alreadyExisted: false,
      contentHash,
    };
  } catch (error) {
    // Handle Vercel Blob duplicate error gracefully
    if (error instanceof Error && error.message.includes('This blob already exists')) {
      console.log('[BLOB_STORAGE] Blob already exists (API level), fetching metadata:', filename);
      const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
      const existingMetadata = await getBlobMetadataByContentHash(contentHash);
      
      if (existingMetadata) {
        return {
          url: existingMetadata.url,
          uploadedAt: existingMetadata.uploadedAt,
          alreadyExisted: true,
          contentHash,
        };
      }
      
      // If metadata doesn't exist but blob does, recover metadata from Blob storage
      console.log('[BLOB_STORAGE] Blob exists but metadata missing, recovering from Blob storage:', contentHash);
      
      // Recover metadata by deterministically generating the content-addressed filename
      const hashPrefix = contentHash.substring(0, 12);
      const filenameParts = filename.split('.');
      const extension = filenameParts.length > 1 ? filenameParts.pop() : 'bin';
      const baseName = filenameParts.join('.');
      const contentAddressedFilename = `${baseName}-${hashPrefix}.${extension}`;
      
      try {
        // Use Vercel Blob SDK to recover metadata from existing Blob
        const blobHead = await head(contentAddressedFilename);
        
        // Fail closed if size is missing - cannot trust recovered metadata without it
        if (!blobHead.size || blobHead.size <= 0) {
          throw new Error(`Blob recovery failed: missing or invalid size for ${contentAddressedFilename}`);
        }
        
        // CRITICAL: Verify physical bytes match expected content hash
        // This is cryptographic proof of identity, not just filename convention
        const hashMatches = await verifyBlobHash(blobHead.url, contentHash);
        
        if (!hashMatches.success) {
          console.error('[BLOB_STORAGE] RECOVERY_FAILED: Physical bytes do not match expected content hash', {
            contentHash,
            blobUrl: blobHead.url,
            filename: contentAddressedFilename,
            errorType: hashMatches.errorType,
            actualHash: hashMatches.actualHash,
            reason: 'Cryptographic identity proof failed - Blob bytes do not match expected hash'
          });
          throw new Error(`Blob recovery failed: physical bytes do not match expected content hash ${contentHash}`);
        }
        
        // Only after physical verification succeeds, recreate metadata
        const recoveredMetadata: BlobMetadata = {
          url: blobHead.url,
          filename: contentAddressedFilename,
          contentType: blobHead.contentType || contentType,
          uploadedAt: typeof blobHead.uploadedAt === 'string' 
            ? blobHead.uploadedAt 
            : new Date().toISOString(),
          contentHash,
          byteSize: blobHead.size,
        };
        
        // Store recovered metadata in Redis
        const client = getRedisClient();
        if (!client) {
          console.warn('[BLOB_STORAGE] KV unavailable for metadata recovery', { contentHash });
          throw new Error('KV credentials not configured - cannot store recovered blob metadata');
        }
        const namespace = getKvNamespace();
        await client.set(`${namespace}blob_metadata:${contentHash}`, JSON.stringify(recoveredMetadata));
        
        console.log('[BLOB_STORAGE] Recovered and stored metadata for existing Blob:', {
          contentHash,
          url: blobHead.url,
          filename: contentAddressedFilename,
          verification: 'physical_hash_verified',
        });
        
        return {
          url: blobHead.url,
          uploadedAt: typeof blobHead.uploadedAt === 'string' 
            ? blobHead.uploadedAt 
            : new Date().toISOString(),
          alreadyExisted: true,
          contentHash,
        };
      } catch (headError) {
        console.error('[BLOB_STORAGE] Failed to recover Blob metadata:', headError);
        throw new Error(`Blob exists but metadata recovery failed for content hash: ${contentHash}`);
      }
    }
    
    console.error('[BLOB_STORAGE] Upload failed:', error);
    throw new Error(`Failed to upload ${filename} to Blob storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get Blob metadata by content hash (for verification)
 * This is exported for use by the media proof gate
 */
export async function getBlobMetadataByContentHash(contentHash: string): Promise<BlobMetadata | null> {
  try {
    const client = getRedisClient();
    if (!client) {
      console.warn('[BLOB_STORAGE] KV unavailable for getBlobMetadataByContentHash', { contentHash });
      return null;
    }
    const namespace = getKvNamespace();
    const data = await client.get(`${namespace}blob_metadata:${contentHash}`);
    if (!data) return null;
    
    // Handle both JSON strings and already-deserialized objects
    // Upstash may return objects for some existing records
    if (typeof data === 'string') {
      // Standard case: JSON string, parse it
      return JSON.parse(data) as BlobMetadata;
    } else if (typeof data === 'object' && data !== null) {
      // Upstash returned already-deserialized object
      return data as BlobMetadata;
    } else {
      throw new Error(`Unexpected data type: ${typeof data}`);
    }
  } catch (e) {
    console.error('[BLOB_STORAGE] Content hash lookup failed:', e);
    throw new Error(`Failed to find blob metadata by content hash: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}

/**
 * Generate a unique filename for a media variant
 * @param mediaId - Media record ID
 * @param variantType - Type of variant (original, webp, avif, thumbnail)
 * @param extension - File extension
 * @returns Unique filename
 */
export function generateBlobFilename(
  mediaId: string,
  variantType: string,
  extension: string
): string {
  return `${mediaId}-${variantType}.${extension}`;
}
