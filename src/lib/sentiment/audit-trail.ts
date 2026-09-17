/**
 * Audit Trail - Stage 12 of Review Moderation Pipeline
 * 
 * Architecture: Review Submission → Normalizer → Metadata Extractor → Classification → Quality Score → Duplicate Detection → Tag Suggestion → Service Suggestion → Project Suggestion → County Suggestion → Audit Trail → Moderation
 * 
 * This audit trail records every decision made during the review moderation process.
 * Never lose history. Every action is timestamped and attributed.
 */

export type AuditEventType =
  | 'submitted'
  | 'normalized'
  | 'classified'
  | 'quality_scored'
  | 'duplicate_checked'
  | 'tags_suggested'
  | 'service_suggested'
  | 'project_suggested'
  | 'county_suggested'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'archived'
  | 'edited'
  | 'owner_response_added'
  | 'owner_response_edited';

export interface AuditEvent {
  id: string;
  reviewId: string;
  eventType: AuditEventType;
  timestamp: string; // ISO timestamp
  actor: string; // 'system' or user ID
  data?: Record<string, any>; // Event-specific data
  notes?: string; // Optional notes
}

export interface AuditTrail {
  reviewId: string;
  events: AuditEvent[];
}

/**
 * Create an audit event
 */
function createAuditEvent(
  reviewId: string,
  eventType: AuditEventType,
  actor: string,
  data?: Record<string, any>,
  notes?: string
): AuditEvent {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    reviewId,
    eventType,
    timestamp: new Date().toISOString(),
    actor,
    data,
    notes,
  };
}

/**
 * Record submission event
 */
export function recordSubmission(reviewId: string, submitterName: string): AuditEvent {
  return createAuditEvent(
    reviewId,
    'submitted',
    'system',
    { submitterName },
    'Review submitted by customer'
  );
}

/**
 * Record normalization event
 */
export function recordNormalization(
  reviewId: string,
  originalText: string,
  normalizedText: string,
  changes: string[]
): AuditEvent {
  return createAuditEvent(
    reviewId,
    'normalized',
    'system',
    { originalText, normalizedText, changes },
    `Text normalized: ${changes.join(', ')}`
  );
}

/**
 * Record classification event
 */
export function recordClassification(
  reviewId: string,
  sentiment: string,
  bucket: string,
  confidence: number
): AuditEvent {
  return createAuditEvent(
    reviewId,
    'classified',
    'system',
    { sentiment, bucket, confidence },
    `Classified as ${sentiment} (${bucket} bucket, ${Math.round(confidence * 100)}% confidence)`
  );
}

/**
 * Record quality score event
 */
export function recordQualityScore(
  reviewId: string,
  score: number,
  breakdown: string[]
): AuditEvent {
  return createAuditEvent(
    reviewId,
    'quality_scored',
    'system',
    { score, breakdown },
    `Quality score: ${score}/100 (${breakdown.join(', ')})`
  );
}

/**
 * Record duplicate check event
 */
export function recordDuplicateCheck(
  reviewId: string,
  isDuplicate: boolean,
  duplicateType: string,
  matchedReviewId?: string
): AuditEvent {
  return createAuditEvent(
    reviewId,
    'duplicate_checked',
    'system',
    { isDuplicate, duplicateType, matchedReviewId },
    isDuplicate
      ? `Duplicate detected: ${duplicateType}${matchedReviewId ? ` (matches ${matchedReviewId})` : ''}`
      : 'No duplicates found'
  );
}

/**
 * Record tag suggestions event
 */
export function recordTagSuggestions(
  reviewId: string,
  suggestedTags: Array<{ tag: string; confidence: number }>
): AuditEvent {
  return createAuditEvent(
    reviewId,
    'tags_suggested',
    'system',
    { suggestedTags },
    `Suggested tags: ${suggestedTags.map(t => t.tag).join(', ')}`
  );
}

/**
 * Record service suggestion event
 */
export function recordServiceSuggestion(
  reviewId: string,
  serviceSlug: string,
  serviceName: string,
  confidence: number
): AuditEvent {
  return createAuditEvent(
    reviewId,
    'service_suggested',
    'system',
    { serviceSlug, serviceName, confidence },
    `Suggested service: ${serviceName} (${serviceSlug}, ${Math.round(confidence * 100)}% confidence)`
  );
}

/**
 * Record project suggestion event
 */
export function recordProjectSuggestion(
  reviewId: string,
  projectId: string,
  projectTitle: string,
  confidence: number
): AuditEvent {
  return createAuditEvent(
    reviewId,
    'project_suggested',
    'system',
    { projectId, projectTitle, confidence },
    `Suggested project: ${projectTitle} (${projectId}, ${Math.round(confidence * 100)}% confidence)`
  );
}

/**
 * Record county suggestion event
 */
export function recordCountySuggestion(
  reviewId: string,
  county: string,
  confidence: number
): AuditEvent {
  return createAuditEvent(
    reviewId,
    'county_suggested',
    'system',
    { county, confidence },
    `Suggested county: ${county} (${Math.round(confidence * 100)}% confidence)`
  );
}

/**
 * Record approval event
 */
export function recordApproval(
  reviewId: string,
  approver: string,
  notes?: string
): AuditEvent {
  return createAuditEvent(
    reviewId,
    'approved',
    approver,
    {},
    notes || 'Review approved by moderator'
  );
}

/**
 * Record rejection event
 */
export function recordRejection(
  reviewId: string,
  rejector: string,
  reason: string,
  notes?: string
): AuditEvent {
  return createAuditEvent(
    reviewId,
    'rejected',
    rejector,
    { reason },
    notes || `Review rejected: ${reason}`
  );
}

/**
 * Record publication event
 */
export function recordPublication(reviewId: string, publisher: string): AuditEvent {
  return createAuditEvent(
    reviewId,
    'published',
    publisher,
    {},
    'Review published to website'
  );
}

/**
 * Record archive event
 */
export function recordArchive(reviewId: string, archiver: string, reason?: string): AuditEvent {
  return createAuditEvent(
    reviewId,
    'archived',
    archiver,
    { reason },
    reason || 'Review archived'
  );
}

/**
 * Record edit event
 */
export function recordEdit(
  reviewId: string,
  editor: string,
  changes: Record<string, { from: any; to: any }>,
  notes?: string
): AuditEvent {
  return createAuditEvent(
    reviewId,
    'edited',
    editor,
    { changes },
    notes || `Review edited: ${Object.keys(changes).join(', ')}`
  );
}

/**
 * Record owner response added event
 */
export function recordOwnerResponseAdded(
  reviewId: string,
  author: string,
  body: string
): AuditEvent {
  return createAuditEvent(
    reviewId,
    'owner_response_added',
    author,
    { body },
    'Owner response added'
  );
}

/**
 * Record owner response edited event
 */
export function recordOwnerResponseEdited(
  reviewId: string,
  author: string,
  previousBody: string,
  newBody: string
): AuditEvent {
  return createAuditEvent(
    reviewId,
    'owner_response_edited',
    author,
    { previousBody, newBody },
    'Owner response edited'
  );
}

/**
 * Create a complete audit trail for a review
 * This is called when a review is first processed through the pipeline
 */
export function createInitialAuditTrail(
  reviewId: string,
  submitterName: string,
  normalizationResult: { original: string; normalized: string; changes: string[] },
  classificationResult: { sentiment: string; bucket: string; confidence: number },
  qualityScoreResult: { score: number; breakdown: string[] },
  duplicateCheckResult: { isDuplicate: boolean; duplicateType: string; matchedReviewId?: string },
  tagSuggestions: Array<{ tag: string; confidence: number }>,
  serviceSuggestion?: { serviceSlug: string; serviceName: string; confidence: number },
  projectSuggestion?: { projectId: string; projectTitle: string; confidence: number },
  countySuggestion?: { county: string; confidence: number }
): AuditTrail {
  const events: AuditEvent[] = [];

  // Record submission
  events.push(recordSubmission(reviewId, submitterName));

  // Record normalization
  events.push(recordNormalization(
    reviewId,
    normalizationResult.original,
    normalizationResult.normalized,
    normalizationResult.changes
  ));

  // Record classification
  events.push(recordClassification(
    reviewId,
    classificationResult.sentiment,
    classificationResult.bucket,
    classificationResult.confidence
  ));

  // Record quality score
  events.push(recordQualityScore(
    reviewId,
    qualityScoreResult.score,
    qualityScoreResult.breakdown
  ));

  // Record duplicate check
  events.push(recordDuplicateCheck(
    reviewId,
    duplicateCheckResult.isDuplicate,
    duplicateCheckResult.duplicateType,
    duplicateCheckResult.matchedReviewId
  ));

  // Record tag suggestions
  events.push(recordTagSuggestions(reviewId, tagSuggestions));

  // Record service suggestion
  if (serviceSuggestion) {
    events.push(recordServiceSuggestion(
      reviewId,
      serviceSuggestion.serviceSlug,
      serviceSuggestion.serviceName,
      serviceSuggestion.confidence
    ));
  }

  // Record project suggestion
  if (projectSuggestion) {
    events.push(recordProjectSuggestion(
      reviewId,
      projectSuggestion.projectId,
      projectSuggestion.projectTitle,
      projectSuggestion.confidence
    ));
  }

  // Record county suggestion
  if (countySuggestion) {
    events.push(recordCountySuggestion(
      reviewId,
      countySuggestion.county,
      countySuggestion.confidence
    ));
  }

  return {
    reviewId,
    events,
  };
}

/**
 * Add an event to an existing audit trail
 */
export function addAuditEvent(trail: AuditTrail, event: AuditEvent): AuditTrail {
  return {
    ...trail,
    events: [...trail.events, event],
  };
}

/**
 * Get audit trail for a review
 * (In production, this would fetch from storage)
 */
export function getAuditTrail(reviewId: string): AuditTrail | null {
  // Placeholder - implement when storage is ready
  return null;
}

/**
 * Save audit trail for a review
 * (In production, this would save to storage)
 */
export function saveAuditTrail(trail: AuditTrail): void {
  // Placeholder - implement when storage is ready
  console.log('Saving audit trail for review:', trail.reviewId);
}
