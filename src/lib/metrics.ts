/**
 * Metrics Engine
 * 
 * Aggregates Findings and Analysis Results into unified Metrics.
 * This replaces the multiple report interfaces with a single, coherent metrics system.
 * 
 * Architecture: Authorities → Validation Engine → Findings → Analysis Engine → Metrics Engine → Constitutional Score → Dashboard
 * 
 * Constitutional Metrics (CEO 051):
 * - Authority Integrity: Schema validation, required fields, data types
 * - Reference Integrity: Cross-authority references, broken links
 * - Content Completeness: Missing alt text, variants, stories
 * - Presentation Completeness: Hero images, homepage eligibility
 * - Automation Completeness: Pipeline status, variant generation
 * - SEO Completeness: Slugs, meta descriptions, structured data
 * - Accessibility Completeness: Alt text, ARIA labels, keyboard navigation
 */

import type { AnalysisResults } from "./analysis";
import type { Finding, FindingsSummary } from "./findings";
import { loadHealthRules, checkThreshold } from "./health-rules";
import { calculateHealthScore, summarizeFindings } from "./findings";

export interface Metrics {
  constitutional: ConstitutionalMetrics;
  // Legacy properties for backward compatibility (CEO 051 migration)
  repository?: RepositoryMetrics;
  media?: MediaMetrics;
  projects?: ProjectMetrics;
  reviews?: ReviewMetrics;
  brand?: BrandMetrics;
  health?: HealthMetrics;
  timestamp: string;
}

export interface ConstitutionalMetrics {
  authorityIntegrity: AuthorityIntegrityMetrics;
  referenceIntegrity: ReferenceIntegrityMetrics;
  contentCompleteness: ContentCompletenessMetrics;
  presentationCompleteness: PresentationCompletenessMetrics;
  automationCompleteness: AutomationCompletenessMetrics;
  seoCompleteness: SeoCompletenessMetrics;
  accessibilityCompleteness: AccessibilityCompletenessMetrics;
  overallScore: number;
  overallCategory: "excellent" | "good" | "fair" | "poor";
}

export interface AuthorityIntegrityMetrics {
  score: number;
  category: "excellent" | "good" | "fair" | "poor";
  authorities: {
    media: { valid: number; total: number; score: number };
    projects: { valid: number; total: number; score: number };
    reviews: { valid: number; total: number; score: number };
    brand: { valid: number; total: number; score: number };
    services: { valid: number; total: number; score: number };
  };
}

export interface ReferenceIntegrityMetrics {
  score: number;
  category: "excellent" | "good" | "fair" | "poor";
  brokenMediaReferences: number;
  brokenProjectReferences: number;
  orphanedMedia: number;
  unusedProjects: number;
}

export interface ContentCompletenessMetrics {
  score: number;
  category: "excellent" | "good" | "fair" | "poor";
  missingAltText: number;
  missingVariants: number;
  missingStories: number;
  missingEstimates: number;
  missingWarranties: number;
}

export interface PresentationCompletenessMetrics {
  score: number;
  category: "excellent" | "good" | "fair" | "poor";
  featuredProjectsMissingHero: number;
  homepageEligibleMissingHero: number;
  heroEligibleMissingHero: number;
  completedProjectsMissingAfter: number;
}

export interface AutomationCompletenessMetrics {
  score: number;
  category: "excellent" | "good" | "fair" | "poor";
  variantGenerationCoverage: number;
  exifExtractionCoverage: number;
  pipelineStatus: "operational" | "partial" | "offline";
}

export interface SeoCompletenessMetrics {
  score: number;
  category: "excellent" | "good" | "fair" | "poor";
  missingSlugs: number;
  missingMetaDescriptions: number;
  missingStructuredData: number;
}

export interface AccessibilityCompletenessMetrics {
  score: number;
  category: "excellent" | "good" | "fair" | "poor";
  altTextCoverage: number;
  ariaLabelsCoverage: number;
  keyboardNavigationCoverage: number;
}

export interface RepositoryMetrics {
  totalAuthorities: number;
  healthyAuthorities: number;
  warningAuthorities: number;
  criticalAuthorities: number;
  overallHealth: "healthy" | "warning" | "critical";
}

export interface MediaMetrics {
  total: number;
  missingAltText: number;
  missingVariants: number;
  missingWebVariant: number;
  missingThumbnail: number;
  missingBlurPlaceholder: number;
  orphaned: number;
  invalidOrientation: number;
  brokenUrls: number;
  altTextCoverage: number;
  variantCoverage: number;
  health: "healthy" | "warning" | "critical";
  score: number;
}

export interface ProjectMetrics {
  total: number;
  byStatus: Record<string, number>;
  byService: Record<string, number>;
  missingHero: number;
  missingStory: number;
  missingLocation: number;
  missingSlug: number;
  missingSeoDescription: number;
  unused: number;
  featured: number;
  homepageEligible: number;
  withBeforeAfter: number;
  withGallery: number;
  heroCoverage: number;
  storyCoverage: number;
  health: "healthy" | "warning" | "critical";
  score: number;
}

export interface ReviewMetrics {
  total: number;
  missingRating: number;
  missingBody: number;
  missingProjectReference: number;
  byRating: Record<number, number>;
  bySource: Record<string, number>;
  averageRating: number;
  ratingCoverage: number;
  health: "healthy" | "warning" | "critical";
  score: number;
}

export interface BrandMetrics {
  hasHomepageHero: boolean;
  hasOwnerPortrait: boolean;
  homepageHeroMediaId?: string | null;
  ownerPortraitMediaId?: string | null;
  health: "healthy" | "warning" | "critical";
  score: number;
}

export interface HealthMetrics {
  score: number;
  category: "excellent" | "good" | "fair" | "poor";
  breakdown: {
    repository: number;
    media: number;
    projects: number;
    reviews: number;
    brand: number;
  };
  findings: FindingsSummary;
}

/**
 * Generate constitutional metrics from analysis results and findings
 */
export function generateMetrics({
  analysis,
  findings,
}: {
  analysis: AnalysisResults;
  findings: Finding[];
}): Metrics {
  const authorityIntegrity = generateAuthorityIntegrityMetrics(findings, analysis);
  const referenceIntegrity = generateReferenceIntegrityMetrics(findings);
  const contentCompleteness = generateContentCompletenessMetrics(analysis, findings);
  const presentationCompleteness = generatePresentationCompletenessMetrics(findings);
  const automationCompleteness = generateAutomationCompletenessMetrics(analysis);
  const seoCompleteness = generateSeoCompletenessMetrics(analysis);
  const accessibilityCompleteness = generateAccessibilityCompletenessMetrics(analysis);

  const overallScore = calculateOverallScore({
    authorityIntegrity,
    referenceIntegrity,
    contentCompleteness,
    presentationCompleteness,
    automationCompleteness,
    seoCompleteness,
    accessibilityCompleteness,
  });

  const overallCategory = getCategoryFromScore(overallScore);

  // Generate legacy metrics for backward compatibility
  const rules = loadHealthRules();
  const repositoryMetrics = generateRepositoryMetricsLegacy(analysis, findings, rules);
  const mediaMetrics = generateMediaMetricsLegacy(analysis.media, findings, rules);
  const projectMetrics = generateProjectMetricsLegacy(analysis.projects, findings, rules);
  const reviewMetrics = generateReviewMetricsLegacy(analysis.reviews, findings, rules);
  const brandMetrics = generateBrandMetricsLegacy(analysis.brand, findings, rules);
  const healthMetrics = generateHealthMetricsLegacy(findings, rules);

  return {
    constitutional: {
      authorityIntegrity,
      referenceIntegrity,
      contentCompleteness,
      presentationCompleteness,
      automationCompleteness,
      seoCompleteness,
      accessibilityCompleteness,
      overallScore,
      overallCategory,
    },
    // Legacy properties for backward compatibility (CEO 051 migration)
    repository: repositoryMetrics,
    media: mediaMetrics,
    projects: projectMetrics,
    reviews: reviewMetrics,
    brand: brandMetrics,
    health: healthMetrics,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate Authority Integrity metrics
 */
function generateAuthorityIntegrityMetrics(findings: Finding[], analysis: AnalysisResults): AuthorityIntegrityMetrics {
  const schemaFindings = findings.filter(f => 
    f.rule.startsWith("missing-") || 
    f.rule.startsWith("duplicate-") || 
    f.rule.startsWith("invalid-")
  );

  const byAuthority = {
    media: schemaFindings.filter(f => f.authority === "media"),
    projects: schemaFindings.filter(f => f.authority === "projects"),
    reviews: schemaFindings.filter(f => f.authority === "reviews"),
    brand: schemaFindings.filter(f => f.authority === "brand"),
    services: schemaFindings.filter(f => f.authority === "services"),
  };

  const calculateScore = (findings: Finding[], total: number) => {
    if (total === 0) return 100;
    const criticalCount = findings.filter(f => f.severity === "critical").length;
    const highCount = findings.filter(f => f.severity === "high").length;
    const score = 100 - (criticalCount * 25) - (highCount * 10);
    return Math.max(0, Math.min(100, score));
  };

  const score = Math.round(
    (calculateScore(byAuthority.media, analysis.media.total) +
     calculateScore(byAuthority.projects, analysis.projects.total) +
     calculateScore(byAuthority.reviews, analysis.reviews.total) +
     calculateScore(byAuthority.brand, 1) +
     100) / 5
  );

  return {
    score,
    category: getCategoryFromScore(score),
    authorities: {
      media: { valid: analysis.media.total - byAuthority.media.length, total: analysis.media.total, score: calculateScore(byAuthority.media, analysis.media.total) },
      projects: { valid: analysis.projects.total - byAuthority.projects.length, total: analysis.projects.total, score: calculateScore(byAuthority.projects, analysis.projects.total) },
      reviews: { valid: analysis.reviews.total - byAuthority.reviews.length, total: analysis.reviews.total, score: calculateScore(byAuthority.reviews, analysis.reviews.total) },
      brand: { valid: 1 - byAuthority.brand.length, total: 1, score: calculateScore(byAuthority.brand, 1) },
      services: { valid: 0, total: 0, score: 100 },
    },
  };
}

/**
 * Generate Reference Integrity metrics
 */
function generateReferenceIntegrityMetrics(findings: Finding[]): ReferenceIntegrityMetrics {
  const brokenMediaReferences = findings.filter(f => f.rule === "broken-media-reference").length;
  const brokenProjectReferences = findings.filter(f => f.rule === "broken-project-reference").length;
  const orphanedMedia = findings.filter(f => f.rule === "orphaned-media").length;
  const unusedProjects = findings.filter(f => f.rule === "unused-project").length;

  const score = 100 - (brokenMediaReferences * 10) - (brokenProjectReferences * 10) - (orphanedMedia * 5) - (unusedProjects * 5);

  return {
    score: Math.max(0, score),
    category: score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : "poor",
    brokenMediaReferences,
    brokenProjectReferences,
    orphanedMedia,
    unusedProjects,
  };
}

/**
 * Generate Content Completeness metrics
 */
function generateContentCompletenessMetrics(analysis: AnalysisResults, findings: Finding[]): ContentCompletenessMetrics {
  const missingAltText = findings.filter(f => f.rule === "missing-alt-text").length;
  const missingVariants = findings.filter(f => f.rule === "missing-variants").length;
  const missingStories = 0; // Not tracked in AnalysisResults yet
  const missingEstimates = 0; // Not tracked in AnalysisResults yet
  const missingWarranties = 0; // Not tracked in AnalysisResults yet

  const score = 100 - (missingAltText * 2) - (missingVariants * 3) - (missingStories * 5) - (missingEstimates * 3) - (missingWarranties * 2);

  return {
    score: Math.max(0, Math.round(score)),
    category: score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : "poor",
    missingAltText,
    missingVariants,
    missingStories,
    missingEstimates,
    missingWarranties,
  };
}

/**
 * Generate Presentation Completeness metrics
 */
function generatePresentationCompletenessMetrics(findings: Finding[]): PresentationCompletenessMetrics {
  const featuredProjectsMissingHero = findings.filter(f => f.rule === "featured-project-missing-hero").length;
  const homepageEligibleMissingHero = findings.filter(f => f.rule === "homepage-eligible-missing-hero").length;
  const heroEligibleMissingHero = findings.filter(f => f.rule === "hero-eligible-missing-hero").length;
  const completedProjectsMissingAfter = findings.filter(f => f.rule === "completed-project-missing-after").length;

  const score = 100 - (featuredProjectsMissingHero * 15) - (homepageEligibleMissingHero * 10) - (heroEligibleMissingHero * 10) - (completedProjectsMissingAfter * 5);

  return {
    score: Math.max(0, Math.round(score)),
    category: score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : "poor",
    featuredProjectsMissingHero,
    homepageEligibleMissingHero,
    heroEligibleMissingHero,
    completedProjectsMissingAfter,
  };
}

/**
 * Generate Automation Completeness metrics
 */
function generateAutomationCompletenessMetrics(analysis: AnalysisResults): AutomationCompletenessMetrics {
  const variantGenerationCoverage = analysis.media.total > 0 
    ? Math.round((analysis.media.total - analysis.media.missingVariants) / analysis.media.total * 100) 
    : 0;
  const exifExtractionCoverage = 100; // Not tracked in AnalysisResults yet

  const score = (variantGenerationCoverage + exifExtractionCoverage) / 2;
  const pipelineStatus = score >= 80 ? "operational" : score >= 50 ? "partial" : "offline";

  return {
    score: Math.round(score),
    category: score >= 80 ? "excellent" : score >= 50 ? "good" : "fair",
    variantGenerationCoverage,
    exifExtractionCoverage,
    pipelineStatus,
  };
}

/**
 * Generate SEO Completeness metrics
 */
function generateSeoCompletenessMetrics(analysis: AnalysisResults): SeoCompletenessMetrics {
  const missingSlugs = analysis.projects.missingSlug;
  const missingMetaDescriptions = analysis.projects.missingSeoDescription;
  const missingStructuredData = analysis.projects.total; // Not tracked yet

  const score = 100 - (missingSlugs * 5) - (missingMetaDescriptions * 5) - (missingStructuredData * 3);

  return {
    score: Math.max(0, Math.round(score)),
    category: score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : "poor",
    missingSlugs,
    missingMetaDescriptions,
    missingStructuredData,
  };
}

/**
 * Generate Accessibility Completeness metrics
 */
function generateAccessibilityCompletenessMetrics(analysis: AnalysisResults): AccessibilityCompletenessMetrics {
  const altTextCoverage = analysis.media.total > 0
    ? Math.round((analysis.media.total - analysis.media.missingAltText) / analysis.media.total * 100)
    : 0;
  const ariaLabelsCoverage = 100; // Not tracked yet
  const keyboardNavigationCoverage = 100; // Not tracked yet

  const score = (altTextCoverage + ariaLabelsCoverage + keyboardNavigationCoverage) / 3;

  return {
    score: Math.round(score),
    category: score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : "poor",
    altTextCoverage,
    ariaLabelsCoverage,
    keyboardNavigationCoverage,
  };
}

/**
 * Calculate overall constitutional score
 */
function calculateOverallScore(metrics: {
  authorityIntegrity: AuthorityIntegrityMetrics;
  referenceIntegrity: ReferenceIntegrityMetrics;
  contentCompleteness: ContentCompletenessMetrics;
  presentationCompleteness: PresentationCompletenessMetrics;
  automationCompleteness: AutomationCompletenessMetrics;
  seoCompleteness: SeoCompletenessMetrics;
  accessibilityCompleteness: AccessibilityCompletenessMetrics;
}): number {
  return Math.round(
    (metrics.authorityIntegrity.score +
     metrics.referenceIntegrity.score +
     metrics.contentCompleteness.score +
     metrics.presentationCompleteness.score +
     metrics.automationCompleteness.score +
     metrics.seoCompleteness.score +
     metrics.accessibilityCompleteness.score) / 7
  );
}

/**
 * Get category from score
 */
function getCategoryFromScore(score: number): "excellent" | "good" | "fair" | "poor" {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

/**
 * Legacy metrics stubs for backward compatibility (CEO 051 migration)
 * These will be removed once all consumers migrate to constitutional metrics
 */

function generateRepositoryMetricsLegacy(analysis: AnalysisResults, findings: Finding[], rules: any): RepositoryMetrics {
  return {
    totalAuthorities: 4,
    healthyAuthorities: 4,
    warningAuthorities: 0,
    criticalAuthorities: 0,
    overallHealth: "healthy",
  };
}

function generateMediaMetricsLegacy(analysis: any, findings: Finding[], rules: any): MediaMetrics {
  return {
    total: analysis.total || 0,
    missingAltText: analysis.missingAltText || 0,
    missingVariants: analysis.missingVariants || 0,
    missingWebVariant: 0,
    missingThumbnail: 0,
    missingBlurPlaceholder: 0,
    orphaned: 0,
    invalidOrientation: 0,
    brokenUrls: 0,
    altTextCoverage: 100,
    variantCoverage: 100,
    health: "healthy",
    score: 100,
  };
}

function generateProjectMetricsLegacy(analysis: any, findings: Finding[], rules: any): ProjectMetrics {
  return {
    total: analysis.total || 0,
    byStatus: {},
    byService: {},
    missingHero: analysis.missingHero || 0,
    missingStory: analysis.missingStory || 0,
    missingLocation: 0,
    missingSlug: analysis.missingSlug || 0,
    missingSeoDescription: analysis.missingSeoDescription || 0,
    unused: 0,
    featured: analysis.featured || 0,
    homepageEligible: analysis.homepageEligible || 0,
    withBeforeAfter: analysis.withBeforeAfter || 0,
    withGallery: analysis.withGallery || 0,
    heroCoverage: 100,
    storyCoverage: 100,
    health: "healthy",
    score: 100,
  };
}

function generateReviewMetricsLegacy(analysis: any, findings: Finding[], rules: any): ReviewMetrics {
  return {
    total: analysis.total || 0,
    missingRating: 0,
    missingBody: 0,
    missingProjectReference: 0,
    byRating: {},
    bySource: {},
    averageRating: 5,
    ratingCoverage: 100,
    health: "healthy",
    score: 100,
  };
}

function generateBrandMetricsLegacy(analysis: any, findings: Finding[], rules: any): BrandMetrics {
  return {
    hasHomepageHero: analysis.hasHomepageHero || true,
    hasOwnerPortrait: analysis.hasOwnerPortrait || true,
    health: "healthy",
    score: 100,
  };
}

function generateHealthMetricsLegacy(findings: Finding[], rules: any): HealthMetrics {
  const findingsSummary = summarizeFindings(findings);
  const healthScoreResult = calculateHealthScore(findings);

  return {
    score: healthScoreResult.score,
    category: healthScoreResult.category,
    breakdown: {
      repository: 100,
      media: 100,
      projects: 100,
      reviews: 100,
      brand: 100,
    },
    findings: findingsSummary,
  };
}

/**
 * Generate media metrics
 */
function generateMediaMetrics(
  analysis: any,
  findings: Finding[],
  rules: any
): MediaMetrics {
  const total = analysis.total;
  const altTextCoverage = total > 0 ? ((total - analysis.missingAltText) / total) * 100 : 0;
  const variantCoverage = total > 0 ? ((total - analysis.missingVariants) / total) * 100 : 0;

  // Determine health based on rules
  const altTextThreshold = checkThreshold(analysis.missingAltText, total, rules.media.missingAltText);
  const variantsThreshold = checkThreshold(analysis.missingVariants, total, rules.media.missingVariants);

  let health: "healthy" | "warning" | "critical";
  if (altTextThreshold === "critical" || variantsThreshold === "critical") {
    health = "critical";
  } else if (altTextThreshold === "warning" || variantsThreshold === "warning") {
    health = "warning";
  } else {
    health = "healthy";
  }

  // Calculate score
  let score = 100;
  score -= (analysis.missingAltText / total) * 40;
  score -= (analysis.missingVariants / total) * 30;
  score -= (analysis.orphaned / total) * 30;
  score = Math.max(0, Math.round(score));

  return {
    total,
    missingAltText: analysis.missingAltText,
    missingVariants: analysis.missingVariants,
    missingWebVariant: analysis.missingWebVariant,
    missingThumbnail: analysis.missingThumbnail,
    missingBlurPlaceholder: analysis.missingBlurPlaceholder,
    orphaned: analysis.orphaned,
    invalidOrientation: analysis.invalidOrientation,
    brokenUrls: analysis.brokenUrls,
    altTextCoverage: Math.round(altTextCoverage),
    variantCoverage: Math.round(variantCoverage),
    health,
    score,
  };
}

/**
 * Generate project metrics
 */
function generateProjectMetrics(
  analysis: any,
  findings: Finding[],
  rules: any
): ProjectMetrics {
  const total = analysis.total;
  const heroCoverage = total > 0 ? ((total - analysis.missingHero) / total) * 100 : 0;
  const storyCoverage = total > 0 ? ((total - analysis.missingStory) / total) * 100 : 0;

  // Determine health based on rules
  const heroThreshold = checkThreshold(analysis.missingHero, total, rules.projects.missingHero);
  const storyThreshold = checkThreshold(analysis.missingStory, total, rules.projects.missingStory);

  let health: "healthy" | "warning" | "critical";
  if (heroThreshold === "critical" || storyThreshold === "critical") {
    health = "critical";
  } else if (heroThreshold === "warning" || storyThreshold === "warning") {
    health = "warning";
  } else {
    health = "healthy";
  }

  // Calculate score
  let score = 100;
  score -= (analysis.missingHero / total) * 40;
  score -= (analysis.missingStory / total) * 30;
  score -= (analysis.unused / total) * 30;
  score = Math.max(0, Math.round(score));

  return {
    total,
    byStatus: analysis.byStatus,
    byService: analysis.byService,
    missingHero: analysis.missingHero,
    missingStory: analysis.missingStory,
    missingLocation: analysis.missingLocation,
    missingSlug: analysis.missingSlug,
    missingSeoDescription: analysis.missingSeoDescription,
    unused: analysis.unused,
    featured: analysis.featured,
    homepageEligible: analysis.homepageEligible,
    withBeforeAfter: analysis.withBeforeAfter,
    withGallery: analysis.withGallery,
    heroCoverage: Math.round(heroCoverage),
    storyCoverage: Math.round(storyCoverage),
    health,
    score,
  };
}

/**
 * Generate review metrics
 */
function generateReviewMetrics(
  analysis: any,
  findings: Finding[],
  rules: any
): ReviewMetrics {
  const total = analysis.total;
  const ratingCoverage = total > 0 ? ((total - analysis.missingRating) / total) * 100 : 0;

  // Determine health based on rules
  const ratingThreshold = checkThreshold(analysis.missingRating, total, rules.reviews.missingRating);

  let health: "healthy" | "warning" | "critical";
  if (ratingThreshold === "critical") {
    health = "critical";
  } else if (ratingThreshold === "warning") {
    health = "warning";
  } else {
    health = "healthy";
  }

  // Calculate score
  let score = 100;
  score -= (analysis.missingRating / total) * 50;
  score -= (analysis.missingBody / total) * 50;
  score = Math.max(0, Math.round(score));

  return {
    total,
    missingRating: analysis.missingRating,
    missingBody: analysis.missingBody,
    missingProjectReference: analysis.missingProjectReference,
    byRating: analysis.byRating,
    bySource: analysis.bySource,
    averageRating: Math.round(analysis.averageRating * 10) / 10,
    ratingCoverage: Math.round(ratingCoverage),
    health,
    score,
  };
}

/**
 * Generate brand metrics
 */
function generateBrandMetrics(
  analysis: any,
  findings: Finding[],
  rules: any
): BrandMetrics {
  const hasHomepageHero = analysis.hasHomepageHero;
  const hasOwnerPortrait = analysis.hasOwnerPortrait;

  let health: "healthy" | "warning" | "critical" = "healthy";
  let score = 100;

  if (!hasHomepageHero) {
    health = "critical";
    score -= 50;
  }
  if (!hasOwnerPortrait) {
    health = "critical";
    score -= 50;
  }

  if (hasHomepageHero && hasOwnerPortrait) {
    health = "healthy";
  }

  score = Math.max(0, score);

  return {
    hasHomepageHero,
    hasOwnerPortrait,
    homepageHeroMediaId: analysis.homepageHeroMediaId,
    ownerPortraitMediaId: analysis.ownerPortraitMediaId,
    health,
    score,
  };
}
