/**
 * Validation Engine
 * 
 * Emits Findings for all validation issues.
 * Findings are then aggregated by the Metrics Engine.
 * 
 * Architecture: Authorities → Validation Engine → Findings → Analysis Engine → Metrics Engine → Health Score
 * 
 * Two validation layers:
 * 1. Schema Validation: JSON structure, required fields, data types
 * 2. Constitutional Validation: Business truth, cross-authority consistency, logical rules
 */

import type { MediaManifest } from "@/types/media";
import type { ProjectsManifest } from "@/types/projects";
import type { ReviewsManifest } from "@/types/reviews";
import type { BrandManifest } from "@/types/brand";
import type { ServicesRegistry } from "@/types/registries";
import type { Finding, Severity, Authority } from "./findings";
import { createFinding } from "./findings";
import { loadHealthRules } from "./health-rules";

/**
 * Validate Media Authority and emit Findings
 */
export function validateMediaAuthority(manifest: MediaManifest): Finding[] {
  const findings: Finding[] = [];
  const rules = loadHealthRules();

  // Check for duplicate media IDs
  const mediaIds = manifest.media.map(m => m.id);
  const duplicateIds = findDuplicates(mediaIds);
  duplicateIds.forEach(id => {
    findings.push(createFinding({
      rule: "duplicate-media-id",
      severity: "critical",
      authority: "media",
      resourceId: id,
      message: `Duplicate media ID: ${id}`,
      path: `media.v1.json[${id}]`,
    }));
  });

  // Check for duplicate filenames
  const filenames = manifest.media.map(m => m.filename).filter(Boolean) as string[];
  const duplicateFilenames = findDuplicates(filenames);
  duplicateFilenames.forEach(filename => {
    findings.push(createFinding({
      rule: "duplicate-filename",
      severity: "high",
      authority: "media",
      message: `Duplicate filename: ${filename}`,
    }));
  });

  // Validate each media entry
  manifest.media.forEach(media => {
    // Required fields
    if (!media.id) {
      findings.push(createFinding({
        rule: "missing-media-id",
        severity: "critical",
        authority: "media",
        message: "Media entry missing required field: id",
      }));
    }
    if (!media.type) {
      findings.push(createFinding({
        rule: "missing-media-type",
        severity: "critical",
        authority: "media",
        resourceId: media.id,
        message: "Media entry missing required field: type",
        path: `media.v1.json[${media.id}].type`,
      }));
    }
    if (!media.variants || Object.keys(media.variants).length === 0) {
      findings.push(createFinding({
        rule: "missing-variants",
        severity: "high",
        authority: "media",
        resourceId: media.id,
        message: "Media entry missing required field: variants",
        path: `media.v1.json[${media.id}].variants`,
      }));
    }

    // Accessibility: missing alt text
    if (!media.alt) {
      findings.push(createFinding({
        rule: "missing-alt-text",
        severity: "high",
        authority: "media",
        resourceId: media.id,
        message: "Media entry missing alt text (accessibility requirement)",
        path: `media.v1.json[${media.id}].alt`,
      }));
    }

    // Performance: missing web variant
    if (!media.variants?.web) {
      findings.push(createFinding({
        rule: "missing-web-variant",
        severity: "medium",
        authority: "media",
        resourceId: media.id,
        message: "Media entry missing web variant (performance impact)",
        path: `media.v1.json[${media.id}].variants.web`,
      }));
    }

    // Performance: missing thumbnail
    if (!media.variants?.thumbnail) {
      findings.push(createFinding({
        rule: "missing-thumbnail",
        severity: "medium",
        authority: "media",
        resourceId: media.id,
        message: "Media entry missing thumbnail variant (UX impact)",
        path: `media.v1.json[${media.id}].variants.thumbnail`,
      }));
    }

    // Performance: missing blur placeholder
    if (!media.variants?.blur) {
      findings.push(createFinding({
        rule: "missing-blur-placeholder",
        severity: "low",
        authority: "media",
        resourceId: media.id,
        message: "Media entry missing blur placeholder (LCP optimization)",
        path: `media.v1.json[${media.id}].variants.blur`,
      }));
    }

    // Schema validation: orientation should match dimensions
    if (media.orientation && media.dimensions) {
      const { width, height } = media.dimensions;
      const isLandscape = width > height;
      const isPortrait = height > width;
      
      if (media.orientation === "landscape" && !isLandscape) {
        findings.push(createFinding({
          rule: "invalid-orientation",
          severity: "low",
          authority: "media",
          resourceId: media.id,
          message: `Orientation marked as landscape but dimensions (${width}x${height}) suggest portrait`,
          path: `media.v1.json[${media.id}].orientation`,
        }));
      }
      if (media.orientation === "portrait" && !isPortrait) {
        findings.push(createFinding({
          rule: "invalid-orientation",
          severity: "low",
          authority: "media",
          resourceId: media.id,
          message: `Orientation marked as portrait but dimensions (${width}x${height}) suggest landscape`,
          path: `media.v1.json[${media.id}].orientation`,
        }));
      }
    }

    // URL validation: check if variants are valid URLs
    // Relative URLs (starting with /) are valid for static assets
    // Absolute URLs (http/https) must be valid URL syntax
    Object.entries(media.variants || {}).forEach(([variantType, url]) => {
      if (typeof url === 'string') {
        // Relative URLs are valid for static assets
        if (url.startsWith('/')) {
          return; // Valid relative URL
        }
        // Absolute URLs must be valid URL syntax
        try {
          new URL(url);
        } catch {
          findings.push(createFinding({
            rule: "invalid-url",
            severity: "high",
            authority: "media",
            resourceId: media.id,
            message: `Invalid URL for variant ${variantType}: ${url}`,
            path: `media.v1.json[${media.id}].variants.${variantType}`,
          }));
        }
      }
    });
  });

  return findings;
}

/**
 * Validate Projects Authority and emit Findings
 */
export function validateProjectsAuthority(manifest: ProjectsManifest): Finding[] {
  const findings: Finding[] = [];

  // Check for duplicate project IDs
  const projectIds = manifest.projects.map(p => p.id);
  const duplicateIds = findDuplicates(projectIds);
  duplicateIds.forEach(id => {
    findings.push(createFinding({
      rule: "duplicate-project-id",
      severity: "critical",
      authority: "projects",
      resourceId: id,
      message: `Duplicate project ID: ${id}`,
      path: `projects.v1.json[${id}]`,
    }));
  });

  // Check for duplicate slugs
  const slugs = manifest.projects.map(p => p.seo?.slug).filter(Boolean) as string[];
  const duplicateSlugs = findDuplicates(slugs);
  duplicateSlugs.forEach(slug => {
    findings.push(createFinding({
      rule: "duplicate-slug",
      severity: "high",
      authority: "projects",
      message: `Duplicate SEO slug: ${slug}`,
    }));
  });

  // Validate each project entry
  manifest.projects.forEach(project => {
    // Required fields
    if (!project.id) {
      findings.push(createFinding({
        rule: "missing-project-id",
        severity: "critical",
        authority: "projects",
        message: "Project entry missing required field: id",
      }));
    }
    if (!project.title) {
      findings.push(createFinding({
        rule: "missing-project-title",
        severity: "critical",
        authority: "projects",
        resourceId: project.id,
        message: "Project entry missing required field: title",
        path: `projects.v1.json[${project.id}].title`,
      }));
    }
    if (!project.service) {
      findings.push(createFinding({
        rule: "missing-project-service",
        severity: "critical",
        authority: "projects",
        resourceId: project.id,
        message: "Project entry missing required field: service",
        path: `projects.v1.json[${project.id}].service`,
      }));
    }
    if (!project.status) {
      findings.push(createFinding({
        rule: "missing-project-status",
        severity: "high",
        authority: "projects",
        resourceId: project.id,
        message: "Project entry missing required field: status",
        path: `projects.v1.json[${project.id}].status`,
      }));
    }
    if (!project.location) {
      findings.push(createFinding({
        rule: "missing-project-location",
        severity: "medium",
        authority: "projects",
        resourceId: project.id,
        message: "Project entry missing location data",
        path: `projects.v1.json[${project.id}].location`,
      }));
    }
  });

  return findings;
}

/**
 * Validate Reviews Authority and emit Findings
 */
export function validateReviewsAuthority(manifest: ReviewsManifest): Finding[] {
  const findings: Finding[] = [];

  // Check for duplicate review IDs
  const reviewIds = manifest.reviews.map(r => r.id);
  const duplicateIds = findDuplicates(reviewIds);
  duplicateIds.forEach(id => {
    findings.push(createFinding({
      rule: "duplicate-review-id",
      severity: "critical",
      authority: "reviews",
      resourceId: id,
      message: `Duplicate review ID: ${id}`,
      path: `reviews.v1.json[${id}]`,
    }));
  });

  // Validate each review entry
  manifest.reviews.forEach(review => {
    // Required fields
    if (!review.id) {
      findings.push(createFinding({
        rule: "missing-review-id",
        severity: "critical",
        authority: "reviews",
        message: "Review entry missing required field: id",
      }));
    }
    if (review.rating === undefined || review.rating === null) {
      findings.push(createFinding({
        rule: "missing-review-rating",
        severity: "high",
        authority: "reviews",
        resourceId: review.id,
        message: "Review entry missing rating",
        path: `reviews.v1.json[${review.id}].rating`,
      }));
    }
    if (!review.body) {
      findings.push(createFinding({
        rule: "missing-review-body",
        severity: "high",
        authority: "reviews",
        resourceId: review.id,
        message: "Review entry missing body text",
        path: `reviews.v1.json[${review.id}].body`,
      }));
    }
  });

  return findings;
}

/**
 * Validate Brand Authority and emit Findings
 */
export function validateBrandAuthority(manifest: BrandManifest): Finding[] {
  const findings: Finding[] = [];

  // Check for homepage hero
  if (!manifest.homepageHero) {
    findings.push(createFinding({
      rule: "missing-homepage-hero",
      severity: "critical",
      authority: "brand",
      message: "Brand Authority missing homepage hero configuration",
      path: `brand.v1.json.homepageHero`,
    }));
  } else if (!manifest.homepageHero.mediaId) {
    findings.push(createFinding({
      rule: "missing-homepage-hero-media",
      severity: "critical",
      authority: "brand",
      message: "Homepage hero missing media reference",
      path: `brand.v1.json.homepageHero.mediaId`,
    }));
  }

  // Check for owner portrait
  if (!manifest.ownerPortrait) {
    findings.push(createFinding({
      rule: "missing-owner-portrait",
      severity: "critical",
      authority: "brand",
      message: "Brand Authority missing owner portrait configuration",
      path: `brand.v1.json.ownerPortrait`,
    }));
  } else if (!manifest.ownerPortrait.mediaId) {
    findings.push(createFinding({
      rule: "missing-owner-portrait-media",
      severity: "critical",
      authority: "brand",
      message: "Owner portrait missing media reference",
      path: `brand.v1.json.ownerPortrait.mediaId`,
    }));
  }

  return findings;
}

/**
 * Cross-authority reference validation and emit Findings
 */
export function validateCrossAuthorityReferences(
  media: MediaManifest,
  projects: ProjectsManifest,
  brand: BrandManifest
): Finding[] {
  const findings: Finding[] = [];

  const mediaIds = new Set(media.media.map(m => m.id));
  const projectIds = new Set(projects.projects.map(p => p.id));
  const referencedMediaIds = new Set<string>();

  // Validate media references in projects
  projects.projects.forEach(project => {
    if (project.media.hero) {
      referencedMediaIds.add(project.media.hero);
      if (!mediaIds.has(project.media.hero)) {
        findings.push(createFinding({
          rule: "broken-media-reference",
          severity: "high",
          authority: "projects",
          resourceId: project.id,
          message: `Project references non-existent media ID: ${project.media.hero}`,
          path: `projects.v1.json[${project.id}].media.hero`,
        }));
      }
    }

    if (project.media.before) {
      referencedMediaIds.add(project.media.before);
      if (!mediaIds.has(project.media.before)) {
        findings.push(createFinding({
          rule: "broken-media-reference",
          severity: "high",
          authority: "projects",
          resourceId: project.id,
          message: `Project references non-existent media ID: ${project.media.before}`,
          path: `projects.v1.json[${project.id}].media.before`,
        }));
      }
    }

    if (project.media.after) {
      referencedMediaIds.add(project.media.after);
      if (!mediaIds.has(project.media.after)) {
        findings.push(createFinding({
          rule: "broken-media-reference",
          severity: "high",
          authority: "projects",
          resourceId: project.id,
          message: `Project references non-existent media ID: ${project.media.after}`,
          path: `projects.v1.json[${project.id}].media.after`,
        }));
      }
    }

    project.media.gallery?.forEach(mediaId => {
      referencedMediaIds.add(mediaId);
      if (!mediaIds.has(mediaId)) {
        findings.push(createFinding({
          rule: "broken-media-reference",
          severity: "high",
          authority: "projects",
          resourceId: project.id,
          message: `Project references non-existent media ID in gallery: ${mediaId}`,
          path: `projects.v1.json[${project.id}].media.gallery`,
        }));
      }
    });
  });

  // Validate media references to projects
  media.media.forEach(mediaItem => {
    if (mediaItem.projectId && !projectIds.has(mediaItem.projectId)) {
      findings.push(createFinding({
        rule: "broken-project-reference",
        severity: "high",
        authority: "media",
        resourceId: mediaItem.id,
        message: `Media references non-existent project ID: ${mediaItem.projectId}`,
        path: `media.v1.json[${mediaItem.id}].projectId`,
      }));
    }
  });

  // Validate brand media references
  if (brand.homepageHero?.mediaId) {
    referencedMediaIds.add(brand.homepageHero.mediaId);
    if (!mediaIds.has(brand.homepageHero.mediaId)) {
      findings.push(createFinding({
        rule: "broken-media-reference",
        severity: "high",
        authority: "brand",
        message: `Brand references non-existent media ID: ${brand.homepageHero.mediaId}`,
        path: `brand.v1.json.homepageHero.mediaId`,
      }));
    }
  }

  if (brand.ownerPortrait?.mediaId) {
    referencedMediaIds.add(brand.ownerPortrait.mediaId);
    if (!mediaIds.has(brand.ownerPortrait.mediaId)) {
      findings.push(createFinding({
        rule: "broken-media-reference",
        severity: "high",
        authority: "brand",
        message: `Brand references non-existent media ID: ${brand.ownerPortrait.mediaId}`,
        path: `brand.v1.json.ownerPortrait.mediaId`,
      }));
    }
  }

  // Detect orphaned media (media not referenced by any project or brand)
  media.media.forEach(mediaItem => {
    if (mediaItem.projectId && !referencedMediaIds.has(mediaItem.id)) {
      findings.push(createFinding({
        rule: "orphaned-media",
        severity: "low",
        authority: "media",
        resourceId: mediaItem.id,
        message: `Media entry is orphaned (not referenced by any project or brand): ${mediaItem.id}`,
        path: `media.v1.json[${mediaItem.id}]`,
      }));
    }
  });

  // Detect unused projects (projects with no media)
  projects.projects.forEach(project => {
    const hasMedia = project.media.hero || 
                    project.media.before || 
                    project.media.after || 
                    (project.media.gallery && project.media.gallery.length > 0);
    if (!hasMedia) {
      findings.push(createFinding({
        rule: "unused-project",
        severity: "low",
        authority: "projects",
        resourceId: project.id,
        message: `Project has no media associated: ${project.id}`,
        path: `projects.v1.json[${project.id}]`,
      }));
    }
  });

  return findings;
}

/**
 * Validate Services Authority and emit Findings
 * Checks that each service has at least one completed project with hero media
 */
export function validateServicesAuthority(
  services: ServicesRegistry,
  projects: ProjectsManifest,
  media: MediaManifest
): Finding[] {
  const findings: Finding[] = [];

  services.services.forEach(service => {
    // Find completed projects for this service
    const serviceProjects = projects.projects.filter(
      p => p.service === service.slug && p.status === 'completed'
    );

    if (serviceProjects.length === 0) {
      findings.push(createFinding({
        rule: "service-has-no-projects",
        severity: "medium",
        authority: "services",
        resourceId: service.slug,
        message: `Service has no completed projects: ${service.name}`,
        path: `services.v1.json[${service.slug}]`,
      }));
      return;
    }

    // Check if any project has hero media
    const projectWithHero = serviceProjects.find(p => p.media.hero);
    if (!projectWithHero) {
      findings.push(createFinding({
        rule: "service-has-no-hero-media",
        severity: "medium",
        authority: "services",
        resourceId: service.slug,
        message: `Service has projects but no hero media: ${service.name}`,
        path: `services.v1.json[${service.slug}]`,
      }));
      return;
    }

    // Verify hero media exists in Media Authority
    const heroMediaExists = media.media.some(m => m.id === projectWithHero.media.hero);
    if (!heroMediaExists) {
      findings.push(createFinding({
        rule: "service-hero-media-missing",
        severity: "high",
        authority: "services",
        resourceId: service.slug,
        message: `Service project hero media not found in Media Authority: ${service.name}`,
        path: `projects.v1.json[${projectWithHero.id}].media.hero`,
      }));
    }
  });

  return findings;
}

/**
 * Run full validation across all authorities and emit Findings
 */
export function validateAllAuthorities({
  media,
  projects,
  reviews,
  brand,
  services,
}: {
  media: MediaManifest;
  projects: ProjectsManifest;
  reviews: ReviewsManifest;
  brand: BrandManifest;
  services?: ServicesRegistry;
}): Finding[] {
  const findings: Finding[] = [];

  // Schema Validation (existing)
  findings.push(...validateMediaAuthority(media));
  findings.push(...validateProjectsAuthority(projects));
  findings.push(...validateReviewsAuthority(reviews));
  findings.push(...validateBrandAuthority(brand));
  findings.push(...validateCrossAuthorityReferences(media, projects, brand));

  // Validate services coverage if services registry is provided
  if (services) {
    findings.push(...validateServicesAuthority(services, projects, media));
  }

  // Constitutional Validation (business truth rules)
  findings.push(...validateConstitutionalRules({ media, projects, reviews, brand, services }));

  return findings;
}

/**
 * Find duplicate values in an array
 */
function findDuplicates<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const duplicates: T[] = [];

  for (const item of arr) {
    if (seen.has(item)) {
      duplicates.push(item);
    } else {
      seen.add(item);
    }
  }
  
  return duplicates;
}

/**
 * Constitutional Validation - Business Truth Rules
 * 
 * Validates cross-authority consistency and logical business rules.
 * This is separate from schema validation (JSON structure).
 */
function validateConstitutionalRules({
  media,
  projects,
  reviews,
  brand,
  services,
}: {
  media: MediaManifest;
  projects: ProjectsManifest;
  reviews: ReviewsManifest;
  brand: BrandManifest;
  services?: ServicesRegistry;
}): Finding[] {
  const findings: Finding[] = [];

  // Rule: Featured projects must have hero media
  projects.projects.forEach(project => {
    if (project.featured && !project.media.hero) {
      findings.push(createFinding({
        rule: "featured-project-missing-hero",
        severity: "critical",
        authority: "projects",
        resourceId: project.id,
        message: `Featured project has no hero media: ${project.title}`,
        path: `projects.v1.json[${project.id}].media.hero`,
      }));
    }
  });

  // Rule: Completed projects should have after photo
  projects.projects.forEach(project => {
    if (project.status === "completed" && !project.media.after) {
      findings.push(createFinding({
        rule: "completed-project-missing-after",
        severity: "medium",
        authority: "projects",
        resourceId: project.id,
        message: `Completed project has no after photo: ${project.title}`,
        path: `projects.v1.json[${project.id}].media.after`,
      }));
    }
  });

  // Rule: Project service should match story context (if story exists)
  projects.projects.forEach(project => {
    if (project.story && services) {
      const service = services.services.find(s => s.slug === project.service);
      if (service && project.story.challenge.toLowerCase().includes(service.name.toLowerCase())) {
        // This is actually correct - story mentions the service
      } else if (project.story.challenge.toLowerCase().includes("kitchen") && project.service !== "kitchens") {
        findings.push(createFinding({
          rule: "story-service-mismatch",
          severity: "medium",
          authority: "projects",
          resourceId: project.id,
          message: `Story mentions kitchen but project service is ${project.service}: ${project.title}`,
          path: `projects.v1.json[${project.id}].story.challenge`,
        }));
      }
    }
  });

  // Rule: Homepage eligible projects should have hero media
  projects.projects.forEach(project => {
    if (project.homepageEligible && !project.media.hero) {
      findings.push(createFinding({
        rule: "homepage-eligible-missing-hero",
        severity: "critical",
        authority: "projects",
        resourceId: project.id,
        message: `Homepage eligible project has no hero media: ${project.title}`,
        path: `projects.v1.json[${project.id}].media.hero`,
      }));
    }
  });

  // Rule: Hero eligible projects should have hero media
  projects.projects.forEach(project => {
    if (project.heroEligible && !project.media.hero) {
      findings.push(createFinding({
        rule: "hero-eligible-missing-hero",
        severity: "critical",
        authority: "projects",
        resourceId: project.id,
        message: `Hero eligible project has no hero media: ${project.title}`,
        path: `projects.v1.json[${project.id}].media.hero`,
      }));
    }
  });

  // Rule: Reviews should reference valid projects
  reviews.reviews.forEach(review => {
    if (review.projectId) {
      const projectExists = projects.projects.some(p => p.id === review.projectId);
      if (!projectExists) {
        findings.push(createFinding({
          rule: "review-invalid-project-reference",
          severity: "high",
          authority: "reviews",
          resourceId: review.id,
          message: `Review references non-existent project: ${review.projectId}`,
          path: `reviews.v1.json[${review.id}].projectId`,
        }));
      }
    }
  });

  // Rule: Brand homepage hero should reference valid media
  if (brand.homepageHero?.mediaId) {
    const mediaExists = media.media.some(m => m.id === brand.homepageHero.mediaId);
    if (!mediaExists) {
      findings.push(createFinding({
        rule: "brand-hero-invalid-media-reference",
        severity: "critical",
        authority: "brand",
        message: `Brand homepage hero references non-existent media: ${brand.homepageHero.mediaId}`,
        path: `brand.v1.json.homepageHero.mediaId`,
      }));
    }
  }

  // Rule: Brand owner portrait should reference valid media
  if (brand.ownerPortrait?.mediaId) {
    const mediaExists = media.media.some(m => m.id === brand.ownerPortrait.mediaId);
    if (!mediaExists) {
      findings.push(createFinding({
        rule: "brand-portrait-invalid-media-reference",
        severity: "critical",
        authority: "brand",
        message: `Brand owner portrait references non-existent media: ${brand.ownerPortrait.mediaId}`,
        path: `brand.v1.json.ownerPortrait.mediaId`,
      }));
    }
  }

  return findings;
}
