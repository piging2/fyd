/**
 * Review Authority - Canonical Review Model Adapter
 * 
 * Architecture: Manual Reviews → Review Adapter → Canonical Review Model → Reviews UI
 *              Google Reviews → Review Adapter → Canonical Review Model → Reviews UI
 *              Google Forms → Review Adapter → Canonical Review Model → Reviews UI
 *              Future CRM → Review Adapter → Canonical Review Model → Reviews UI
 * 
 * This adapter provides a single interface for the UI to access reviews,
 * regardless of the source (manual, Google, CRM, etc.).
 * 
 * The website never knows Google exists - Google is just an adapter.
 */

import { Review, ReviewsManifest, ReviewService, ReviewAggregate, ReviewProvider } from "@/types/reviews";
import { loadAuthority, clearAuthorityCache, findById, filterFeatured, filterByField } from "./authority-loader";
import { resolvePublicMedia } from "./media";
import type { Media } from "@/types/media";

export type { ReviewService };

// Load the canonical reviews manifest using shared AuthorityLoader
// Static JSON source
export function loadReviewsManifest(): ReviewsManifest {
  return loadAuthority<ReviewsManifest>({
    path: "@/config/reviews.v1.json",
    fallback: {
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      reviews: []
    },
    name: "Reviews"
  });
}

/**
 * Get all reviews
 */
export async function getAllReviews(): Promise<Review[]> {
  const manifest = loadReviewsManifest();
  return manifest.reviews;
}

/**
 * Get featured reviews only
 */
export async function getFeaturedReviews(): Promise<Review[]> {
  const reviews = await getAllReviews();
  return filterFeatured(reviews);
}

/**
 * P0 FIX: Get featured reviews with resolved media through public media gate
 * This prevents bypassing the public media gate by calling getMediaById directly
 */
export async function getFeaturedReviewsWithResolvedMedia(): Promise<Review[]> {
  const reviews = await getFeaturedReviews();
  return await getReviewsWithResolvedMedia(reviews);
}

/**
 * Get reviews by service
 */
export async function getReviewsByService(service: ReviewService): Promise<Review[]> {
  const reviews = await getAllReviews();
  return filterByField(reviews, 'service' as any, service);
}

/**
 * Get reviews by project ID
 */
export async function getReviewsByProject(projectId: string): Promise<Review[]> {
  const reviews = await getAllReviews();
  return filterByField(reviews, 'projectId' as any, projectId);
}

/**
 * Get verified reviews only
 */
export async function getVerifiedReviews(): Promise<Review[]> {
  const reviews = await getAllReviews();
  return filterByField(reviews, 'verified' as any, true);
}

/**
 * Get reviews by provider (manual, google, crm, etc.)
 */
export async function getReviewsByProvider(provider: ReviewProvider): Promise<Review[]> {
  const reviews = await getAllReviews();
  return filterByField(reviews, 'provider' as any, provider);
}

/**
 * Get latest reviews (sorted by date, most recent first)
 */
export async function getLatestReviews(limit?: number): Promise<Review[]> {
  const reviews = await getAllReviews();
  const sorted = [...reviews].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  return limit ? sorted.slice(0, limit) : sorted;
}

/**
 * Get review by ID
 */
export async function getReviewById(id: string): Promise<Review | null> {
  const reviews = await getAllReviews();
  return findById(reviews, id);
}

/**
 * P0 FIX: Resolve review media through public media gate
 * This prevents bypassing the public media gate by calling getMediaById directly
 * Returns a review with all media IDs resolved to validated Media objects
 */
export async function getReviewWithResolvedMedia(review: Review): Promise<Review> {
  const resolveMedia = async (mediaId: string | undefined): Promise<Media | undefined> => {
    if (!mediaId) return undefined;
    return await resolvePublicMedia(mediaId) || undefined;
  };

  const resolveMediaArray = async (mediaIds: string[]): Promise<Media[]> => {
    const resolved = await Promise.all(mediaIds.map(resolveMedia));
    return resolved.filter((m): m is Media => m !== undefined);
  };

  return {
    ...review,
    photosMedia: review.photos ? await resolveMediaArray(review.photos) : undefined,
  };
}

/**
 * P0 FIX: Resolve media for multiple reviews
 * This prevents bypassing the public media gate by calling getMediaById directly
 */
export async function getReviewsWithResolvedMedia(reviews: Review[]): Promise<Review[]> {
  return await Promise.all(reviews.map(getReviewWithResolvedMedia));
}

/**
 * Get review statistics
 */
export async function getReviewStats(): Promise<ReviewAggregate> {
  const reviews = await getAllReviews();
  const total = reviews.length;
  const averageRating = total > 0 
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / total 
    : 0;
  const verifiedCount = reviews.filter(r => r.verified).length;
  const featuredCount = reviews.filter(r => r.featured).length;
  
  // Count by rating
  const byRating = {
    5: reviews.filter(r => r.rating === 5).length,
    4: reviews.filter(r => r.rating === 4).length,
    3: reviews.filter(r => r.rating === 3).length,
    2: reviews.filter(r => r.rating === 2).length,
    1: reviews.filter(r => r.rating === 1).length,
  };
  
  // Count by provider
  const googleCount = reviews.filter(r => r.provider === ReviewProvider.Google).length;
  const manualCount = reviews.filter(r => r.provider === ReviewProvider.Manual).length;
  
  // Latest review
  const latestReview = [...reviews].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  )[0];
  
  return {
    average: Math.round(averageRating * 10) / 10,
    count: total,
    fiveStarCount: byRating[5],
    fourStarCount: byRating[4],
    threeStarCount: byRating[3],
    twoStarCount: byRating[2],
    oneStarCount: byRating[1],
    verifiedCount,
    featuredCount,
    googleCount,
    manualCount,
    latestReview,
  };
}

/**
 * Validate review structure
 */
export function validateReview(review: unknown): review is Review {
  if (!review || typeof review !== 'object') return false;
  
  const r = review as Partial<Review>;
  
  return (
    typeof r.id === 'string' &&
    typeof r.provider === 'string' &&
    typeof r.status === 'string' &&
    typeof r.featured === 'boolean' &&
    typeof r.verified === 'boolean' &&
    typeof r.reviewer === 'object' &&
    typeof r.reviewer.name === 'string' &&
    typeof r.rating === 'number' &&
    r.rating >= 1 && r.rating <= 5 &&
    typeof r.date === 'string' &&
    typeof r.service === 'string' &&
    typeof r.body === 'string'
  );
}

/**
 * Clear cache (useful for testing or hot reload)
 */
export function clearReviewsCache(): void {
  clearAuthorityCache("@/config/reviews.v1.json");
}
