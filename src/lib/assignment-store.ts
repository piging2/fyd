/**
 * Service Card Assignment Store
 *
 * Provides persistent storage for service card media assignments.
 * Stores assignments independently of static services.v1.json configuration.
 * Uses Upstash Redis for durable runtime storage.
 *
 * DEV_MODE_SKIP_KV: In development without KV credentials, uses in-memory Map for testing.
 *
 * ARCHITECTURAL BOUNDARIES:
 * - Read operations are PURE (no side effects)
 * - Cleanup operations are EXPLICIT MUTATION (clear intent)
 * - Write gate is BEFORE persistence (constitutional enforcement)
 * - Evidence preservation before any deletion
 * - Forensic analysis uses raw scan, not filtered public readers
 */

import { Redis } from '@upstash/redis';
import crypto from 'crypto';

// In-memory store for DEV_MODE_SKIP_KV testing
// Use global to survive Next.js hot module reloading in development
declare global {
  var __inMemoryAssignments: Map<string, ServiceCardAssignment> | undefined;
}

const inMemoryAssignments = global.__inMemoryAssignments || new Map<string, ServiceCardAssignment>();

if (process.env.NODE_ENV === 'development') {
  global.__inMemoryAssignments = inMemoryAssignments;
}

/**
 * P0 FIX: Removed createHash function - no fingerprint logging to prevent secret exposure
 * Credential investigation now uses only boolean indicators (hasUrl, hasToken, etc.)
 */

/**
 * P1-9: KV environment isolation
 * Each environment (production, preview, development, test) has a distinct namespace
 * to prevent cross-environment data access and isolation violations.
 */
type Environment = 'production' | 'preview' | 'development' | 'test';

function getEnvironment(): Environment {
  const vercelEnv = process.env.VERCEL_ENV;
  const nodeEnv = process.env.NODE_ENV;
  
  // Vercel production
  if (vercelEnv === 'production') {
    return 'production';
  }
  
  // Vercel preview
  if (vercelEnv === 'preview') {
    return 'preview';
  }
  
  // Local development
  if (nodeEnv === 'development') {
    return 'development';
  }
  
  // Test environment
  if (nodeEnv === 'test') {
    return 'test';
  }
  
  // P0 FIX: Fail closed on unknown environment
  // Unknown/missing environment must not silently default to development
  // This prevents production-like execution from accidentally routing into development namespace
  throw new Error(
    `Unknown environment: VERCEL_ENV=${vercelEnv}, NODE_ENV=${nodeEnv}. ` +
    'Environment must be explicitly configured. Cannot proceed with unsafe default.'
  );
}

/**
 * Get KV namespace prefix for current environment
 * This ensures isolation between production, preview, development, and test
 * CRITICAL: Use TEST_NAMESPACE if present for integration test isolation
 * This prevents tests from writing to production/development data
 */
function getKvNamespace(): string {
  if (process.env.TEST_NAMESPACE) {
    return process.env.TEST_NAMESPACE;
  }
  const env = getEnvironment();
  return `hpp:${env}:`;
}

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
  // Check if we're in Next.js build phase
  // During build, NODE_ENV is 'production' but we're not actually running
  const isBuilding = process.env.NEXT_PHASE === 'build';
  return isBuilding;
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
  
  // P0 FIX: Remove token fingerprint logging - use only boolean indicators
  const urlHost = url ? new URL(url).hostname : 'none';
  const integrationUrlHost = integrationUrl ? new URL(integrationUrl).hostname : 'none';
  
  const hasUrl = !!url;
  const hasToken = !!token;
  const hasIntegrationUrl = !!integrationUrl;
  const hasIntegrationToken = !!integrationToken;
  const hasReadOnlyToken = !!readOnlyToken;
  
  // Determine token type
  let tokenType = 'unknown';
  if (token === readOnlyToken) {
    tokenType = 'read-only';
  } else if (token === integrationToken) {
    tokenType = 'integration-read-write';
  } else if (token) {
    tokenType = 'manual-read-write';
  }
  
  console.log('[CREDENTIAL_INVESTIGATION]', {
    urlHost,
    integrationUrlHost,
    hasUrl,
    hasToken,
    hasIntegrationUrl,
    hasIntegrationToken,
    hasReadOnlyToken,
    tokenType,
    integrationUrlPresent: !!integrationUrl,
    integrationTokenPresent: !!integrationToken,
    readOnlyTokenPresent: !!readOnlyToken,
    selectedCredentialHasValue: hasUrl || hasToken,
    allRedisVars: Object.keys(process.env).filter(key => 
      key.includes('KV') || key.includes('REDIS') || key.includes('UPSTASH')
    ).map(key => ({ key, hasValue: !!process.env[key] })),
  });
  
  // DEV_MODE_SKIP_KV: Allow development without KV credentials
  // This enables testing the assignment loop in local development
  if (process.env.DEV_MODE_SKIP_KV === 'true') {
    console.log('[ASSIGNMENT_KV] DEV_MODE_SKIP_KV enabled - KV operations will be skipped');
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
  
  // Create fresh client bound to current environment
  const env = getEnvironment();
  const client = new Redis({ url, token });
  
  console.log('[ASSIGNMENT_KV] Created environment-bound client', {
    environment: env,
    namespace: getKvNamespace(),
    urlHost,
    tokenType,
  });
  
  return client;
}

const ASSIGNMENT_PREFIX = 'service-card-assignment:';
const ASSIGNMENT_QUARANTINE_PREFIX = 'service-card-assignment-quarantine:';

export interface ServiceCardAssignment {
  serviceSlug: string;
  mediaId: string; // Empty string indicates fail-closed state (no image)
  updatedAt: string;
  source: 'workbench';
  revision?: number;
  actor?: 'workbench' | 'reconciliation' | 'migration'; // Distinguishes between UI and automated operations
}

/**
 * Raw assignment record for forensic analysis
 * Contains both validated and malformed data
 */
export interface RawAssignmentRecord {
  key: string;
  serviceSlug: string;
  rawPayload: unknown;
  mediaId?: string;
  revision?: number;
  updatedAt?: string;
  source?: string;
  schemaClassification: 'VALID' | 'SCHEMA_INVALID' | 'MISSING_REQUIRED_FIELDS';
  mediaLifecycleClassification: 'DRIVE_REFERENCE' | 'PUBLISHED_MEDIA_ASSET' | 'UNKNOWN_MEDIA' | 'UNCLASSIFIED';
  chronologyClassification: 'PRE_GATE_RECORDED' | 'POST_GATE_RECORDED' | 'MISSING_TIMESTAMP' | 'INVALID_TIMESTAMP' | 'CHRONOLOGY_INCONCLUSIVE';
}

/**
 * Quarantine record interface (evidence-preserving)
 */
export interface QuarantineRecord {
  originalKey: string;
  originalAssignment: ServiceCardAssignment;
  quarantineReason: string;
  quarantinedAt: string;
  quarantinedBy: string;
  originalUpdatedAt?: string;
  originalRevision?: number;
  evidenceHash: string;
  gateClassification?: 'PRE_GATE' | 'POST_GATE' | 'UNKNOWN';
}

/**
 * Quarantine report interface (reconciliation)
 */
export interface QuarantineReport {
  beforeCount: number;
  poisonedCount: number;
  quarantinedCount: number;
  deletedFromActiveCount: number;
  concurrentlyChangedCount: number;
  failedCount: number;
  afterCount: number;
  remainingPoisonCount: number;
  quarantineRecords: QuarantineRecord[];
  timestamp: string;
  gateCommitSha?: string;
  gateCommitTimestamp?: string;
}

/**
 * Gate commit metadata for forensic classification
 */
const GATE_COMMIT_SHA = 'e2409e87b13ff554eb1378a6c156fa21f7e3eb2e';
const GATE_COMMIT_TIMESTAMP = '2026-08-20T22:51:34Z';
const ENHANCED_GATE_COMMIT_SHA = '0041a41ca4563f49d7ccf51ba4c723880a8de6e5';
const ENHANCED_GATE_COMMIT_TIMESTAMP = '2026-08-20T23:45:24Z';

/**
 * Validate ServiceCardAssignment schema at runtime
 * @param data - Data to validate
 * @returns True if valid, false otherwise
 */
export function validateServiceCardAssignment(data: unknown): data is ServiceCardAssignment {
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  const candidate = data as Record<string, unknown>;
  
  // Domain validation for serviceSlug (non-empty, normalized)
  if (typeof candidate.serviceSlug !== 'string' || candidate.serviceSlug.trim().length === 0) {
    return false;
  }
  
  // Domain validation for mediaId (non-empty, valid format)
  if (typeof candidate.mediaId !== 'string' || candidate.mediaId.trim().length === 0) {
    return false;
  }
  
  // Domain validation for updatedAt (valid ISO timestamp)
  if (typeof candidate.updatedAt !== 'string' || !isValidISODate(candidate.updatedAt)) {
    return false;
  }
  
  // Domain validation for source (must be 'workbench')
  // actor field distinguishes between UI and automated operations
  if (candidate.source !== 'workbench') {
    return false;
  }
  
  // Domain validation for actor (if present, must be valid enum value)
  // FAIL-CLOSED: reject if actor is present but not a valid string enum value
  if (candidate.actor !== undefined) {
    const allowedActors = ['workbench', 'reconciliation', 'migration'];
    if (typeof candidate.actor !== 'string' || !allowedActors.includes(candidate.actor)) {
      return false;
    }
  }
  
  // Revision is optional but must be number if present
  if (candidate.revision !== undefined && typeof candidate.revision !== 'number') {
    return false;
  }
  
  return true;
}

/**
 * Delete a service card assignment (EXPLICIT MUTATION)
 * @param serviceSlug - Service slug
 * @param requestId - Optional request ID for correlation
 */
export async function deleteServiceCardAssignment(serviceSlug: string, requestId?: string): Promise<void> {
  const operationId = requestId || `delete-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const key = namespacedKey(`${ASSIGNMENT_PREFIX}${serviceSlug}`);

  console.log('[ASSIGNMENT_DELETE] DELETE_REQUEST', {
    operationId,
    serviceSlug,
    key,
  });

  try {
    const client = createRedisClient();
    await client.del(key);

    console.log('[ASSIGNMENT_DELETE] DELETE_SUCCESS', {
      operationId,
      key,
      serviceSlug,
    });
  } catch (error) {
    console.error('[ASSIGNMENT_DELETE] DELETE_FAILURE', {
      operationId,
      serviceSlug,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Re-throw as error - this is a runtime dependency failure
    throw new Error(`Failed to delete assignment for ${serviceSlug}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate ISO 8601 timestamp format
 */
function isValidISODate(dateString: string): boolean {
  try {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && date.toISOString() === dateString;
  } catch {
    return false;
  }
}

/**
 * Generate stable evidence hash for quarantine identity
 * Uses SHA-256 of canonical payload for idempotency
 */
async function generateEvidenceHash(payload: ServiceCardAssignment): Promise<string> {
  const crypto = await import('crypto');
  const canonical = JSON.stringify({
    serviceSlug: payload.serviceSlug,
    mediaId: payload.mediaId,
    revision: payload.revision,
    updatedAt: payload.updatedAt,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Store a service card assignment with CAS (Compare-And-Swap) semantics
 * @param assignment - Assignment to store
 * @param expectedRevision - Optional expected revision for CAS (rejects if current revision doesn't match)
 * @param requestId - Optional request ID for correlation
 */
export async function storeServiceCardAssignment(
  assignment: ServiceCardAssignment, 
  expectedRevision?: number,
  requestId?: string
): Promise<void> {
  const operationId = requestId || `store-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const key = namespacedKey(`${ASSIGNMENT_PREFIX}${assignment.serviceSlug}`);
  
  // REJECT: drive-prefixed IDs at write time (Drive references cannot become public assignments)
  // drive- and drive-ref- prefixes are reserved for DriveReference only
  if (assignment.mediaId.startsWith('drive-') || assignment.mediaId.startsWith('drive-ref-')) {
    console.error('[ASSIGNMENT_WRITE] REJECTED: drive-prefixed mediaId at write time', {
      operationId,
      serviceSlug: assignment.serviceSlug,
      mediaId: assignment.mediaId,
      validationError: 'Drive-prefixed IDs cannot be assigned to public presentation',
    });
    throw new Error(`Drive-prefixed IDs cannot be assigned to public presentation: ${assignment.mediaId}`);
  }
  
  // VALIDATE: mediaId must resolve to a valid PublishedMediaAsset before assignment can become active
  // This enforces the contract at write time instead of discovery at read time
  try {
    const { resolvePublicMedia } = await import('./media');
    const resolvedMedia = await resolvePublicMedia(assignment.mediaId);
    
    if (!resolvedMedia) {
      console.error('[ASSIGNMENT_WRITE] REJECTED: mediaId does not resolve to valid PublishedMediaAsset', {
        operationId,
        serviceSlug: assignment.serviceSlug,
        mediaId: assignment.mediaId,
        validationError: 'Media ID must resolve to a valid PublishedMediaAsset before assignment',
      });
      throw new Error(`Media ID does not resolve to a valid PublishedMediaAsset: ${assignment.mediaId}`);
    }
    
    console.log('[ASSIGNMENT_WRITE] MEDIA_VALIDATION_PASSED', {
      operationId,
      serviceSlug: assignment.serviceSlug,
      mediaId: assignment.mediaId,
      resolvedMediaId: resolvedMedia.id,
    });
  } catch (validationError) {
    // If validation fails, do not store the assignment
    console.error('[ASSIGNMENT_WRITE] MEDIA_VALIDATION_FAILED', {
      operationId,
      serviceSlug: assignment.serviceSlug,
      mediaId: assignment.mediaId,
      error: validationError instanceof Error ? validationError.message : 'Unknown error',
    });
    throw validationError;
  }
  
  // Runtime schema validation
  if (!validateServiceCardAssignment(assignment)) {
    const serviceSlug = (assignment as Record<string, unknown>)?.serviceSlug as string || 'unknown';
    console.error('[ASSIGNMENT_WRITE] SCHEMA_VALIDATION_FAILED', {
      operationId,
      assignment,
      validationError: 'Invalid ServiceCardAssignment schema',
    });
    throw new Error(`Invalid assignment schema for ${serviceSlug}`);
  }
  
  console.log('[ASSIGNMENT_WRITE]', {
    operationId,
    serviceSlug: assignment.serviceSlug,
    mediaId: assignment.mediaId,
    key,
    expectedRevision,
  });
  
  // CAS ENFORCEMENT: Reject undefined expectedRevision to prevent unconditional overwrites
  // Callers MUST read current state first and provide expected revision
  // - Existing assignment: expectedRevision = current.revision
  // - Missing assignment: expectedRevision = 0 (create)
  if (expectedRevision === undefined) {
    console.error('[ASSIGNMENT_WRITE] REJECTED: expectedRevision is required for CAS enforcement', {
      operationId,
      serviceSlug: assignment.serviceSlug,
      mediaId: assignment.mediaId,
      validationError: 'expectedRevision is required to prevent lost updates (use 0 for create)',
    });
    throw new Error(`CAS enforcement requires expectedRevision for ${assignment.serviceSlug}. Read current assignment first to obtain the revision (use 0 for create).`);
  }
  
  try {
    const client = createRedisClient();
    
    // Use atomic Lua script for CAS - prevents lost updates
    // Script: GET current revision, compare with expected, SET if match
    // CAS bootstrap semantics:
    // - expectedRevision = 0 + key absent → create
    // - expectedRevision = 0 + key present → reject (CAS failure)
    // - expectedRevision > 0 + revision match → update
    // - expectedRevision > 0 + revision mismatch → reject (CAS failure)
    const casScript = `
      local key = KEYS[1]
      local expectedRevision = tonumber(ARGV[1])
      local newAssignment = ARGV[2]
      
      local current = redis.call('GET', key)
      local currentRevision = 0
      
      if current then
        local parsed = cjson.decode(current)
        if parsed.revision then
          currentRevision = tonumber(parsed.revision)
        end
      end
      
      -- CAS check: only proceed if expectedRevision matches
      if expectedRevision ~= nil and currentRevision ~= expectedRevision then
        return {err = 'CAS_FAILURE: Revision mismatch'}
      end
      
      -- Set new assignment with incremented revision
      local parsedAssignment = cjson.decode(newAssignment)
      parsedAssignment.revision = currentRevision + 1
      redis.call('SET', key, cjson.encode(parsedAssignment))
      
      return currentRevision + 1
    `;
    
    const newRevision = await client.eval(
      casScript,
      [key],
      [
        String(expectedRevision),
        JSON.stringify(assignment),
      ]
    ) as number;
    
    console.log('[ASSIGNMENT_WRITE] SET_SUCCESS', {
      operationId,
      key,
      mediaId: assignment.mediaId,
      revision: newRevision,
      casCheck: expectedRevision !== undefined ? 'ATOMIC_CAS_VERIFIED' : 'NO_CAS_EXPECTED',
    });
    
    // CAS implemented: atomic Lua script prevents lost updates
    // Last-write-wins still applies when expectedRevision is not provided
    
  } catch (error) {
    // DEV_MODE_SKIP_KV: Use in-memory store for development testing
    if (error instanceof KvUnavailableError && error.message.includes('DEV_MODE_SKIP_KV')) {
      console.log('[ASSIGNMENT_WRITE] DEV_MODE_SKIP_KV - using in-memory store', {
        operationId,
        serviceSlug: assignment.serviceSlug,
      });
      
      const current = inMemoryAssignments.get(assignment.serviceSlug);
      const currentRevision = current?.revision || 0;
      
      // CAS check for in-memory store
      if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
        console.error('[ASSIGNMENT_WRITE] IN_MEMORY_CAS_FAILURE', {
          operationId,
          serviceSlug: assignment.serviceSlug,
          expectedRevision,
          actualRevision: currentRevision,
        });
        throw new Error(`CAS failure for ${assignment.serviceSlug}: expected revision ${expectedRevision}, got ${currentRevision}`);
      }
      
      // Store with incremented revision
      const newAssignment = {
        ...assignment,
        revision: currentRevision + 1,
      };
      inMemoryAssignments.set(assignment.serviceSlug, newAssignment);
      
      console.log('[ASSIGNMENT_WRITE] IN_MEMORY_SET_SUCCESS', {
        operationId,
        serviceSlug: assignment.serviceSlug,
        revision: newAssignment.revision,
      });
      return;
    }
    
    console.error('[ASSIGNMENT_WRITE] FAILURE', {
      operationId,
      serviceSlug: assignment.serviceSlug,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error(`Failed to store assignment for ${assignment.serviceSlug}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Retrieve a service card assignment (PURE READ - no side effects)
 * @param serviceSlug - Service slug
 * @param requestId - Optional request ID for correlation
 * @returns Assignment or null
 */
export async function getServiceCardAssignment(serviceSlug: string, requestId?: string): Promise<ServiceCardAssignment | null> {
  const operationId = requestId || `get-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const key = namespacedKey(`${ASSIGNMENT_PREFIX}${serviceSlug}`);

  console.log('[ASSIGNMENT_READ]', {
    operationId,
    serviceSlug,
    key,
  });

  try {
    const client = createRedisClient();

    // Use typed object API - @upstash/redis handles deserialization
    const assignment = await client.get<ServiceCardAssignment>(key);

    if (!assignment) {
      console.log('[ASSIGNMENT_READ] NOT_FOUND', {
        operationId,
        key,
        serviceSlug,
      });
      return null;
    }

    // Validate readback schema (PURE READ - no side effects)
    if (!validateServiceCardAssignment(assignment)) {
      console.error('[ASSIGNMENT_READ] SCHEMA_VALIDATION_FAILED', {
        operationId,
        key,
        serviceSlug,
        assignment,
        validationError: 'Readback failed schema validation',
      });
      // Return null for corrupted data - do NOT quarantine during read
      // Use explicit cleanup function to handle corrupted data
      return null;
    }

    console.log('[ASSIGNMENT_READ] SUCCESS', {
      operationId,
      key,
      serviceSlug,
      mediaId: assignment.mediaId,
    });

    return assignment;
  } catch (error) {
    // DEV_MODE_SKIP_KV: Use in-memory store for development testing
    if (error instanceof KvUnavailableError && error.message.includes('DEV_MODE_SKIP_KV')) {
      console.log('[ASSIGNMENT_READ] DEV_MODE_SKIP_KV - using in-memory store', {
        operationId,
        serviceSlug,
      });
      
      const assignment = inMemoryAssignments.get(serviceSlug);
      
      if (!assignment) {
        console.log('[ASSIGNMENT_READ] IN_MEMORY_NOT_FOUND', {
          operationId,
          serviceSlug,
        });
        return null;
      }

      // Validate readback schema
      if (!validateServiceCardAssignment(assignment)) {
        console.error('[ASSIGNMENT_READ] IN_MEMORY_SCHEMA_VALIDATION_FAILED', {
          operationId,
          serviceSlug,
          assignment,
          validationError: 'Readback failed schema validation',
        });
        return null;
      }

      console.log('[ASSIGNMENT_READ] IN_MEMORY_SUCCESS', {
        operationId,
        serviceSlug,
        mediaId: assignment.mediaId,
      });

      return assignment;
    }
    
    console.error('[ASSIGNMENT_READ] FAILURE', {
      operationId,
      serviceSlug,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Get all service card assignments (PURE READ - no side effects)
 * @returns Array of all assignments
 */
export async function getAllServiceCardAssignments(): Promise<ServiceCardAssignment[]> {
  try {
    const client = createRedisClient();
    // Use scan to find all keys with the assignment prefix
    const keys: string[] = [];
    let cursor = '0';
    do {
      const result = await client.scan(cursor, { match: namespacedKey(`${ASSIGNMENT_PREFIX}*`), count: 100 });
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    // Use Promise.all for parallel reads instead of sequential loop
    const assignments: ServiceCardAssignment[] = [];
    const readPromises = keys.map(async (key) => {
      try {
        // Use typed object API - @upstash/redis handles deserialization
        const assignment = await client.get<ServiceCardAssignment>(key);
        if (assignment && validateServiceCardAssignment(assignment)) {
          return assignment;
        }
        return null;
      } catch (error) {
        console.log('[ASSIGNMENT_READ] Failed to load individual key:', key, error);
        return null;
      }
    });

    const results = await Promise.all(readPromises);
    assignments.push(...results.filter((a): a is ServiceCardAssignment => a !== null));

    return assignments;
  } catch (error) {
    console.error('[ASSIGNMENT_READ] FAILURE', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error(`Failed to list assignments: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Scan raw assignment records for forensic analysis (PURE FORENSIC READ)
 * Returns all records including malformed ones - does NOT filter
 *
 * @returns Array of raw assignment records with classifications
 */
export async function scanRawAssignmentRecords(): Promise<RawAssignmentRecord[]> {
  try {
    const client = createRedisClient();
    const keys: string[] = [];
    let cursor = '0';

    // Scan all assignment keys
    do {
      const result = await client.scan(cursor, { match: namespacedKey(`${ASSIGNMENT_PREFIX}*`), count: 100 });
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    const records: RawAssignmentRecord[] = [];
    const gateDate = new Date(GATE_COMMIT_TIMESTAMP);

    for (const key of keys) {
      try {
        const rawPayload = await client.get(key);
        const serviceSlug = key.replace(namespacedKey(ASSIGNMENT_PREFIX), '');

        // Schema classification
        let schemaClassification: RawAssignmentRecord['schemaClassification'] = 'SCHEMA_INVALID';
        let mediaId: string | undefined;
        let revision: number | undefined;
        let updatedAt: string | undefined;
        let source: string | undefined;

        if (rawPayload && typeof rawPayload === 'object') {
          const candidate = rawPayload as Record<string, unknown>;
          mediaId = typeof candidate.mediaId === 'string' ? candidate.mediaId : undefined;
          revision = typeof candidate.revision === 'number' ? candidate.revision : undefined;
          updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined;
          source = typeof candidate.source === 'string' ? candidate.source : undefined;

          if (validateServiceCardAssignment(rawPayload)) {
            schemaClassification = 'VALID';
          }
        }

        // Media lifecycle classification (using canonical authority)
        let mediaLifecycleClassification: RawAssignmentRecord['mediaLifecycleClassification'] = 'UNCLASSIFIED';
        if (mediaId) {
          if (mediaId.startsWith('drive-') || mediaId.startsWith('drive-ref-')) {
            mediaLifecycleClassification = 'DRIVE_REFERENCE';
          } else {
            // Check if resolves to PublishedMediaAsset using canonical gate
            try {
              const { resolvePublicMedia } = await import('./media');
              const resolvedMedia = await resolvePublicMedia(mediaId);
              if (resolvedMedia) {
                mediaLifecycleClassification = 'PUBLISHED_MEDIA_ASSET';
              } else {
                mediaLifecycleClassification = 'UNKNOWN_MEDIA';
              }
            } catch {
              mediaLifecycleClassification = 'UNKNOWN_MEDIA';
            }
          }
        }

        // Chronology classification (updatedAt, NOT createdAt)
        let chronologyClassification: RawAssignmentRecord['chronologyClassification'] = 'MISSING_TIMESTAMP';
        if (updatedAt) {
          const updatedAtDate = new Date(updatedAt);
          if (isNaN(updatedAtDate.getTime())) {
            chronologyClassification = 'INVALID_TIMESTAMP';
          } else if (updatedAtDate < gateDate) {
            chronologyClassification = 'PRE_GATE_RECORDED';
          } else {
            chronologyClassification = 'POST_GATE_RECORDED';
          }
        }

        records.push({
          key,
          serviceSlug,
          rawPayload,
          mediaId,
          revision,
          updatedAt,
          source,
          schemaClassification,
          mediaLifecycleClassification,
          chronologyClassification,
        });
      } catch (error) {
        console.error('[FORENSIC_SCAN] Error processing key:', key, error);
      }
    }

    return records;
  } catch (error) {
    console.error('[FORENSIC_SCAN] FAILURE', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error(`Failed to scan raw assignment records: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Find poisoned assignments (PURE ANALYSIS - no side effects)
 * Analyzes raw records and returns poison classification
 *
 * @returns Analysis report with poisoned assignments
 */
export async function findPoisonedAssignments(): Promise<{
  total: number;
  poisoned: Array<{
    serviceSlug: string;
    mediaId: string;
    reason: string;
    assignment: ServiceCardAssignment;
    schemaClassification: string;
    mediaLifecycleClassification: string;
    chronologyClassification: string;
  }>;
}> {
  try {
    const rawRecords = await scanRawAssignmentRecords();
    const poisoned: Array<{
      serviceSlug: string;
      mediaId: string;
      reason: string;
      assignment: ServiceCardAssignment;
      schemaClassification: string;
      mediaLifecycleClassification: string;
      chronologyClassification: string;
    }> = [];

    for (const record of rawRecords) {
      // Skip schema-invalid records (handled by cleanupCorruptedAssignments)
      if (record.schemaClassification !== 'VALID') {
        continue;
      }

      // Check for Drive references
      if (record.mediaLifecycleClassification === 'DRIVE_REFERENCE') {
        poisoned.push({
          serviceSlug: record.serviceSlug,
          mediaId: record.mediaId || 'unknown',
          reason: 'Drive reference (drive- or drive-ref- prefix)',
          assignment: record.rawPayload as ServiceCardAssignment,
          schemaClassification: record.schemaClassification,
          mediaLifecycleClassification: record.mediaLifecycleClassification,
          chronologyClassification: record.chronologyClassification,
        });
        continue;
      }

      // Check for unknown/unresolved media
      if (record.mediaLifecycleClassification === 'UNKNOWN_MEDIA') {
        poisoned.push({
          serviceSlug: record.serviceSlug,
          mediaId: record.mediaId || 'unknown',
          reason: 'Media does not resolve to PublishedMediaAsset',
          assignment: record.rawPayload as ServiceCardAssignment,
          schemaClassification: record.schemaClassification,
          mediaLifecycleClassification: record.mediaLifecycleClassification,
          chronologyClassification: record.chronologyClassification,
        });
      }
    }

    return {
      total: rawRecords.length,
      poisoned,
    };
  } catch (error) {
    console.error('[POISON_ANALYSIS] FAILURE', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error(`Failed to analyze poisoned assignments: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Cleanup corrupted assignments (EXPLICIT MUTATION - uses unified quarantine primitive)
 *
 * This function explicitly removes assignments that fail schema validation.
 * It uses the same evidence-preserving quarantine primitive as poison cleanup.
 *
 * @returns Cleanup report with counts
 */
export async function cleanupCorruptedAssignments(): Promise<QuarantineReport> {
  try {
    const client = createRedisClient();
    const rawRecords = await scanRawAssignmentRecords();

    const schemaInvalidRecords = rawRecords.filter(r => r.schemaClassification !== 'VALID');

    const poisonList = schemaInvalidRecords.map(record => ({
      serviceSlug: record.serviceSlug,
      mediaId: record.mediaId || 'unknown',
      reason: `Schema invalid: ${record.schemaClassification}`,
      assignment: record.rawPayload as ServiceCardAssignment,
    }));

    return await quarantinePoisonedAssignments(poisonList, false);
  } catch (error) {
    console.error('[ASSIGNMENT_CLEANUP] FAILED', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error(`Failed to cleanup corrupted assignments: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Quarantine poisoned assignments (EXPLICIT MUTATION - re-read-before-delete protection)
 *
 * This is the UNIFIED QUARANTINE PRIMITIVE for all cleanup operations.
 * It implements:
 * - Re-read-before-delete: verifies expected revision before deletion (NOT atomic CAS)
 * - Evidence preservation: full QuarantineRecord with original metadata
 * - Deterministic quarantine keys: based on evidence hash
 * - Reconciliation: before = deleted + concurrently_changed + failed + after
 * - Authorization boundary: requires explicit dryRun flag
 *
 * NOTE: This is NOT atomic CAS. Race window exists between GET and DELETE.
 * Atomic CAS would require conditional delete primitive not available in @upstash/redis client.
 *
 * @param poisonList - List of poisoned assignments to quarantine (from findPoisonedAssignments)
 * @param dryRun - If true, analyze only without mutation (default: false)
 * @returns Detailed quarantine report with reconciliation
 */
export async function quarantinePoisonedAssignments(
  poisonList: Array<{
    serviceSlug: string;
    mediaId: string;
    reason: string;
    assignment: ServiceCardAssignment;
  }>,
  dryRun: boolean = true
): Promise<QuarantineReport> {
  const client = createRedisClient();
  const timestamp = new Date().toISOString();
  const quarantinedBy = 'assignment-store-quarantine-system';

  const beforeCount = poisonList.length;
  let quarantinedCount = 0;
  let deletedFromActiveCount = 0;
  let concurrentlyChangedCount = 0;
  let failedCount = 0;
  const quarantineRecords: QuarantineRecord[] = [];

  console.log('[ASSIGNMENT_QUARANTINE] Starting quarantine analysis', {
    beforeCount,
    timestamp,
    dryRun,
    gateCommitSha: GATE_COMMIT_SHA,
    gateCommitTimestamp: GATE_COMMIT_TIMESTAMP,
  });

  // AUTHORIZATION BOUNDARY: Check for post-gate poison
  const postGatePoison = poisonList.filter(poison => {
    if (poison.assignment.updatedAt) {
      const updatedAtDate = new Date(poison.assignment.updatedAt);
      const gateDate = new Date(GATE_COMMIT_TIMESTAMP);
      return updatedAtDate >= gateDate;
    }
    return false;
  });

  if (postGatePoison.length > 0) {
    console.error('[ASSIGNMENT_QUARANTINE] AUTHORIZATION_DENIED: POST-GATE POISON DETECTED', {
      postGateCount: postGatePoison.length,
      postGatePoison: postGatePoison.map(p => ({ serviceSlug: p.serviceSlug, mediaId: p.mediaId, updatedAt: p.assignment.updatedAt })),
    });
    throw new Error('AUTHORIZATION_DENIED: Cannot quarantine post-gate poison without explicit investigation');
  }

  // AUTHORIZATION BOUNDARY: Check for missing/invalid timestamps
  const inconclusivePoison = poisonList.filter(poison => {
    if (!poison.assignment.updatedAt) return true;
    const updatedAtDate = new Date(poison.assignment.updatedAt);
    return isNaN(updatedAtDate.getTime());
  });

  if (inconclusivePoison.length > 0) {
    console.error('[ASSIGNMENT_QUARANTINE] AUTHORIZATION_DENIED: CHRONOLOGY INCONCLUSIVE', {
      inconclusiveCount: inconclusivePoison.length,
      inconclusivePoison: inconclusivePoison.map(p => ({ serviceSlug: p.serviceSlug, mediaId: p.mediaId, updatedAt: p.assignment.updatedAt })),
    });
    throw new Error('AUTHORIZATION_DENIED: Cannot quarantine poison with inconclusive chronology');
  }

  // Dry-run mode: analyze only, no mutation
  if (dryRun) {
    console.log('[ASSIGNMENT_QUARANTINE] DRY_RUN: Analysis complete, no mutations performed');
    for (const poison of poisonList) {
      const key = `${ASSIGNMENT_PREFIX}${poison.serviceSlug}`;
      const originalAssignment = poison.assignment;
      const evidenceHash = await generateEvidenceHash(originalAssignment);

      let gateClassification: QuarantineRecord['gateClassification'] = 'UNKNOWN';
      if (originalAssignment.updatedAt) {
        const updatedAtDate = new Date(originalAssignment.updatedAt);
        const gateDate = new Date(GATE_COMMIT_TIMESTAMP);
        if (updatedAtDate < gateDate) {
          gateClassification = 'PRE_GATE';
        } else {
          gateClassification = 'POST_GATE';
        }
      }

      const quarantineRecord: QuarantineRecord = {
        originalKey: key,
        originalAssignment,
        quarantineReason: poison.reason,
        quarantinedAt: timestamp,
        quarantinedBy,
        originalUpdatedAt: originalAssignment.updatedAt,
        originalRevision: originalAssignment.revision,
        evidenceHash,
        gateClassification,
      };

      quarantineRecords.push(quarantineRecord);
    }

    return {
      beforeCount,
      poisonedCount: beforeCount,
      quarantinedCount: 0,
      deletedFromActiveCount: 0,
      concurrentlyChangedCount: 0,
      failedCount: 0,
      afterCount: beforeCount,
      remainingPoisonCount: beforeCount,
      quarantineRecords,
      timestamp,
      gateCommitSha: GATE_COMMIT_SHA,
      gateCommitTimestamp: GATE_COMMIT_TIMESTAMP,
    };
  }

  // Actual mutation mode
  for (const poison of poisonList) {
    try {
      const key = `${ASSIGNMENT_PREFIX}${poison.serviceSlug}`;
      const originalAssignment = poison.assignment;

      // RE-READ-BEFORE-DELETE: Check current state before mutation (NOT atomic CAS)
      // This is best-effort protection, not atomic compare-and-set
      // Race window exists between GET and DELETE
      const currentAssignment = await client.get<ServiceCardAssignment>(key);

      // Verify expected revision (best-effort check, not atomic)
      if (currentAssignment && currentAssignment.revision !== originalAssignment.revision) {
        concurrentlyChangedCount++;
        console.warn('[ASSIGNMENT_QUARANTINE] CONCURRENT_MODIFICATION_DETECTED', {
          serviceSlug: poison.serviceSlug,
          expectedRevision: originalAssignment.revision,
          currentRevision: currentAssignment.revision,
        });
        continue;
      }

      // Generate stable evidence hash for deterministic quarantine key
      const evidenceHash = await generateEvidenceHash(originalAssignment);
      const quarantineKey = namespacedKey(`${ASSIGNMENT_QUARANTINE_PREFIX}${evidenceHash}`);

      // Classify chronology for gate classification
      let gateClassification: QuarantineRecord['gateClassification'] = 'UNKNOWN';
      if (originalAssignment.updatedAt) {
        const updatedAtDate = new Date(originalAssignment.updatedAt);
        const gateDate = new Date(GATE_COMMIT_TIMESTAMP);
        if (updatedAtDate < gateDate) {
          gateClassification = 'PRE_GATE';
        } else {
          gateClassification = 'POST_GATE';
        }
      }

      // Create evidence-preserving quarantine record
      const quarantineRecord: QuarantineRecord = {
        originalKey: key,
        originalAssignment,
        quarantineReason: poison.reason,
        quarantinedAt: timestamp,
        quarantinedBy,
        originalUpdatedAt: originalAssignment.updatedAt,
        originalRevision: originalAssignment.revision,
        evidenceHash,
        gateClassification,
      };

      // Store quarantine record with full evidence
      await client.set(quarantineKey, quarantineRecord);

      // Remove from active namespace (CAS-safe: already verified revision)
      await client.del(key);

      quarantinedCount++;
      deletedFromActiveCount++;
      quarantineRecords.push(quarantineRecord);

      console.log('[ASSIGNMENT_QUARANTINE] Poison assignment quarantined and removed', {
        serviceSlug: poison.serviceSlug,
        mediaId: poison.mediaId,
        reason: poison.reason,
        quarantineKey,
        originalRevision: originalAssignment.revision,
        evidenceHash,
      });
    } catch (error) {
      failedCount++;
      console.error('[ASSIGNMENT_QUARANTINE] Error processing assignment:', poison.serviceSlug, error);
    }
  }

  // Verify final state
  const afterAnalysis = await findPoisonedAssignments();
  const afterCount = afterAnalysis.poisoned.length;

  const report: QuarantineReport = {
    beforeCount,
    poisonedCount: beforeCount,
    quarantinedCount,
    deletedFromActiveCount,
    concurrentlyChangedCount,
    failedCount,
    afterCount,
    remainingPoisonCount: afterCount,
    quarantineRecords,
    timestamp,
    gateCommitSha: GATE_COMMIT_SHA,
    gateCommitTimestamp: GATE_COMMIT_TIMESTAMP,
  };

  // Reconciliation check (FIXED: use actual successful deletes, not quarantine writes)
  const expectedAfter = beforeCount - deletedFromActiveCount - concurrentlyChangedCount;
  const reconciliation = afterCount === expectedAfter;
  console.log('[ASSIGNMENT_QUARANTINE] Complete', {
    ...report,
    reconciliation: reconciliation ? 'PASS' : 'FAIL',
    expectedAfter,
    actualAfter: afterCount,
  });

  if (!reconciliation) {
    console.error('[ASSIGNMENT_QUARANTINE] RECONCILIATION FAILED', {
      beforeCount,
      quarantinedCount,
      deletedFromActiveCount,
      concurrentlyChangedCount,
      failedCount,
      expectedAfter,
      actualAfter: afterCount,
    });
  }

  return report;
}