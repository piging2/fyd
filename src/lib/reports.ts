/**
 * Authority Reporting System (Deprecated)
 * 
 * This file is deprecated in favor of the new Metrics Engine.
 * Use src/lib/metrics.ts instead.
 * 
 * Architecture: Authority → Validation Engine → Findings → Analysis Engine → Metrics Engine → Health Score
 * 
 * @deprecated Use generateMetrics() from src/lib/metrics.ts instead
 */

import type { MediaManifest } from "@/types/media";
import type { ProjectsManifest } from "@/types/projects";
import type { ReviewsManifest } from "@/types/reviews";
import type { BrandManifest } from "@/types/brand";
import { generateMetrics } from "./metrics";
import { validateAllAuthorities } from "./validation-engine";
import { analyzeAll } from "./analysis";

/**
 * Generate all reports (deprecated - use Metrics Engine instead)
 * 
 * @deprecated Use generateMetrics() from src/lib/metrics.ts
 */
export function generateAllReports({
  media,
  projects,
  reviews,
  brand
}: {
  media: MediaManifest;
  projects: ProjectsManifest;
  reviews: ReviewsManifest;
  brand: BrandManifest;
}) {
  // Use the new Metrics Engine
  const analysis = analyzeAll({ media, projects, reviews, brand });
  const findings = validateAllAuthorities({ media, projects, reviews, brand });
  const metrics = generateMetrics({ analysis, findings });

  // Return legacy format for backward compatibility
  return {
    repositoryHealth: {
      overallHealth: metrics.repository?.overallHealth || "unknown",
      healthScore: metrics.health?.score || 0,
      healthCategory: metrics.health?.category || "unknown",
      authorities: [
        { name: "Media Authority", status: metrics.media?.health as any, recordCount: metrics.media?.total || 0, issues: [], lastUpdated: new Date().toISOString(), score: metrics.media?.score || 0 },
        { name: "Projects Authority", status: metrics.projects?.health as any, recordCount: metrics.projects?.total || 0, issues: [], lastUpdated: new Date().toISOString(), score: metrics.projects?.score || 0 },
        { name: "Reviews Authority", status: metrics.reviews?.health as any, recordCount: metrics.reviews?.total || 0, issues: [], lastUpdated: new Date().toISOString(), score: metrics.reviews?.score || 0 },
        { name: "Brand Authority", status: metrics.brand?.health as any, recordCount: 1, issues: [], lastUpdated: new Date().toISOString(), score: metrics.brand?.score || 0 },
      ],
      lastGenerated: metrics.timestamp,
      summary: {
        totalAuthorities: metrics.repository?.totalAuthorities || 0,
        healthyAuthorities: metrics.repository?.healthyAuthorities || 0,
        warningAuthorities: metrics.repository?.warningAuthorities || 0,
        criticalAuthorities: metrics.repository?.criticalAuthorities || 0,
      },
    },
    mediaCoverage: {
      totalProjects: metrics.projects?.total || 0,
      projectsWithHero: (metrics.projects?.total || 0) - (metrics.projects?.missingHero || 0),
      projectsWithBeforeAfter: metrics.projects?.withBeforeAfter || 0,
      projectsWithGallery: metrics.projects?.withGallery || 0,
      coveragePercentage: metrics.projects?.heroCoverage || 0,
      missingMedia: [],
    },
    seoCoverage: {
      totalProjects: metrics.projects?.total || 0,
      projectsWithSlug: (metrics.projects?.total || 0) - (metrics.projects?.missingSlug || 0),
      projectsWithTitle: metrics.projects?.total || 0,
      projectsWithDescription: (metrics.projects?.total || 0) - (metrics.projects?.missingSeoDescription || 0),
      coveragePercentage: metrics.projects?.total ? 100 - ((metrics.projects?.missingSeoDescription || 0) / metrics.projects.total * 100) : 0,
      missingSEO: [],
    },
    accessibilityHealth: {
      totalMedia: metrics.media?.total || 0,
      mediaWithAltText: (metrics.media?.total || 0) - (metrics.media?.missingAltText || 0),
      altTextCoverage: metrics.media?.altTextCoverage || 0,
      missingAltText: [],
      score: metrics.media?.altTextCoverage || 0,
    },
    performanceHealth: {
      totalMedia: metrics.media?.total || 0,
      mediaWithWebVariant: (metrics.media?.total || 0) - (metrics.media?.missingWebVariant || 0),
      mediaWithThumbnail: (metrics.media?.total || 0) - (metrics.media?.missingThumbnail || 0),
      mediaWithBlurPlaceholder: (metrics.media?.total || 0) - (metrics.media?.missingBlurPlaceholder || 0),
      webVariantCoverage: metrics.media?.total ? 100 - ((metrics.media?.missingWebVariant || 0) / metrics.media.total * 100) : 0,
      thumbnailCoverage: metrics.media?.total ? 100 - ((metrics.media?.missingThumbnail || 0) / metrics.media.total * 100) : 0,
      blurPlaceholderCoverage: metrics.media?.total ? 100 - ((metrics.media?.missingBlurPlaceholder || 0) / metrics.media.total * 100) : 0,
      score: metrics.media?.score || 0,
    },
    contentCoverage: {
      serviceCoverage: {
        totalServices: 0,
        servicesWithProjects: 0,
        coveragePercentage: 0,
        missingServices: [],
      },
      homepageCoverage: {
        homepageEligibleProjects: metrics.projects?.homepageEligible || 0,
        featuredProjects: metrics.projects?.featured || 0,
        homepageHeroConfigured: metrics.brand?.hasHomepageHero || false,
      },
      reviewCoverage: {
        completedProjects: metrics.projects?.total || 0,
        projectsWithReviews: 0,
        coveragePercentage: 0,
        projectsWithoutReviews: [],
      },
      overallScore: metrics.health?.score || 0,
    },
    automationStatus: {
      googleDriveSync: {
        enabled: false,
        status: "inactive" as const,
      },
      variantGeneration: {
        totalMedia: metrics.media?.total || 0,
        mediaWithVariants: (metrics.media?.total || 0) - (metrics.media?.missingVariants || 0),
        coveragePercentage: metrics.media?.variantCoverage || 0,
      },
      exifExtraction: {
        totalMedia: metrics.media?.total || 0,
        mediaWithExif: 0,
        coveragePercentage: 0,
      },
      overallStatus: "offline" as const,
    },
    brokenReferences: {
      orphanedMedia: [String(metrics.media?.orphaned || 0)],
      unusedProjects: [String(metrics.projects?.unused || 0)],
      brokenMediaReferences: [],
      brokenProjectReferences: [],
      totalIssues: (metrics.media?.orphaned || 0) + (metrics.projects?.unused || 0),
      score: 100 - ((metrics.media?.orphaned || 0) + (metrics.projects?.unused || 0)) * 5,
    },
    generatedAt: metrics.timestamp,
  };
}
