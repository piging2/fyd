/**
 * Quality Scorer - Stage 4 of Review Moderation Pipeline
 * 
 * Architecture: Review Submission → Normalizer → Metadata Extractor → Classification → Quality Score → Duplicate Detection → Moderation
 * 
 * This scorer measures review usefulness (NOT sentiment).
 * Quality score: 0-100, higher is more useful.
 * 
 * Factors:
 * - Length (longer reviews are generally more useful)
 * - Specificity (mentions specific details)
 * - Mentions project
 * - Mentions materials
 * - Mentions crew/employees
 * - Mentions communication
 * - Mentions timeline
 * - Mentions craftsmanship
 */

import { extractMetadata } from './metadata-extractor';

export interface QualityScoreResult {
  score: number; // 0-100
  factors: {
    length: number; // 0-100
    specificity: number; // 0-100
    mentions_project: number; // 0-100
    mentions_materials: number; // 0-100
    mentions_crew: number; // 0-100
    mentions_communication: number; // 0-100
    mentions_timeline: number; // 0-100
    mentions_craftsmanship: number; // 0-100
  };
  breakdown: string[];
}

/**
 * Calculate length score (0-100)
 * Longer reviews are generally more useful
 */
function calculateLengthScore(text: string): number {
  const length = text.length;
  if (length < 20) return 10; // Very short
  if (length < 50) return 30; // Short
  if (length < 100) return 60; // Medium
  if (length < 200) return 85; // Long
  if (length < 400) return 95; // Very long
  return 100; // Extremely long
}

/**
 * Calculate specificity score (0-100)
 * More specific details = higher score
 */
function calculateSpecificityScore(text: string, metadata: ReturnType<typeof extractMetadata>): number {
  let score = 0;
  
  // Check for specific details
  const hasNumbers = /\d+/.test(text); // Numbers indicate specifics
  const hasMeasurements = /\d+\s*(ft|feet|inches|in|sq\s*ft|square\s*feet)/gi.test(text);
  const hasDates = /\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}/.test(text);
  const hasColors = /\b(red|blue|green|brown|black|white|gray|grey|stain|paint|color)\b/gi.test(text);
  const hasLocations = metadata.mentions_location;
  const hasMaterials = metadata.mentions_material;
  const hasServices = metadata.mentions_service;
  
  if (hasNumbers) score += 15;
  if (hasMeasurements) score += 20;
  if (hasDates) score += 15;
  if (hasColors) score += 10;
  if (hasLocations) score += 15;
  if (hasMaterials) score += 15;
  if (hasServices) score += 10;
  
  return Math.min(100, score);
}

/**
 * Calculate project mention score (0-100)
 */
function calculateProjectMentionScore(metadata: ReturnType<typeof extractMetadata>): number {
  if (!metadata.mentions_project) return 0;
  
  // More specific project mentions = higher score
  let score = 50;
  if (metadata.detected_services.length > 0) score += 20;
  if (metadata.detected_materials.length > 0) score += 20;
  if (metadata.detected_locations.length > 0) score += 10;
  
  return Math.min(100, score);
}

/**
 * Calculate materials mention score (0-100)
 */
function calculateMaterialsMentionScore(metadata: ReturnType<typeof extractMetadata>): number {
  if (!metadata.mentions_material) return 0;
  
  const materialCount = metadata.detected_materials.length;
  if (materialCount === 0) return 0;
  if (materialCount === 1) return 60;
  if (materialCount === 2) return 80;
  return 100; // 3+ materials
}

/**
 * Calculate crew mention score (0-100)
 */
function calculateCrewMentionScore(metadata: ReturnType<typeof extractMetadata>): number {
  if (!metadata.mentions_employee) return 0;
  
  const employeeCount = metadata.detected_employees.length;
  if (employeeCount === 0) return 0;
  if (employeeCount === 1) return 70;
  return 100; // 2+ employees mentioned
}

/**
 * Calculate communication mention score (0-100)
 */
function calculateCommunicationMentionScore(text: string): number {
  const communicationKeywords = [
    'communication', 'communicate', 'responsive', 'responsive',
    'reply', 'replied', 'answered', 'answer', 'called', 'call',
    'email', 'emailed', 'text', 'texted', 'kept in touch',
    'updates', 'update', 'informed', 'inform', 'clear', 'helpful',
  ];
  
  const lower = text.toLowerCase();
  const matchCount = communicationKeywords.filter(keyword => lower.includes(keyword)).length;
  
  if (matchCount === 0) return 0;
  if (matchCount === 1) return 50;
  if (matchCount === 2) return 75;
  return 100; // 3+ communication keywords
}

/**
 * Calculate timeline mention score (0-100)
 */
function calculateTimelineMentionScore(text: string): number {
  const timelineKeywords = [
    'timeline', 'schedule', 'scheduled', 'on time', 'ontime', 'late',
    'delay', 'delayed', 'finished', 'completed', 'done', 'quick',
    'fast', 'slow', 'weeks', 'days', 'months', 'duration',
  ];
  
  const lower = text.toLowerCase();
  const matchCount = timelineKeywords.filter(keyword => lower.includes(keyword)).length;
  
  if (matchCount === 0) return 0;
  if (matchCount === 1) return 50;
  if (matchCount === 2) return 75;
  return 100; // 3+ timeline keywords
}

/**
 * Calculate craftsmanship mention score (0-100)
 */
function calculateCraftsmanshipMentionScore(text: string): number {
  const craftsmanshipKeywords = [
    'craftsmanship', 'craft', 'quality', 'detail', 'detailed',
    'professional', 'skill', 'skilled', 'expert', 'expertise',
    'work', 'workmanship', 'finish', 'finished', 'clean', 'neat',
    'precise', 'precision', 'care', 'careful', 'attention',
  ];
  
  const lower = text.toLowerCase();
  const matchCount = craftsmanshipKeywords.filter(keyword => lower.includes(keyword)).length;
  
  if (matchCount === 0) return 0;
  if (matchCount === 1) return 50;
  if (matchCount === 2) return 75;
  return 100; // 3+ craftsmanship keywords
}

/**
 * Calculate overall quality score (0-100)
 * Weighted average of all factors
 */
export function calculateQualityScore(text: string): QualityScoreResult {
  const metadata = extractMetadata(text);
  
  // Calculate individual factor scores
  const lengthScore = calculateLengthScore(text);
  const specificityScore = calculateSpecificityScore(text, metadata);
  const projectScore = calculateProjectMentionScore(metadata);
  const materialsScore = calculateMaterialsMentionScore(metadata);
  const crewScore = calculateCrewMentionScore(metadata);
  const communicationScore = calculateCommunicationMentionScore(text);
  const timelineScore = calculateTimelineMentionScore(text);
  const craftsmanshipScore = calculateCraftsmanshipMentionScore(text);
  
  // Weighted average (higher weights for more important factors)
  const weights = {
    length: 0.15,
    specificity: 0.20,
    mentions_project: 0.15,
    mentions_materials: 0.10,
    mentions_crew: 0.10,
    mentions_communication: 0.10,
    mentions_timeline: 0.10,
    mentions_craftsmanship: 0.10,
  };
  
  const overallScore = Math.round(
    lengthScore * weights.length +
    specificityScore * weights.specificity +
    projectScore * weights.mentions_project +
    materialsScore * weights.mentions_materials +
    crewScore * weights.mentions_crew +
    communicationScore * weights.mentions_communication +
    timelineScore * weights.mentions_timeline +
    craftsmanshipScore * weights.mentions_craftsmanship
  );
  
  // Generate breakdown for explainability
  const breakdown: string[] = [];
  if (lengthScore >= 80) breakdown.push('Good length');
  if (specificityScore >= 70) breakdown.push('Specific details');
  if (projectScore >= 70) breakdown.push('Project context');
  if (materialsScore >= 70) breakdown.push('Material details');
  if (crewScore >= 70) breakdown.push('Crew mentioned');
  if (communicationScore >= 70) breakdown.push('Communication feedback');
  if (timelineScore >= 70) breakdown.push('Timeline feedback');
  if (craftsmanshipScore >= 70) breakdown.push('Craftsmanship feedback');
  
  if (breakdown.length === 0) breakdown.push('Basic review');
  
  return {
    score: overallScore,
    factors: {
      length: lengthScore,
      specificity: specificityScore,
      mentions_project: projectScore,
      mentions_materials: materialsScore,
      mentions_crew: crewScore,
      mentions_communication: communicationScore,
      mentions_timeline: timelineScore,
      mentions_craftsmanship: craftsmanshipScore,
    },
    breakdown,
  };
}

/**
 * Quick quality score (returns only the score)
 * Use when you don't need the breakdown
 */
export function quickQualityScore(text: string): number {
  const result = calculateQualityScore(text);
  return result.score;
}
