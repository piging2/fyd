/**
 * Constitutional Authority Infrastructure
 * 
 * Generic primitives for authority loading, caching, validation, and querying.
 * 
 * Constitutional Rule: Frontend performs no selection, ranking, or sorting.
 * These utilities are for:
 * - Admin tools (authority-editor, workbench)
 * - Projection generation (backend build process)
 * 
 * Frontend presentation components should read from projection artifacts, not use these utilities.
 * 
 * Reference: CONSTITUTIONAL_GALLERY_RECONCILIATION_REPORT.md
 * - Section: Projection Invariants
 * 
 * Updated: Projections are now build-time generated artifacts that React consumes as static JSON.
 * No runtime filesystem access.
 */

// ============================================================================
// P1.1: Generic AuthorityLoader
// ============================================================================

export interface AuthorityLoaderOptions<T> {
  /** Path to the JSON authority file */
  path: string;
  /** Optional validator function */
  validator?: (data: unknown) => data is T;
  /** Fallback data if loading fails */
  fallback: T;
  /** Authority name for error messages */
  name: string;
}

export interface AuthorityCache<T> {
  data: T;
  loadedAt: number;
}

const authorityCaches = new Map<string, AuthorityCache<unknown>>();

/**
 * Generic authority loader with caching, validation, and error handling.
 */
export function loadAuthority<T>({
  path,
  validator,
  fallback,
  name,
}: AuthorityLoaderOptions<T>): T {
  const cacheKey = path;
  const cached = authorityCaches.get(cacheKey);

  if (cached) {
    console.log('[AUTHORITY CACHE HIT]', {
      name,
      path,
      cachedAt: new Date(cached.loadedAt).toISOString(),
    });
    return cached.data as T;
  }

  console.log('[AUTHORITY CACHE MISS]', {
    name,
    path,
  });

  try {
    // Map path aliases to actual file paths for static imports
    const pathMap: Record<string, any> = {
      "@/config/services.v1.json": require("../config/services.v1.json"),
      "@/config/projects.v1.json": require("../config/projects.v1.json"),
      "@/config/media.v1.json": require("../config/media.v1.json"),
      "@/config/reviews.v1.json": require("../config/reviews.v1.json"),
      "@/config/brand.v1.json": require("../config/brand.v1.json"),
      "@/config/navigation.v1.json": require("../config/navigation.v1.json"),
      "@/config/faq.v1.json": require("../config/faq.v1.json"),
      "@/config/cities.v1.json": require("../config/cities.v1.json"),
      "@/config/materials.v1.json": require("../config/materials.v1.json"),
      "@/config/before-after.v1.json": require("../config/before-after.v1.json"),
      "@/config/gallery-presets.v1.json": require("../config/gallery-presets.v1.json"),
      "@/config/manifest.v1.json": require("../config/manifest.v1.json"),
      "@/config/tenant.ping.v1.json": require("../config/tenant.ping.v1.json"),
    };

    const data = pathMap[path];

    if (!data) {
      console.error(`Authority path not found in path map: ${path}`);
      return fallback;
    }

    // Validate if validator provided
    if (validator && !validator(data)) {
      console.error(`Authority validation failed for ${name}:`, data);
      return fallback;
    }

    const result = data as T;
    authorityCaches.set(cacheKey, {
      data: result,
      loadedAt: Date.now(),
    });

    console.log('[AUTHORITY LOADED]', {
      name,
      path,
      loadedAt: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    console.error(`Failed to load authority ${name}:`, error);
    return fallback;
  }
}

/**
 * Clear cache for a specific authority
 */
export function clearAuthorityCache(path: string): void {
  console.log('[AUTHORITY CACHE CLEAR]', {
    path,
  });
  authorityCaches.delete(path);
}

/**
 * Clear all authority caches
 */
export function clearAllAuthorityCaches(): void {
  authorityCaches.clear();
}

/**
 * Get cache statistics
 */
export function getAuthorityCacheStats() {
  return {
    size: authorityCaches.size,
    entries: Array.from(authorityCaches.entries()).map(([path, cache]) => ({
      path,
      loadedAt: new Date(cache.loadedAt).toISOString(),
    })),
  };
}

// ============================================================================
// P1.4: Shared Filtering Utilities
// ============================================================================

export interface Orderable {
  order?: number;
}

/**
 * Sort items by order field
 */
export function sortByOrder<T extends Orderable>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

export interface Featured {
  featured?: boolean;
}

/**
 * Filter featured items
 */
export function filterFeatured<T extends Featured>(items: T[]): T[] {
  return items.filter(item => item.featured);
}

export interface HomepageEligible {
  homepageEligible?: boolean;
}

/**
 * Filter homepage-eligible items
 */
export function filterHomepageEligible<T extends HomepageEligible>(items: T[]): T[] {
  return items.filter(item => item.homepageEligible);
}

export interface HeroEligible {
  heroEligible?: boolean;
}

/**
 * Filter hero-eligible items
 */
export function filterHeroEligible<T extends HeroEligible>(items: T[]): T[] {
  return items.filter(item => item.heroEligible);
}

export interface Archived {
  archived?: boolean;
}

/**
 * Filter non-archived items
 */
export function filterNonArchived<T extends Archived>(items: T[]): T[] {
  return items.filter(item => !item.archived);
}

// ============================================================================
// P1.6: Shared Lookup Primitives
// ============================================================================

export interface Identifiable {
  id: string;
}

/**
 * Find item by ID
 */
export function findById<T extends Identifiable>(items: T[], id: string): T | null {
  return items.find(item => item.id === id) || null;
}

export interface Sluggable {
  slug?: string;
  id?: string;
}

/**
 * Find item by slug (fallback to id if slug not present)
 */
export function findBySlug<T extends Sluggable>(items: T[], slug: string): T | null {
  return items.find(item => (item.slug || item.id) === slug) || null;
}

/**
 * Find item by field
 */
export function findByField<T>(items: T[], field: keyof T, value: unknown): T | null {
  return items.find(item => item[field] === value) || null;
}

/**
 * Filter items by field
 */
export function filterByField<T>(items: T[], field: keyof T, value: unknown): T[] {
  return items.filter(item => item[field] === value);
}

/**
 * Filter items by field with case-insensitive string comparison
 */
export function filterByFieldCaseInsensitive<T>(items: T[], field: keyof T, value: string): T[] {
  const lowerValue = value.toLowerCase();
  return items.filter(item => {
    const itemValue = item[field];
    return typeof itemValue === 'string' && itemValue.toLowerCase() === lowerValue;
  });
}

/**
 * Filter items where field contains value in array
 */
export function filterByArrayContains<T>(items: T[], field: keyof T, value: unknown): T[] {
  return items.filter(item => {
    const itemValue = item[field];
    return Array.isArray(itemValue) && itemValue.includes(value);
  });
}

/**
 * Filter items where any of multiple fields match value
 */
export function filterByAnyField<T>(items: T[], fields: (keyof T)[], value: unknown): T[] {
  return items.filter(item => 
    fields.some(field => item[field] === value)
  );
}

// ============================================================================
// P1.2: Generic Project Query Engine
// ============================================================================

export interface ProjectQueryFilters {
  id?: string;
  slug?: string;
  service?: string;
  city?: string;
  county?: string;
  featured?: boolean;
  homepageEligible?: boolean;
  heroEligible?: boolean;
  tag?: string;
  reviewId?: string;
  status?: string;
  limit?: number;
}

export interface QueryableProject {
  id: string;
  service: string;
  status: string;
  location: { city?: string; county?: string };
  featured?: boolean;
  homepageEligible?: boolean;
  heroEligible?: boolean;
  tags: string[];
  reviews: string[];
  seo?: { slug?: string };
  completionDate?: string;
}

/**
 * Generic project query engine
 */
export function queryProjects<T extends QueryableProject>(
  projects: T[],
  filters: ProjectQueryFilters
): T[] {
  let result = [...projects];
  
  // Filter by ID
  if (filters.id) {
    result = result.filter(p => p.id === filters.id);
  }
  
  // Filter by slug
  if (filters.slug) {
    result = result.filter(p => (p.seo?.slug || p.id) === filters.slug);
  }
  
  // Filter by service
  if (filters.service) {
    result = result.filter(p => p.service === filters.service);
  }
  
  // Filter by city (case-insensitive)
  if (filters.city) {
    const cityLower = filters.city.toLowerCase();
    result = result.filter(p => p.location.city?.toLowerCase() === cityLower);
  }
  
  // Filter by county (case-insensitive)
  if (filters.county) {
    const countyLower = filters.county.toLowerCase();
    result = result.filter(p => p.location.county?.toLowerCase() === countyLower);
  }
  
  // Filter by featured
  if (filters.featured !== undefined) {
    result = result.filter(p => p.featured === filters.featured);
  }
  
  // Filter by homepage eligible
  if (filters.homepageEligible !== undefined) {
    result = result.filter(p => p.homepageEligible === filters.homepageEligible);
  }
  
  // Filter by hero eligible
  if (filters.heroEligible !== undefined) {
    result = result.filter(p => p.heroEligible === filters.heroEligible);
  }
  
  // Filter by tag (case-insensitive)
  if (filters.tag) {
    result = result.filter(p => 
      p.tags.some(t => t.toLowerCase() === filters.tag!.toLowerCase())
    );
  }
  
  // Filter by review ID
  if (filters.reviewId) {
    result = result.filter(p => p.reviews.includes(filters.reviewId!));
  }
  
  // Filter by status
  if (filters.status) {
    result = result.filter(p => p.status === filters.status);
  }
  
  // Sort by completion date if filtering by status
  if (filters.status === 'completed') {
    result = result.filter(p => p.completionDate);
    result = result.sort((a, b) => 
      new Date(b.completionDate!).getTime() - new Date(a.completionDate!).getTime()
    );
  }
  
  // Apply limit
  if (filters.limit) {
    result = result.slice(0, filters.limit);
  }
  
  return result;
}
