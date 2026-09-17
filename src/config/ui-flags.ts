/**
 * Feature Flags Configuration
 * 
 * Centralized control for enabling/disabling experimental features.
 * All new features should be gated through these flags for easy rollback.
 * 
 * Usage:
 *   import { featureFlags } from '@/config/feature-flags';
 *   if (featureFlags.tapeMeasureProgress) { ... }
 */

export const featureFlags = {
  // Tier 1 - High Impact, Low Risk
  tapeMeasureProgress: false, // Tape measure scroll progress indicator
  pencilLayoutReveal: false, // Pencil mark section reveals
  magneticButtons: false, // Magnetic button interactions (4-8px)
  inertialSlider: false, // Before/After slider with 3-5 frame inertia
  projectImageHover: false, // Image lift, shadow deepening, caption slide

  // Tier 2 - Brand Differentiators
  blueprintOverlay: false, // Construction dimensions on project hover
  levelBubble: false, // Animated level bubble while scrolling
  sawKerfTransition: false, // Saw blade section divider
  woodGrainShift: false, // Subtle hero wood grain shift

  // Tier 3 - Interactions
  interactiveTimeline: false, // Progressively filling project schedule
  materialSelector: false, // Live material comparison tool
  weatherAwareCTA: false, // Weather-based CTA messaging
  scrollStorytelling: false, // Project story scroll progression

  // Tier 4 - Reviews (Highest Business Impact)
  reviewPipeline: false, // Automated review collection and categorization
  photoReviews: false, // Before/after photo reviews
  reviewHighlights: false, // Auto-extracted review badges
  neighborhoodMap: false, // Clustered reviews by city
  projectExplorer: false, // Structured project case studies with filters

  // Infrastructure - Performance
  speculationNavigation: false, // Speculation Rules API for instant-feeling navigation
} as const;

export type FeatureFlag = keyof typeof featureFlags;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return featureFlags[flag];
}

/**
 * Enable a feature (for testing/debugging)
 */
export function enableFeature(flag: FeatureFlag): void {
  (featureFlags as Record<FeatureFlag, boolean>)[flag] = true;
}

/**
 * Disable a feature (for rollback)
 */
export function disableFeature(flag: FeatureFlag): void {
  (featureFlags as Record<FeatureFlag, boolean>)[flag] = false;
}
