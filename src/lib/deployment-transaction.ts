/**
 * Deployment Transaction State Machine
 *
 * Provides authoritative transaction state management for Workbench deployments.
 * Enforces legal state transitions, idempotency, and concurrent deployment safety.
 *
 * TRANSACTION STATES:
 * - prepared: Transaction is ready to be claimed for deployment, staging keys can be added
 * - committing: Transaction is actively being deployed (exactly one owner), no new mutations allowed
 * - committed: Git commit SHA recorded and immutable
 * - consumed: Staging cleanup allowed, transaction is complete
 * - failed: Retry/recovery policy applies
 *
 * LEGAL TRANSITIONS:
 * - prepared → committing (claim transaction)
 * - committing → committed (Git commit succeeded)
 * - committing → failed (Git commit failed, retryable)
 * - committed → consumed (staging cleanup complete)
 * - failed → prepared (retry attempt)
 *
 * STAGING KEY AGGREGATION:
 * - Multiple assignments can share one transaction ID
 * - Each assignment contributes its staging key to the transaction
 * - Staging keys are atomically merged with deduplication
 * - Staging keys can only be added in 'prepared' state
 * - Once in 'committing' or later, no new mutations allowed
 *
 * ILLEGAL TRANSITIONS (rejected):
 * - Any state → committing (must go through prepared first)
 * - committed → committing (cannot replay committed transaction)
 * - consumed → any state (terminal state)
 * - committing → prepared (must fail first)
 * - Adding staging keys to non-prepared transaction
 *
 * IDEMPOTENCY:
 * - Duplicate transaction submission returns existing authoritative state
 * - Duplicate staging key registration is idempotent (no-op)
 * - Exactly one Git commit per transaction ID
 * - Idempotent replay returns original commit SHA
 */

import { Redis } from '@upstash/redis';
import { getEnvironment, getKvNamespace } from '@/lib/environment';

/**
 * P0 FIX: Eliminate process-global mutable state
 * Create fresh Redis client on each call to prevent identity leaks
 */
function getRedisClient(): Redis {
  let url = process.env.KV_REST_API_URL;
  let token = process.env.KV_REST_API_TOKEN;
  
  const integrationUrl = process.env.KV_REST_API__KV_REST_API_URL || process.env.KV_REST_API__REDIS_URL || process.env.KV_REST_API__KV_URL;
  const integrationToken = process.env.KV_REST_API__KV_REST_API_TOKEN;
  
  if (!url && integrationUrl) url = integrationUrl;
  if (!token && integrationToken) token = integrationToken;
  
  if (!url || !token) {
    throw new Error('Missing required environment variables: KV_REST_API_URL and KV_REST_API_TOKEN');
  }
  
  // Create fresh client on each call (no global cache)
  return new Redis({ url, token });
}

/**
 * P0 FIX: Normalize Redis Lua error codes at repository boundary
 * Upstash Redis returns errors wrapped as "Command failed: ERROR_CODE"
 * Callers expect stable machine-readable error codes, not wrapped messages
 */
function normalizeRedisError(error: string): string {
  return error.replace(/^Command failed: /, '');
}

export type TransactionState = 'prepared' | 'committing' | 'committed' | 'consumed' | 'failed';

export interface DeploymentTransaction {
  transactionId: string;
  state: TransactionState;
  owner?: string; // Claim token for committing state
  commitSha?: string; // Git commit SHA (immutable once set)
  commitUrl?: string;
  parentCommitSha?: string; // Expected parent for concurrent safety
  stagingKeys: string[];
  files: string[]; // Authority files in this transaction
  reason?: string;
  createdAt: string;
  claimedAt?: string;
  committedAt?: string;
  consumedAt?: string;
  failedAt?: string;
  failureReason?: string;
  retryCount?: number;
}

const TRANSACTION_PREFIX = 'deployment-transaction:';

/**
 * Atomic Lua script for multi-assignment promotion
 * Validates all expected revisions, then atomically writes all assignments
 * Prevents partial promotion failures
 *
 * P0 FIX: Accepts namespace as ARGV[3] to ensure atomic promotion writes to
 * the same namespaced keyspace as the authoritative assignment store.
 * Previous version wrote to unnamespaced 'service-card-assignment:' keys,
 * causing namespace isolation failure.
 */
const ATOMIC_PROMOTION_SCRIPT = `
  local assignmentsData = cjson.decode(ARGV[1])
  local deploymentTransactionId = ARGV[2]
  local namespace = ARGV[3]
  
  -- P0 FIX: Validate transaction state before promotion
  local transactionKey = namespace .. 'deployment-transaction:' .. deploymentTransactionId
  local transaction = redis.call('GET', transactionKey)
  
  if not transaction then
    return {err = 'TRANSACTION_NOT_FOUND', deploymentTransactionId = deploymentTransactionId}
  end
  
  local parsed = cjson.decode(transaction)
  
  -- Transaction must be in committing state for promotion
  if parsed.state ~= 'committing' then
    return {err = 'INVALID_TRANSACTION_STATE', deploymentTransactionId = deploymentTransactionId, state = parsed.state, expectedState = 'committing'}
  end
  
  -- P0 FIX: Verify transaction ownership
  -- Only the owner who claimed the transaction can promote assignments
  local expectedOwner = ARGV[4]
  if expectedOwner and expectedOwner ~= '' then
    if parsed.owner ~= expectedOwner then
      return {err = 'OWNER_MISMATCH', deploymentTransactionId = deploymentTransactionId, expectedOwner = expectedOwner, actualOwner = parsed.owner}
    end
  end
  
  -- Phase 1: Validate all expected revisions
  for i, assignment in ipairs(assignmentsData) do
    local assignmentKey = namespace .. 'service-card-assignment:' .. assignment.serviceSlug
    local current = redis.call('GET', assignmentKey)
    
    if current then
      local parsed = cjson.decode(current)
      local expectedRevision = assignment.expectedRevision
      
      -- Check if current revision matches expected
      if parsed.revision ~= expectedRevision then
        return {err = 'CAS_FAILURE', serviceSlug = assignment.serviceSlug, expectedRevision = expectedRevision, actualRevision = parsed.revision}
      end
    else
      -- Assignment doesn't exist, expectedRevision must be 0 for create
      if assignment.expectedRevision ~= 0 then
        return {err = 'CAS_FAILURE_MISSING', serviceSlug = assignment.serviceSlug, expectedRevision = assignment.expectedRevision}
      end
    end
  end
  
  -- Phase 2: Atomically write all assignments
  for i, assignment in ipairs(assignmentsData) do
    local assignmentKey = namespace .. 'service-card-assignment:' .. assignment.serviceSlug
    -- Increment revision for write
    assignment.revision = assignment.expectedRevision + 1
    local assignmentValue = cjson.encode(assignment)
    
    redis.call('SET', assignmentKey, assignmentValue)
  end
  
  return {ok = 'PROMOTED', count = #assignmentsData}
`;

/**
 * Atomic multi-assignment promotion
 * Validates all expected revisions, then atomically writes all assignments
 * Prevents partial promotion failures
 *
 * P0 FIX: Passes namespace from getKvNamespace() to Lua script to ensure
 * atomic promotion writes to the same namespaced keyspace as the authoritative
 * assignment store. This prevents namespace isolation failure where promotion
 * writes to unnamespaced keys while normal operations use namespaced keys.
 */
export async function atomicPromoteAssignments(
  assignments: Array<{ serviceSlug: string; mediaId: string; expectedRevision: number; updatedAt: string; source: string }>,
  deploymentTransactionId: string,
  owner?: string
): Promise<{ success: boolean; count: number; error?: string; failedServiceSlug?: string }> {
  try {
    const redis = getRedisClient();
    const namespace = getKvNamespace();
    const assignmentsData = JSON.stringify(assignments);
    
    const result = await redis.eval(
      ATOMIC_PROMOTION_SCRIPT,
      [], // No keys needed for this script
      [assignmentsData, deploymentTransactionId, namespace, owner || '']
    );
    
    if (result && typeof result === 'object' && 'err' in result) {
      const errorResult = result as { err: string; serviceSlug?: string; deploymentTransactionId?: string; state?: string; expectedState?: string };
      console.error('[ATOMIC_PROMOTION] FAILED', {
        deploymentTransactionId,
        error: errorResult.err,
        failedServiceSlug: errorResult.serviceSlug,
      });
      
      // P0 FIX: Normalize Redis Lua error codes at repository boundary
      // Strip "Command failed:" prefix to provide stable machine-readable error codes
      // Callers expect raw error codes like "INVALID_TRANSACTION_STATE", not wrapped messages
      const errorCode = errorResult.err.replace(/^Command failed: /, '');
      
      return {
        success: false,
        count: 0,
        error: errorCode,
        failedServiceSlug: errorResult.serviceSlug,
      };
    }
    
    const successResult = result as { ok: string; count: number };
    console.log('[ATOMIC_PROMOTION] SUCCESS', {
      deploymentTransactionId,
      count: successResult?.count || 0,
    });
    
    return {
      success: true,
      count: successResult?.count || 0,
    };
  } catch (error) {
    console.error('[ATOMIC_PROMOTION] ERROR', {
      deploymentTransactionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get namespaced transaction key
 */
function getTransactionKey(transactionId: string): string {
  const namespace = getKvNamespace();
  return `${namespace}${TRANSACTION_PREFIX}${transactionId}`;
}

/**
 * Atomic Lua script for transaction creation with staging key aggregation
 * Creates new transaction if absent, atomically merges staging keys if exists
 * This supports bulk assignments: multiple assignments share one transaction ID
 * but each contributes its own staging key to the transaction record
 */
const CREATE_TRANSACTION_SCRIPT = `
  local key = KEYS[1]
  local transactionData = ARGV[1]
  local newStagingKeys = cjson.decode(ARGV[2])
  
  local current = redis.call('GET', key)
  
  -- If transaction already exists, atomically merge staging keys
  if current then
    local parsed = cjson.decode(current)
    
    -- Only merge if transaction is in 'prepared' state
    -- Once committing/committed/failed, no new mutations allowed
    if parsed.state ~= 'prepared' then
      return {err = 'TRANSACTION_NOT_PREPARED: Cannot add staging keys to ' .. parsed.state .. ' transaction'}
    end
    
    -- Build merged staging keys with deduplication
    local existingKeys = parsed.stagingKeys or {}
    local mergedKeys = {}
    local keySet = {}
    
    -- Add existing keys to set
    for i, existingKey in ipairs(existingKeys) do
      keySet[existingKey] = true
      table.insert(mergedKeys, existingKey)
    end
    
    -- Add new keys if not already present
    for i, newKey in ipairs(newStagingKeys) do
      if not keySet[newKey] then
        keySet[newKey] = true
        table.insert(mergedKeys, newKey)
      end
    end
    
    -- Update transaction with merged staging keys
    parsed.stagingKeys = mergedKeys
    redis.call('SET', key, cjson.encode(parsed))
    
    return {ok = 'MERGED', data = cjson.encode(parsed), stagingKeysCount = #mergedKeys}
  end
  
  -- Create new transaction atomically
  redis.call('SET', key, transactionData)
  redis.call('EXPIRE', key, 86400) -- 24 hour TTL
  return {ok = 'CREATED'}
`;

/**
 * Atomic Lua script for state transition enforcement
 * Only operates on existing transactions - rejects if transaction doesn't exist
 * Prevents illegal transitions and concurrent claims
 * 
 * CRITICAL: Atomically validates transaction identity before state transition
 */
const STATE_TRANSITION_SCRIPT = `
  local key = KEYS[1]
  local transactionId = ARGV[1]
  local newState = ARGV[2]
  local owner = ARGV[3]
  local expectedParent = ARGV[4]
  local transactionData = ARGV[5]
  
  local current = redis.call('GET', key)
  
  -- REJECT if transaction doesn't exist (creation is separate)
  if not current then
    return {err = 'TRANSACTION_NOT_FOUND: Use createDeploymentTransaction first'}
  end
  
  local parsed = cjson.decode(current)
  local currentState = parsed.state
  
  -- CRITICAL: Validate transaction ID identity
  if parsed.transactionId ~= transactionId then
    return {err = 'TRANSACTION_ID_MISMATCH: Expected ' .. transactionId .. ', got ' .. parsed.transactionId}
  end
  
  -- Legal transition matrix
  local legalTransitions = {
    prepared = { committing = true },
    committing = { committed = true, failed = true },
    committed = { consumed = true },
    failed = { prepared = true },
    consumed = {}
  }
  
  -- Check if transition is legal
  if not legalTransitions[currentState] or not legalTransitions[currentState][newState] then
    return {err = 'ILLEGAL_TRANSITION: ' .. currentState .. ' -> ' .. newState}
  end
  
  -- OWNER VERIFICATION: Only the owner who claimed can perform subsequent transitions
  if parsed.owner and parsed.owner ~= '' then
    if newState == 'committing' or newState == 'committed' or newState == 'consumed' then
      if owner ~= parsed.owner then
        return {err = 'OWNER_MISMATCH: Transaction owned by ' .. parsed.owner .. ', but attempt by ' .. owner}
      end
    end
  end
  
  -- PARENT COMMIT VERIFICATION: Prevent committing against stale branch head
  -- Only enforce for committing → committed transition
  if currentState == 'committing' and newState == 'committed' then
    if expectedParent and expectedParent ~= '' then
      local currentParent = parsed.parentCommitSha or ''
      if currentParent ~= expectedParent then
        return {err = 'PARENT_COMMIT_MISMATCH: Transaction prepared against ' .. currentParent .. ', but branch is now ' .. expectedParent}
      end
    end
  end
  
  -- prepared → committing: atomic claim check
  if currentState == 'prepared' and newState == 'committing' then
    if parsed.owner and parsed.owner ~= owner then
      return {err = 'ALREADY_CLAIMED: Transaction owned by ' .. parsed.owner}
    end
  end
  
  -- committing → committed: verify commit SHA is set
  if currentState == 'committing' and newState == 'committed' then
    local newParsed = cjson.decode(transactionData)
    if not newParsed.commitSha then
      return {err = 'MISSING_COMMIT_SHA: Must provide commit SHA for committed state'}
    end
  end
  
  -- committing → failed: record failure reason and increment retryCount
  if currentState == 'committing' and newState == 'failed' then
    local newParsed = cjson.decode(transactionData)
    if not newParsed.failureReason then
      return {err = 'MISSING_FAILURE_REASON: Must provide failure reason'}
    end
    newParsed.retryCount = (parsed.retryCount or 0) + 1
    transactionData = cjson.encode(newParsed)
  end

  -- failed → prepared: increment retryCount for retry attempt
  if currentState == 'failed' and newState == 'prepared' then
    local newParsed = cjson.decode(transactionData)
    newParsed.retryCount = (parsed.retryCount or 0) + 1
    transactionData = cjson.encode(newParsed)
  end
  
  -- Update transaction
  redis.call('SET', key, transactionData)
  return {ok = 'TRANSITIONED'}
`;

/**
 * Create a new deployment transaction in prepared state (atomic create-or-merge)
 * Creates new transaction if absent, atomically merges staging keys if exists
 * This supports bulk assignments: multiple assignments share one transaction ID
 * @param transactionId - Unique transaction ID
 * @param stagingKeys - Staging keys to merge into transaction
 * @param files - Authority files in this transaction (immutable after creation)
 * @param reason - Deployment reason (immutable after creation)
 * @param parentCommitSha - Expected parent commit for concurrent safety
 * @returns Created or merged transaction
 */
export async function createDeploymentTransaction(
  transactionId: string,
  stagingKeys: string[],
  files: string[],
  reason?: string,
  parentCommitSha?: string
): Promise<DeploymentTransaction> {
  const key = getTransactionKey(transactionId);
  const client = getRedisClient();

  const transaction: DeploymentTransaction = {
    transactionId,
    state: 'prepared',
    stagingKeys,
    files,
    reason,
    parentCommitSha,
    createdAt: new Date().toISOString(),
  };

  console.log('[DEPLOYMENT_TRANSACTION] CREATING_OR_MERGING', { transactionId, stagingKeysCount: stagingKeys.length, files });

  try {
    const result = await client.eval(
      CREATE_TRANSACTION_SCRIPT,
      [key],
      [JSON.stringify(transaction), JSON.stringify(stagingKeys)]
    );

    if (result && typeof result === 'object' && 'err' in result) {
      throw new Error(`Failed to create/merge transaction: ${normalizeRedisError((result as any).err)}`);
    }

    // If transaction was created fresh
    if (result && typeof result === 'object' && 'ok' in result && (result as any).ok === 'CREATED') {
      console.log('[DEPLOYMENT_TRANSACTION] CREATED', { transactionId, stagingKeysCount: stagingKeys.length });
      return transaction;
    }

    // If transaction already existed and staging keys were merged
    if (result && typeof result === 'object' && 'ok' in result && (result as any).ok === 'MERGED') {
      const merged = JSON.parse((result as any).data) as DeploymentTransaction;
      const stagingKeysCount = (result as any).stagingKeysCount;
      console.log('[DEPLOYMENT_TRANSACTION] MERGED_STAGING_KEYS', {
        transactionId,
        state: merged.state,
        totalStagingKeys: stagingKeysCount,
        newKeysAdded: stagingKeys.length
      });
      return merged;
    }

    // Fallback for legacy 'EXISTS' behavior (should not occur with new script)
    if (result && typeof result === 'object' && 'ok' in result && (result as any).ok === 'EXISTS') {
      const existing = JSON.parse((result as any).data) as DeploymentTransaction;
      console.log('[DEPLOYMENT_TRANSACTION] RETURNED_EXISTING', { transactionId, state: existing.state });
      return existing;
    }

    console.log('[DEPLOYMENT_TRANSACTION] CREATED', { transactionId });
    return transaction;
  } catch (error) {
    console.error('[DEPLOYMENT_TRANSACTION] CREATE_OR_MERGE_FAILED', { transactionId, error });
    throw error;
  }
}

/**
 * Claim a transaction for deployment (prepared → committing)
 * @param transactionId - Transaction ID
 * @param owner - Claim token (e.g., session ID or request ID)
 * @returns Updated transaction
 */
export async function claimDeploymentTransaction(
  transactionId: string,
  owner: string
): Promise<DeploymentTransaction> {
  const key = getTransactionKey(transactionId);
  const client = getRedisClient();
  
  console.log('[DEPLOYMENT_TRANSACTION] CLAIMING', { transactionId, owner });
  
  try {
    const current = await client.get<DeploymentTransaction>(key);
    if (!current) {
      throw new Error(`Transaction not found: ${transactionId}. Use createDeploymentTransaction first.`);
    }
    
    const updated: DeploymentTransaction = {
      ...current,
      state: 'committing',
      owner,
      claimedAt: new Date().toISOString(),
    };
    
    const result = await client.eval(
      STATE_TRANSITION_SCRIPT,
      [key],
      [
        transactionId,
        'committing',
        owner,
        current.parentCommitSha || '',
        JSON.stringify(updated),
      ]
    );
    
    if (result && typeof result === 'object' && 'err' in result) {
      const err = (result as any).err;
      if (err.includes('ALREADY_CLAIMED')) {
        throw new Error(`Transaction already claimed by another process: ${transactionId}`);
      }
      if (err.includes('TRANSACTION_NOT_FOUND')) {
        throw new Error(`Transaction not found: ${transactionId}. Use createDeploymentTransaction first.`);
      }
      throw new Error(`Failed to claim transaction: ${normalizeRedisError(err)}`);
    }
    
    console.log('[DEPLOYMENT_TRANSACTION] CLAIMED', { transactionId, owner });
    return updated;
  } catch (error) {
    console.error('[DEPLOYMENT_TRANSACTION] CLAIM_FAILED', { transactionId, owner, error });
    throw error;
  }
}

/**
 * P0 FIX: Persist Git commit SHA BEFORE Redis promotion
 * This enables Git/Redis split-brain recovery: if Redis promotion fails,
 * the transaction already has commitSha and can retry Redis promotion
 * against the same Git commit without creating a new commit.
 * 
 * This is an idempotent update within the committing state.
 * @param transactionId - Transaction ID
 * @param commitSha - Git commit SHA
 * @param commitUrl - Git commit URL
 * @param owner - Transaction owner (for ownership verification)
 * @returns Updated transaction with commitSha persisted
 */
export async function setGitCommitSha(
  transactionId: string,
  commitSha: string,
  commitUrl: string,
  owner?: string
): Promise<DeploymentTransaction> {
  const key = getTransactionKey(transactionId);
  const client = getRedisClient();
  
  console.log('[DEPLOYMENT_TRANSACTION] PERSISTING_COMMIT_SHA', { transactionId, commitSha, owner });
  
  try {
    const current = await client.get<DeploymentTransaction>(key);
    if (!current) {
      throw new Error(`Transaction not found: ${transactionId}. Use createDeploymentTransaction first.`);
    }
    
    // Must be in committing state to persist commitSha
    if (current.state !== 'committing') {
      throw new Error(`Transaction must be in committing state to persist commitSha. Current state: ${current.state}`);
    }
    
    // Use current owner if not provided (for backward compatibility)
    const effectiveOwner = owner || current.owner;
    
    const updated: DeploymentTransaction = {
      ...current,
      commitSha,
      commitUrl,
      // Remain in committing state - transition to committed happens after Redis promotion
    };
    
    const result = await client.eval(
      STATE_TRANSITION_SCRIPT,
      [key],
      [
        transactionId,
        'committing', // Remain in committing state
        effectiveOwner || '',
        current.parentCommitSha || '',
        JSON.stringify(updated),
      ]
    );
    
    if (result && typeof result === 'object' && 'err' in result) {
      const err = (result as any).err;
      if (err.includes('OWNER_MISMATCH')) {
        throw new Error(`Ownership verification failed: ${normalizeRedisError(err)}`);
      }
      if (err.includes('TRANSACTION_NOT_FOUND')) {
        throw new Error(`Transaction not found: ${transactionId}. Use createDeploymentTransaction first.`);
      }
      if (err.includes('ILLEGAL_TRANSITION')) {
        throw new Error(`Invalid state transition: ${normalizeRedisError(err)}`);
      }
      throw new Error(`Failed to persist commitSha: ${normalizeRedisError(err)}`);
    }
    
    console.log('[DEPLOYMENT_TRANSACTION] COMMIT_SHA_PERSISTED', { transactionId, commitSha });
    return updated;
  } catch (error) {
    console.error('[DEPLOYMENT_TRANSACTION] PERSIST_COMMIT_SHA_FAILED', { transactionId, error });
    throw error;
  }
}

/**
 * Mark transaction as committed (committing → committed)
 * commitSha must already be set via setGitCommitSha()
 * @param transactionId - Transaction ID
 * @param owner - Owner token for ownership verification
 * @returns Updated transaction
 */
export async function commitDeploymentTransaction(
  transactionId: string,
  owner?: string
): Promise<DeploymentTransaction> {
  const key = getTransactionKey(transactionId);
  const client = getRedisClient();
  
  console.log('[DEPLOYMENT_TRANSACTION] COMMITTING', { transactionId, owner });
  
  try {
    const current = await client.get<DeploymentTransaction>(key);
    if (!current) {
      throw new Error(`Transaction not found: ${transactionId}. Use createDeploymentTransaction first.`);
    }
    
    // P0 FIX: commitSha must already be set via setGitCommitSha()
    if (!current.commitSha) {
      throw new Error(`Transaction must have commitSha set before committing. Call setGitCommitSha() first.`);
    }
    
    // Use current owner if not provided (for backward compatibility)
    const effectiveOwner = owner || current.owner;
    
    const updated: DeploymentTransaction = {
      ...current,
      state: 'committed',
      committedAt: new Date().toISOString(),
      // commitSha and commitUrl are already set
    };
    
    const result = await client.eval(
      STATE_TRANSITION_SCRIPT,
      [key],
      [
        transactionId,
        'committed',
        effectiveOwner || '',
        current.parentCommitSha || '',
        JSON.stringify(updated),
      ]
    );
    
    if (result && typeof result === 'object' && 'err' in result) {
      const err = (result as any).err;
      if (err.includes('OWNER_MISMATCH')) {
        throw new Error(`Ownership verification failed: ${normalizeRedisError(err)}`);
      }
      if (err.includes('TRANSACTION_NOT_FOUND')) {
        throw new Error(`Transaction not found: ${transactionId}. Use createDeploymentTransaction first.`);
      }
      if (err.includes('ILLEGAL_TRANSITION')) {
        throw new Error(`Invalid state transition: ${normalizeRedisError(err)}`);
      }
      if (err.includes('MISSING_COMMIT_SHA')) {
        throw new Error(`commitSha must be set before committing: ${normalizeRedisError(err)}`);
      }
      throw new Error(`Failed to commit transaction: ${normalizeRedisError(err)}`);
    }
    
    console.log('[DEPLOYMENT_TRANSACTION] COMMITTED', { transactionId, commitSha: current.commitSha, owner: effectiveOwner });
    return updated;
  } catch (error) {
    console.error('[DEPLOYMENT_TRANSACTION] COMMIT_FAILED', { transactionId, error });
    throw error;
  }
}

/**
 * Mark transaction as consumed after staging cleanup (committed → consumed)
 * @param transactionId - Transaction ID
 * @param owner - Owner token for ownership verification
 * @returns Updated transaction
 */
export async function consumeDeploymentTransaction(
  transactionId: string,
  owner?: string
): Promise<DeploymentTransaction> {
  const key = getTransactionKey(transactionId);
  const client = getRedisClient();
  
  console.log('[DEPLOYMENT_TRANSACTION] CONSUMING', { transactionId, owner });
  
  try {
    const current = await client.get<DeploymentTransaction>(key);
    if (!current) {
      throw new Error(`Transaction not found: ${transactionId}. Use createDeploymentTransaction first.`);
    }
    
    // Use current owner if not provided (for backward compatibility)
    const effectiveOwner = owner || current.owner;
    
    const updated: DeploymentTransaction = {
      ...current,
      state: 'consumed',
      consumedAt: new Date().toISOString(),
    };
    
    const result = await client.eval(
      STATE_TRANSITION_SCRIPT,
      [key],
      [
        transactionId,
        'consumed',
        effectiveOwner || '',
        current.parentCommitSha || '',
        JSON.stringify(updated),
      ]
    );
    
    if (result && typeof result === 'object' && 'err' in result) {
      const err = (result as any).err;
      if (err.includes('OWNER_MISMATCH')) {
        throw new Error(`Ownership verification failed: ${normalizeRedisError(err)}`);
      }
      if (err.includes('TRANSACTION_NOT_FOUND')) {
        throw new Error(`Transaction not found: ${transactionId}. Use createDeploymentTransaction first.`);
      }
      throw new Error(`Failed to consume transaction: ${normalizeRedisError(err)}`);
    }
    
    console.log('[DEPLOYMENT_TRANSACTION] CONSUMED', { transactionId, owner: effectiveOwner });
    return updated;
  } catch (error) {
    console.error('[DEPLOYMENT_TRANSACTION] CONSUME_FAILED', { transactionId, error });
    throw error;
  }
}

/**
 * Mark transaction as failed (committing → failed)
 * @param transactionId - Transaction ID
 * @param failureReason - Reason for failure
 * @returns Updated transaction
 */
export async function failDeploymentTransaction(
  transactionId: string,
  failureReason: string
): Promise<DeploymentTransaction> {
  const key = getTransactionKey(transactionId);
  const client = getRedisClient();
  
  console.log('[DEPLOYMENT_TRANSACTION] FAILING', { transactionId, failureReason });
  
  try {
    const current = await client.get<DeploymentTransaction>(key);
    if (!current) {
      console.warn('[DEPLOYMENT_TRANSACTION] FAIL_TRANSACTION_NOT_FOUND', { transactionId, failureReason });
      // If transaction doesn't exist, we can't fail it - this is acceptable for cleanup scenarios
      throw new Error(`Transaction not found: ${transactionId}. Cannot fail non-existent transaction.`);
    }
    
    // P0 FIX: Let Lua script be the single authoritative increment point for retryCount
    // The STATE_TRANSITION_SCRIPT increments retryCount for committing → failed
    // Do NOT increment here to avoid double increment
    const updated: DeploymentTransaction = {
      ...current,
      state: 'failed',
      failureReason,
      failedAt: new Date().toISOString(),
    };
    
    const result = await client.eval(
      STATE_TRANSITION_SCRIPT,
      [key],
      [
        transactionId,
        'failed',
        current.owner || '',
        current.parentCommitSha || '',
        JSON.stringify(updated),
      ]
    );
    
    if (result && typeof result === 'object' && 'err' in result) {
      const err = (result as any).err;
      if (err.includes('TRANSACTION_NOT_FOUND')) {
        throw new Error(`Transaction not found: ${transactionId}. Use createDeploymentTransaction first.`);
      }
      throw new Error(`Failed to fail transaction: ${normalizeRedisError(err)}`);
    }
    
    // P0 FIX: Read back transaction to get actual Lua-incremented retryCount
    // Lua script increments retryCount, so we must read it back from Redis
    const finalTransaction = await client.get<DeploymentTransaction>(key);
    console.log('[DEPLOYMENT_TRANSACTION] FAILED', { transactionId, failureReason, retryCount: finalTransaction?.retryCount });
    return finalTransaction || updated;
  } catch (error) {
    console.error('[DEPLOYMENT_TRANSACTION] FAIL_OPERATION_FAILED', { transactionId, error });
    throw error;
  }
}

/**
 * Retry a failed transaction (failed → prepared)
 * Allows recovery from Git/Redis split-brain failures
 * @param transactionId - Transaction ID
 * @returns Updated transaction in prepared state
 */
export async function retryDeploymentTransaction(transactionId: string): Promise<DeploymentTransaction> {
  const key = getTransactionKey(transactionId);
  const client = getRedisClient();

  console.log('[DEPLOYMENT_TRANSACTION] RETRYING', { transactionId });

  try {
    let current = await client.get<DeploymentTransaction>(key);
    if (!current) {
      throw new Error(`Transaction not found: ${transactionId}. Cannot retry non-existent transaction.`);
    }
    
    // P0 FIX: Add crash recovery for stale committing transactions
    // If a transaction has been in committing state for too long (> 5 minutes),
    // it likely crashed after promotion but before Git commit
    const COMMITTING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    if (current.state === 'committing') {
      const claimedAt = current.claimedAt ? new Date(current.claimedAt).getTime() : 0;
      const now = Date.now();
      const timeInCommitting = now - claimedAt;
      
      if (timeInCommitting > COMMITTING_TIMEOUT_MS) {
        console.warn('[DEPLOYMENT_TRANSACTION] STALE_COMMITTING_TRANSACTION_DETECTED', {
          transactionId,
          timeInCommitting,
          claimedAt: current.claimedAt,
          owner: current.owner,
        });
        
        // P0 FIX: Fail stale committing transactions to allow recovery
        // This prevents permanent wedging from crashes after promotion
        const failed: DeploymentTransaction = {
          ...current,
          state: 'failed',
          failedAt: new Date().toISOString(),
          failureReason: 'STALE_COMMITTING_TIMEOUT: Transaction in committing state for too long, likely crashed after promotion',
        };
        
        await client.set(key, failed);
        console.log('[DEPLOYMENT_TRANSACTION] STALE_COMMITTING_FAILED', { transactionId });

        // P0 FIX: Re-read transaction from Redis to get authoritative state after transition
        // The in-memory 'current' object is stale after we write the failed state
        current = await client.get<DeploymentTransaction>(key);
        if (!current) {
          throw new Error(`Transaction disappeared after stale committing recovery: ${transactionId}`);
        }

        // Continue to retry path now that it's in failed state
      } else {
        throw new Error(`Transaction is in committing state but not yet timed out (${timeInCommitting}ms < ${COMMITTING_TIMEOUT_MS}ms). Cannot retry actively committing transaction.`);
      }
    }

    // Check if retry is allowed
    if (current.state !== 'failed') {
      throw new Error(`Transaction must be in failed state to retry. Current state: ${current.state}`);
    }
    
    // Check if max retries exceeded
    const MAX_RETRIES = 3;
    if ((current.retryCount || 0) >= MAX_RETRIES) {
      throw new Error(`Transaction has exceeded maximum retry count (${MAX_RETRIES}). Terminal failure.`);
    }
    
    // Reset to prepared state, preserving all other fields
    // P0 FIX: Lua script now handles retryCount increment for failed → prepared
    // Do NOT increment here to avoid double increment
    const updated: DeploymentTransaction = {
      ...current,
      state: 'prepared',
      owner: undefined, // Clear owner so deploy can claim it again
      failureReason: undefined, // Clear previous failure reason
      failedAt: undefined,
    };
    
    const result = await client.eval(
      STATE_TRANSITION_SCRIPT,
      [key],
      [
        transactionId,
        'prepared',
        '', // No owner for prepared state
        current.parentCommitSha || '',
        JSON.stringify(updated),
      ]
    );
    
    if (result && typeof result === 'object' && 'err' in result) {
      const err = (result as any).err;
      if (err.includes('ILLEGAL_TRANSITION')) {
        throw new Error(`Cannot retry transaction: ${normalizeRedisError(err)}`);
      }
      throw new Error(`Failed to retry transaction: ${normalizeRedisError(err)}`);
    }
    
    // P0 FIX: Read back transaction to get actual Lua-incremented retryCount
    // Lua script increments retryCount for failed → prepared
    const finalTransaction = await client.get<DeploymentTransaction>(key);
    console.log('[DEPLOYMENT_TRANSACTION] RETRIED', { 
      transactionId, 
      retryCount: finalTransaction?.retryCount,
      stagingKeysCount: finalTransaction?.stagingKeys.length 
    });
    return finalTransaction || updated;
  } catch (error) {
    console.error('[DEPLOYMENT_TRANSACTION] RETRY_FAILED', { transactionId, error });
    throw error;
  }
}

/**
 * Get deployment transaction by ID (idempotent read)
 * @param transactionId - Transaction ID
 * @returns Transaction or null
 */
export async function getDeploymentTransaction(transactionId: string): Promise<DeploymentTransaction | null> {
  const key = getTransactionKey(transactionId);
  const client = getRedisClient();
  
  try {
    const transaction = await client.get<DeploymentTransaction>(key);
    return transaction;
  } catch (error) {
    console.error('[DEPLOYMENT_TRANSACTION] GET_FAILED', { transactionId, error });
    throw error;
  }
}

/**
 * Check if transaction is in a terminal state (committed, consumed, or failed with max retries)
 * @param transactionId - Transaction ID
 * @returns True if terminal
 */
export async function isTransactionTerminal(transactionId: string): Promise<boolean> {
  const transaction = await getDeploymentTransaction(transactionId);
  if (!transaction) return false;
  
  if (transaction.state === 'committed' || transaction.state === 'consumed') {
    return true;
  }
  
  if (transaction.state === 'failed' && (transaction.retryCount || 0) >= 3) {
    return true;
  }
  
  return false;
}

/**
 * Clean up old transactions (maintenance operation)
 * @param olderThanHours - Delete transactions older than this many hours
 * @returns Count of deleted transactions
 */
export async function cleanupOldTransactions(olderThanHours: number = 24): Promise<number> {
  const client = getRedisClient();
  const keys: string[] = [];
  let cursor = '0';
  
  do {
    const namespace = getKvNamespace();
    const result = await client.scan(cursor, { match: `${namespace}${TRANSACTION_PREFIX}*`, count: 100 });
    cursor = result[0];
    keys.push(...result[1]);
  } while (cursor !== '0');
  
  const cutoff = Date.now() - (olderThanHours * 60 * 60 * 1000);
  let deletedCount = 0;
  
  for (const key of keys) {
    try {
      const transaction = await client.get<DeploymentTransaction>(key);
      if (!transaction) continue;
      
      const createdAt = new Date(transaction.createdAt).getTime();
      if (createdAt < cutoff && (transaction.state === 'consumed' || transaction.state === 'failed')) {
        await client.del(key);
        deletedCount++;
      }
    } catch (error) {
      console.error('[DEPLOYMENT_TRANSACTION] CLEANUP_ERROR', { key, error });
    }
  }
  
  console.log('[DEPLOYMENT_TRANSACTION] CLEANUP_COMPLETE', { deletedCount, cutoff });
  return deletedCount;
}
