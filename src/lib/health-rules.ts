/**
 * Health Rules Configuration
 * 
 * Configurable thresholds for health scoring.
 * These rules determine when issues become warnings or critical errors.
 * 
 * Architecture: Rules → Validation → Findings → Metrics → Health Score
 */

export interface HealthRule {
  warning: number; // Threshold for warning (0-1 as percentage)
  critical: number; // Threshold for critical (0-1 as percentage)
}

export interface HealthRules {
  media: {
    missingVariants: HealthRule;
    missingAltText: HealthRule;
    missingThumbnail: HealthRule;
    missingBlurPlaceholder: HealthRule;
    orphanedMedia: HealthRule;
    invalidOrientation: HealthRule;
    brokenUrls: HealthRule;
  };
  projects: {
    missingHero: HealthRule;
    missingStory: HealthRule;
    missingLocation: HealthRule;
    missingSlug: HealthRule;
    missingSeoDescription: HealthRule;
    unusedProjects: HealthRule;
  };
  reviews: {
    missingRating: HealthRule;
    missingBody: HealthRule;
    missingProjectReference: HealthRule;
  };
  brand: {
    missingHomepageHero: HealthRule;
    missingOwnerPortrait: HealthRule;
  };
  crossReferences: {
    brokenMediaReferences: HealthRule;
    brokenProjectReferences: HealthRule;
    circularReferences: HealthRule;
  };
  coverage: {
    serviceCoverage: HealthRule;
    homepageCoverage: HealthRule;
    reviewCoverage: HealthRule;
    seoCoverage: HealthRule;
  };
}

/**
 * Default health rules
 * These can be overridden per platform via configuration
 */
export const defaultHealthRules: HealthRules = {
  media: {
    missingVariants: { warning: 0.10, critical: 0.30 }, // 10% warning, 30% critical
    missingAltText: { warning: 0.05, critical: 0.20 }, // 5% warning, 20% critical
    missingThumbnail: { warning: 0.15, critical: 0.40 },
    missingBlurPlaceholder: { warning: 0.20, critical: 0.50 },
    orphanedMedia: { warning: 0.10, critical: 0.25 },
    invalidOrientation: { warning: 0.05, critical: 0.15 },
    brokenUrls: { warning: 0.02, critical: 0.10 },
  },
  projects: {
    missingHero: { warning: 0.10, critical: 0.30 },
    missingStory: { warning: 0.15, critical: 0.40 },
    missingLocation: { warning: 0.05, critical: 0.15 },
    missingSlug: { warning: 0.10, critical: 0.25 },
    missingSeoDescription: { warning: 0.20, critical: 0.50 },
    unusedProjects: { warning: 0.10, critical: 0.25 },
  },
  reviews: {
    missingRating: { warning: 0.05, critical: 0.15 },
    missingBody: { warning: 0.05, critical: 0.15 },
    missingProjectReference: { warning: 0.10, critical: 0.25 },
  },
  brand: {
    missingHomepageHero: { warning: 0, critical: 0 }, // Always critical if missing
    missingOwnerPortrait: { warning: 0, critical: 0 }, // Always critical if missing
  },
  crossReferences: {
    brokenMediaReferences: { warning: 0.05, critical: 0.15 },
    brokenProjectReferences: { warning: 0.05, critical: 0.15 },
    circularReferences: { warning: 0.01, critical: 0.05 },
  },
  coverage: {
    serviceCoverage: { warning: 0.20, critical: 0.40 }, // 80% coverage warning, 60% critical
    homepageCoverage: { warning: 0, critical: 0 }, // Always critical if missing
    reviewCoverage: { warning: 0.30, critical: 0.50 }, // 70% coverage warning, 50% critical
    seoCoverage: { warning: 0.20, critical: 0.40 }, // 80% coverage warning, 60% critical
  },
};

/**
 * Load health rules from configuration
 * Falls back to default rules if not configured
 */
export function loadHealthRules(): HealthRules {
  // In production, this would load from platform config
  // For now, return default rules
  return defaultHealthRules;
}

/**
 * Check if a violation exceeds threshold
 */
export function checkThreshold(
  violationCount: number,
  totalCount: number,
  rule: HealthRule
): "none" | "warning" | "critical" {
  if (totalCount === 0) return "none";
  
  const percentage = violationCount / totalCount;
  
  if (percentage >= rule.critical) return "critical";
  if (percentage >= rule.warning) return "warning";
  return "none";
}
