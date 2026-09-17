/**
 * Shared Media Processing Constants
 *
 * This file contains authoritative constants for media processing
 * that must be used consistently across all materialization pipelines:
 * - /api/drive/ingest (Drive materialization)
 * - scripts/image-pipeline.mjs (filesystem pipeline)
 *
 * These constants define the NON-NEGOTIABLE contract for media renditions.
 */

/**
 * Required responsive image widths
 * Every PublishedMediaAsset must have WebP and AVIF renditions at these widths
 * (up to the source image's maximum width)
 */
export const RESPONSIVE_WIDTHS = [480, 768, 1080, 1600, 2000] as const;

/**
 * Thumbnail dimensions
 */
export const THUMBNAIL_WIDTH = 480;
export const THUMBNAIL_QUALITY = 70;

/**
 * Blur placeholder dimensions
 */
export const BLUR_WIDTH = 10;
export const BLUR_QUALITY = 30;

/**
 * WebP quality settings
 */
export const WEBP_QUALITY = 80;

/**
 * AVIF quality settings
 */
export const AVIF_QUALITY = 75;
