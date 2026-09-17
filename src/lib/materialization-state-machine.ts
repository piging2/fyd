/**
 * Materialization State Machine
 * 
 * P1-7: Implements state machine for materialization lifecycle
 * DriveReference → materializing → PublishedMediaAsset
 * 
 * Valid transitions:
 * - source_reference → published (materialization)
 * - published → published (upgrade)
 * 
 * Invalid transitions (blocked):
 * - published → source_reference (downgrade)
 * - source_reference → source_reference (in-place upgrade)
 * 
 * Atomic transitions: Either complete fully or roll back
 */

import type { Media } from '@/types/media';

export type MediaLifecycleState = 'source_reference' | 'materializing' | 'published' | 'stale';

export interface StateTransition {
  from: MediaLifecycleState;
  to: MediaLifecycleState;
  operation: 'materialize' | 'upgrade' | 'reconcile' | 'mark_stale';
}

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
  requiresRollback?: boolean;
}

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: StateTransition[] = [
  { from: 'source_reference', to: 'published', operation: 'materialize' },
  { from: 'published', to: 'published', operation: 'upgrade' },
  { from: 'published', to: 'stale', operation: 'mark_stale' },
  { from: 'stale', to: 'published', operation: 'reconcile' },
];

/**
 * Invalid state transitions (blocked)
 */
const INVALID_TRANSITIONS: StateTransition[] = [
  { from: 'published', to: 'source_reference', operation: 'materialize' }, // downgrade
  { from: 'source_reference', to: 'source_reference', operation: 'upgrade' }, // in-place upgrade
  { from: 'materializing', to: 'source_reference', operation: 'materialize' }, // rollback during materialization
];

/**
 * Check if state transition is valid
 */
export function isValidTransition(
  currentState: MediaLifecycleState,
  targetState: MediaLifecycleState,
  operation: StateTransition['operation']
): TransitionResult {
  // Check if transition is in valid list
  const validTransition = VALID_TRANSITIONS.find(
    t => t.from === currentState && t.to === targetState && t.operation === operation
  );
  
  if (validTransition) {
    return { allowed: true };
  }
  
  // Check if transition is in invalid list
  const invalidTransition = INVALID_TRANSITIONS.find(
    t => t.from === currentState && t.to === targetState && t.operation === operation
  );
  
  if (invalidTransition) {
    return {
      allowed: false,
      reason: `Invalid transition: ${currentState} → ${targetState} via ${operation}`,
      requiresRollback: true,
    };
  }
  
  // Unknown transition - fail closed
  return {
    allowed: false,
    reason: `Unknown transition: ${currentState} → ${targetState} via ${operation}`,
    requiresRollback: true,
  };
}

/**
 * Apply state transition to media record
 * Returns updated media record if transition is valid
 */
export function applyStateTransition(
  media: Media,
  targetState: MediaLifecycleState,
  operation: StateTransition['operation']
): Media | null {
  const transition = isValidTransition(media.lifecycleState as MediaLifecycleState, targetState, operation);
  
  if (!transition.allowed) {
    console.error('[STATE_MACHINE] TRANSITION_BLOCKED', {
      mediaId: media.id,
      currentState: media.lifecycleState,
      targetState,
      operation,
      reason: transition.reason,
    });
    return null;
  }
  
  // Apply transition
  const updatedMedia: Media = {
    ...media,
    lifecycleState: targetState,
    updatedAt: new Date().toISOString(),
  };
  
  console.log('[STATE_MACHINE] TRANSITION_APPLIED', {
    mediaId: media.id,
    from: media.lifecycleState,
    to: targetState,
    operation,
  });
  
  return updatedMedia;
}

/**
 * Get valid next states for current state
 */
export function getValidNextStates(currentState: MediaLifecycleState): StateTransition[] {
  return VALID_TRANSITIONS.filter(t => t.from === currentState);
}

/**
 * Check if media is in final state (no further transitions needed)
 */
export function isFinalState(state: MediaLifecycleState): boolean {
  return state === 'published';
}

/**
 * Check if media is in transient state (may need recovery)
 */
export function isTransientState(state: MediaLifecycleState): boolean {
  return state === 'materializing';
}

/**
 * Check if media is in failed state (needs repair)
 */
export function isFailedState(state: MediaLifecycleState): boolean {
  return state === 'stale';
}