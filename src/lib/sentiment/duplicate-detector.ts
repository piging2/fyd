/**
 * Duplicate Detector - Stage 5 of Review Moderation Pipeline
 * 
 * Architecture: Review Submission → Normalizer → Metadata Extractor → Classification → Quality Score → Duplicate Detection → Moderation
 * 
 * This detector checks for duplicate reviews before a moderator sees them.
 * It never deletes automatically, only flags for human review.
 * 
 * Checks:
 * - Same email
 * - Same phone
 * - Same text
 * - 90% similar wording
 * - Same IP (if stored)
 * - Same Google review copied twice
 */

import type { Review } from "@/types/reviews";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateType: 'email' | 'phone' | 'text' | 'similar' | 'ip' | 'google_id' | 'none';
  confidence: number; // 0.00-1.00
  matchedReviewId?: string;
  matchDetails?: string;
}

export interface ReviewSubmission {
  email?: string;
  phone?: string;
  text: string;
  ip?: string;
  googleReviewId?: string;
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for similarity detection
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],
          dp[i][j - 1],
          dp[i - 1][j - 1]
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity ratio between two strings (0-1)
 * 1 = identical, 0 = completely different
 */
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1;
  return 1 - (distance / maxLength);
}

/**
 * Check for email duplicate
 */
function checkEmailDuplicate(
  email: string | undefined,
  existingReviews: Review[]
): DuplicateCheckResult {
  if (!email) return { isDuplicate: false, duplicateType: 'none', confidence: 0 };

  const match = existingReviews.find(review => {
    // Check if review has email metadata (stored in custom fields or notes)
    // For now, we'll check if the reviewer name matches and it's from the same provider
    // In a real implementation, you'd store email in the review metadata
    return false; // Placeholder - implement when email is stored
  });

  if (match) {
    return {
      isDuplicate: true,
      duplicateType: 'email',
      confidence: 0.95,
      matchedReviewId: match.id,
      matchDetails: `Same email as review ${match.id}`,
    };
  }

  return { isDuplicate: false, duplicateType: 'none', confidence: 0 };
}

/**
 * Check for phone duplicate
 */
function checkPhoneDuplicate(
  phone: string | undefined,
  existingReviews: Review[]
): DuplicateCheckResult {
  if (!phone) return { isDuplicate: false, duplicateType: 'none', confidence: 0 };

  const match = existingReviews.find(review => {
    // Check if review has phone metadata
    // For now, placeholder - implement when phone is stored
    return false;
  });

  if (match) {
    return {
      isDuplicate: true,
      duplicateType: 'phone',
      confidence: 0.95,
      matchedReviewId: match.id,
      matchDetails: `Same phone as review ${match.id}`,
    };
  }

  return { isDuplicate: false, duplicateType: 'none', confidence: 0 };
}

/**
 * Check for exact text duplicate
 */
function checkTextDuplicate(
  text: string,
  existingReviews: Review[]
): DuplicateCheckResult {
  const match = existingReviews.find(review => review.body === text);

  if (match) {
    return {
      isDuplicate: true,
      duplicateType: 'text',
      confidence: 1.0,
      matchedReviewId: match.id,
      matchDetails: `Exact text match with review ${match.id}`,
    };
  }

  return { isDuplicate: false, duplicateType: 'none', confidence: 0 };
}

/**
 * Check for similar wording (90% threshold)
 */
function checkSimilarDuplicate(
  text: string,
  existingReviews: Review[]
): DuplicateCheckResult {
  const SIMILARITY_THRESHOLD = 0.9;

  for (const review of existingReviews) {
    const similarity = calculateSimilarity(text, review.body);
    if (similarity >= SIMILARITY_THRESHOLD) {
      return {
        isDuplicate: true,
        duplicateType: 'similar',
        confidence: similarity,
        matchedReviewId: review.id,
        matchDetails: `${Math.round(similarity * 100)}% similar to review ${review.id}`,
      };
    }
  }

  return { isDuplicate: false, duplicateType: 'none', confidence: 0 };
}

/**
 * Check for IP duplicate
 */
function checkIPDuplicate(
  ip: string | undefined,
  existingReviews: Review[]
): DuplicateCheckResult {
  if (!ip) return { isDuplicate: false, duplicateType: 'none', confidence: 0 };

  const match = existingReviews.find(review => {
    // Check if review has IP metadata
    // For now, placeholder - implement when IP is stored
    return false;
  });

  if (match) {
    return {
      isDuplicate: true,
      duplicateType: 'ip',
      confidence: 0.85,
      matchedReviewId: match.id,
      matchDetails: `Same IP as review ${match.id}`,
    };
  }

  return { isDuplicate: false, duplicateType: 'none', confidence: 0 };
}

/**
 * Check for Google review ID duplicate
 */
function checkGoogleIdDuplicate(
  googleReviewId: string | undefined,
  existingReviews: Review[]
): DuplicateCheckResult {
  if (!googleReviewId) return { isDuplicate: false, duplicateType: 'none', confidence: 0 };

  const match = existingReviews.find(review => review.googleReviewId === googleReviewId);

  if (match) {
    return {
      isDuplicate: true,
      duplicateType: 'google_id',
      confidence: 1.0,
      matchedReviewId: match.id,
      matchDetails: `Same Google review ID as review ${match.id}`,
    };
  }

  return { isDuplicate: false, duplicateType: 'none', confidence: 0 };
}

/**
 * Run all duplicate checks
 * Returns the first duplicate found (highest priority)
 */
export function checkForDuplicates(
  submission: ReviewSubmission,
  existingReviews: Review[]
): DuplicateCheckResult {
  // Priority order: Google ID > exact text > email > phone > IP > similar

  // Check Google ID first (highest confidence)
  const googleIdCheck = checkGoogleIdDuplicate(submission.googleReviewId, existingReviews);
  if (googleIdCheck.isDuplicate) return googleIdCheck;

  // Check exact text
  const textCheck = checkTextDuplicate(submission.text, existingReviews);
  if (textCheck.isDuplicate) return textCheck;

  // Check email
  const emailCheck = checkEmailDuplicate(submission.email, existingReviews);
  if (emailCheck.isDuplicate) return emailCheck;

  // Check phone
  const phoneCheck = checkPhoneDuplicate(submission.phone, existingReviews);
  if (phoneCheck.isDuplicate) return phoneCheck;

  // Check IP
  const ipCheck = checkIPDuplicate(submission.ip, existingReviews);
  if (ipCheck.isDuplicate) return ipCheck;

  // Check similar wording (lowest priority)
  const similarCheck = checkSimilarDuplicate(submission.text, existingReviews);
  if (similarCheck.isDuplicate) return similarCheck;

  // No duplicates found
  return {
    isDuplicate: false,
    duplicateType: 'none',
    confidence: 0,
  };
}

/**
 * Quick duplicate check (returns only isDuplicate flag)
 * Use when you don't need the details
 */
export function quickDuplicateCheck(
  submission: ReviewSubmission,
  existingReviews: Review[]
): boolean {
  const result = checkForDuplicates(submission, existingReviews);
  return result.isDuplicate;
}
