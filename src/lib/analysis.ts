/**
 * Single-Pass Analysis Engine
 * 
 * Performs one comprehensive scan of each authority to extract all relevant data.
 * This eliminates duplicate scans and provides a single source of truth for metrics.
 * 
 * Architecture: Authorities → Analysis Engine → Analysis Results → Metrics Engine
 */

import type { MediaManifest } from "@/types/media";
import type { ProjectsManifest, Project } from "@/types/projects";
import type { ReviewsManifest } from "@/types/reviews";
import type { BrandManifest } from "@/types/brand";

export interface MediaAnalysis {
  total: number;
  missingAltText: number;
  missingWebVariant: number;
  missingThumbnail: number;
  missingBlurPlaceholder: number;
  missingVariants: number;
  orphaned: number;
  invalidOrientation: number;
  brokenUrls: number;
  withProjectReference: number;
  withoutProjectReference: number;
  byType: Record<string, number>;
  byOrientation: Record<string, number>;
}

export interface ProjectAnalysis {
  total: number;
  byStatus: Record<string, number>;
  byService: Record<string, number>;
  missingHero: number;
  missingStory: number;
  missingLocation: number;
  missingSlug: number;
  missingSeoDescription: number;
  unused: number; // No media
  featured: number;
  homepageEligible: number;
  withBeforeAfter: number;
  withGallery: number;
}

export interface ReviewAnalysis {
  total: number;
  missingRating: number;
  missingBody: number;
  missingProjectReference: number;
  byRating: Record<number, number>;
  bySource: Record<string, number>;
  averageRating: number;
}

export interface BrandAnalysis {
  hasHomepageHero: boolean;
  hasOwnerPortrait: boolean;
  homepageHeroMediaId?: string | null;
  ownerPortraitMediaId?: string | null;
}

export interface AnalysisResults {
  media: MediaAnalysis;
  projects: ProjectAnalysis;
  reviews: ReviewAnalysis;
  brand: BrandAnalysis;
  timestamp: string;
}

/**
 * Analyze Media Authority in a single pass
 */
export function analyzeMedia(manifest: MediaManifest): MediaAnalysis {
  const analysis: MediaAnalysis = {
    total: manifest.media.length,
    missingAltText: 0,
    missingWebVariant: 0,
    missingThumbnail: 0,
    missingBlurPlaceholder: 0,
    missingVariants: 0,
    orphaned: 0,
    invalidOrientation: 0,
    brokenUrls: 0,
    withProjectReference: 0,
    withoutProjectReference: 0,
    byType: {},
    byOrientation: {},
  };

  manifest.media.forEach(media => {
    // Count by type
    analysis.byType[media.type] = (analysis.byType[media.type] || 0) + 1;

    // Count by orientation
    if (media.orientation) {
      analysis.byOrientation[media.orientation] = (analysis.byOrientation[media.orientation] || 0) + 1;
    }

    // Check alt text
    if (!media.alt) {
      analysis.missingAltText++;
    }

    // Check variants
    if (!media.variants || Object.keys(media.variants).length === 0) {
      analysis.missingVariants++;
    } else {
      if (!media.variants.web) analysis.missingWebVariant++;
      if (!media.variants.thumbnail) analysis.missingThumbnail++;
      if (!media.variants.blur) analysis.missingBlurPlaceholder++;
    }

    // Check project reference
    if (media.projectId) {
      analysis.withProjectReference++;
    } else {
      analysis.withoutProjectReference++;
    }

    // Check orientation consistency
    if (media.orientation && media.dimensions) {
      const { width, height } = media.dimensions;
      const isLandscape = width > height;
      const isPortrait = height > width;
      
      if (media.orientation === "landscape" && !isLandscape) {
        analysis.invalidOrientation++;
      }
      if (media.orientation === "portrait" && !isPortrait) {
        analysis.invalidOrientation++;
      }
    }

    // Check URL validity
    Object.entries(media.variants || {}).forEach(([_, url]) => {
      if (typeof url === 'string') {
        try {
          new URL(url);
        } catch {
          analysis.brokenUrls++;
        }
      }
    });
  });

  return analysis;
}

/**
 * Analyze Projects Authority in a single pass
 */
export function analyzeProjects(manifest: ProjectsManifest): ProjectAnalysis {
  const analysis: ProjectAnalysis = {
    total: manifest.projects.length,
    byStatus: {},
    byService: {},
    missingHero: 0,
    missingStory: 0,
    missingLocation: 0,
    missingSlug: 0,
    missingSeoDescription: 0,
    unused: 0,
    featured: 0,
    homepageEligible: 0,
    withBeforeAfter: 0,
    withGallery: 0,
  };

  manifest.projects.forEach(project => {
    // Count by status
    analysis.byStatus[project.status] = (analysis.byStatus[project.status] || 0) + 1;

    // Count by service
    analysis.byService[project.service] = (analysis.byService[project.service] || 0) + 1;

    // Check hero media
    if (!project.media.hero) {
      analysis.missingHero++;
    }

    // Check story
    if (!project.story) {
      analysis.missingStory++;
    }

    // Check location
    if (!project.location) {
      analysis.missingLocation++;
    }

    // Check SEO slug
    if (!project.seo?.slug) {
      analysis.missingSlug++;
    }

    // Check SEO description
    if (!project.seo?.metaDescription) {
      analysis.missingSeoDescription++;
    }

    // Check if unused (no media)
    const hasMedia = project.media.hero || 
                    project.media.before || 
                    project.media.after || 
                    (project.media.gallery && project.media.gallery.length > 0);
    if (!hasMedia) {
      analysis.unused++;
    }

    // Check featured
    if (project.featured) {
      analysis.featured++;
    }

    // Check homepage eligible
    if (project.homepageEligible) {
      analysis.homepageEligible++;
    }

    // Check before/after
    if (project.media.before && project.media.after) {
      analysis.withBeforeAfter++;
    }

    // Check gallery
    if (project.media.gallery && project.media.gallery.length > 0) {
      analysis.withGallery++;
    }
  });

  return analysis;
}

/**
 * Analyze Reviews Authority in a single pass
 */
export function analyzeReviews(manifest: ReviewsManifest): ReviewAnalysis {
  const analysis: ReviewAnalysis = {
    total: manifest.reviews.length,
    missingRating: 0,
    missingBody: 0,
    missingProjectReference: 0,
    byRating: {},
    bySource: {},
    averageRating: 0,
  };

  let totalRating = 0;
  let ratingCount = 0;

  manifest.reviews.forEach(review => {
    // Check rating
    if (review.rating === undefined || review.rating === null) {
      analysis.missingRating++;
    } else {
      analysis.byRating[review.rating] = (analysis.byRating[review.rating] || 0) + 1;
      totalRating += review.rating;
      ratingCount++;
    }

    // Check body
    if (!review.body) {
      analysis.missingBody++;
    }

    // Check project reference
    if (!review.projectId) {
      analysis.missingProjectReference++;
    }

    // Count by source
    if (review.provider) {
      analysis.bySource[review.provider] = (analysis.bySource[review.provider] || 0) + 1;
    }
  });

  analysis.averageRating = ratingCount > 0 ? totalRating / ratingCount : 0;

  return analysis;
}

/**
 * Analyze Brand Authority in a single pass
 */
export function analyzeBrand(manifest: BrandManifest): BrandAnalysis {
  return {
    hasHomepageHero: !!manifest.homepageHero,
    hasOwnerPortrait: !!manifest.ownerPortrait,
    homepageHeroMediaId: manifest.homepageHero?.mediaId || null,
    ownerPortraitMediaId: manifest.ownerPortrait?.mediaId || null,
  };
}

/**
 * Run complete analysis in a single pass per authority
 */
export function analyzeAll({
  media,
  projects,
  reviews,
  brand,
}: {
  media: MediaManifest;
  projects: ProjectsManifest;
  reviews: ReviewsManifest;
  brand: BrandManifest;
}): AnalysisResults {
  return {
    media: analyzeMedia(media),
    projects: analyzeProjects(projects),
    reviews: analyzeReviews(reviews),
    brand: analyzeBrand(brand),
    timestamp: new Date().toISOString(),
  };
}
