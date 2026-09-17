/**
 * Media Authority - Single Media Database
 * 
 * media.v1.json is the central media database.
 * Every image belongs to ONE media database.
 * Never duplicate metadata.
 * 
 * Architecture Principle: Type-safe lifecycle boundaries
 * - DriveReference: Source metadata only, never enters public presentation
 * - MaterializingMedia: Bytes in progress, never enters public presentation
 * - PublishedMediaAsset: Fully validated public asset, only this enters website
 * - StaleMedia: Needs refresh, never enters public presentation
 * 
 * IMPORTANT: These are discriminated union types. Media is the union of all lifecycle states.
 * Type guards provide runtime discrimination for type narrowing.
 */

export type MediaRole = "hero" | "before" | "after" | "detail" | "progress" | "gallery" | "brand" | "portrait" | "logo";

export type MediaType = "image" | "video" | "document";

export type MediaOrientation = "landscape" | "portrait" | "square";

/**
 * Media Lifecycle States
 * 
 * SOURCE_REFERENCE: Drive metadata only, no bytes downloaded
 * MATERIALIZING: Bytes downloaded, content hash computed
 * MATERIALIZED: Master stored in Blob, derivatives ready
 * RENDITION_READY: All presentation variants generated
 * PUBLISHED: Available in production CDN
 * STALE: Master or derivatives need refresh
 */
export type MediaLifecycleState = 
  | 'source_reference'   // Drive metadata only
  | 'materializing'      // Downloading bytes
  | 'materialized'       // Master in Blob
  | 'rendition_ready'    // Derivatives generated
  | 'published'          // CDN available
  | 'stale';             // Needs refresh

export interface MediaDimensions {
  width: number;
  height: number;
}

export interface MediaVariants {
  original?: string;
  webp?: string;
  avif?: string;
  thumbnail?: string;
  blur?: string; // Base64 blur data URL
  web?: string; // Simplified web variant for vertical slice
  responsive?: Array<{
    width: number;
    webp: string;
    avif: string;
  }>;
}

/**
 * Base Media interface - shared fields across all lifecycle states
 * 
 * This is the foundation interface that all lifecycle states extend.
 * It contains fields that are common to all states.
 */
interface BaseMedia {
  id: string;
  filename: string;
  type: MediaType;
  orientation: MediaOrientation;
  alt: string;
  description?: string;
  tags: string[];
  roles: MediaRole[]; // Required across all lifecycle states
  createdAt?: string;
  uploadedAt?: string;
  fileSize?: number;
  format?: string;
  colorSpace?: string;
  storage?: 'static' | 'blob'; // Storage authority: static files vs Blob materialization
}

/**
 * DriveReference - Source metadata only, never enters public presentation
 * 
 * Purpose: Workbench can browse/manage Drive references
 * Invariant: Cannot cross the public media boundary
 */
export interface DriveReference extends BaseMedia {
  lifecycleState: 'source_reference';
  sourceIdentityHash: string; // Hash of source identity (fileId + driveId)
  source: 'google-drive';
  drive: {
    fileId: string;
    driveId?: string; // Shared Drive ID if applicable
    corpusId?: string; // P0 FIX: Preserve corpus context to prevent Shared Drive → My Drive drift
    name: string;
    mimeType: string;
    webViewUrl?: string;
    modifiedTime?: string;
  };
  dimensions?: MediaDimensions; // Optional for source references
  variants?: MediaVariants; // Optional for source references
}

/**
 * MaterializingMedia - Bytes in progress, never enters public presentation
 * 
 * Purpose: Track download/transcode progress
 * Invariant: Cannot cross the public media boundary
 */
export interface MaterializingMedia extends BaseMedia {
  lifecycleState: 'materializing';
  contentHash: string; // SHA-256 hash of actual bytes
  source: 'google-drive' | 'local';
  drive?: {
    fileId: string;
    driveId?: string;
    corpusId?: string; // P0 FIX: Preserve corpus context to prevent Shared Drive → My Drive drift
    name: string;
    mimeType: string;
    webViewUrl?: string;
    modifiedTime?: string;
  };
  dimensions?: MediaDimensions; // Required once materialized
  variants?: MediaVariants; // Required once materialized
}

/**
 * PublishedMediaAsset - Fully validated public asset, only this enters website
 * 
 * Purpose: Public presentation - invariant: cannot contain Drive URLs
 * 
 * REQUIRED fields for published media:
 * - id: stable immutable identity
 * - contentHash: SHA-256 of actual bytes
 * - dimensions: non-zero width/height
 * - lifecycleState: 'published'
 * - source: 'local' (Drive-backed assets cannot be published)
 * - variants.original: actual public URL (not Drive proxy)
 * - No thumbnailProxyUrl
 * - No /api/drive/* URLs
 * - No drive field
 */
export interface PublishedMediaAsset extends BaseMedia {
  contentHash: string; // SHA-256 hash of actual bytes (REQUIRED)
  source: 'local'; // Published assets must be local (REQUIRED)
  lifecycleState: 'published'; // Only published state allowed (REQUIRED)
  dimensions: MediaDimensions; // Non-zero dimensions (REQUIRED)
  variants: MediaVariants; // At least one valid rendition (REQUIRED)
  provenance?: {
    august3_driveId?: string;
    sharedDriveId?: string;
    driveFileId?: string; // CONSTITUTIONAL FIX: Authoritative Drive file ID for reconciliation
    originalShortcutId?: string; // P0 FIX: Preserve shortcut provenance for resolution tracking
    match_type?: string;
    confidence?: string;
    drive_canonical?: boolean;
    physical_deployment?: boolean;
    status?: string;
    current_authority?: boolean;
    preserved_at?: string;
  };
}

/**
 * StaleMedia - Needs refresh, never enters public presentation
 * 
 * Purpose: Track assets that need re-materialization
 * Invariant: Cannot cross the public media boundary
 */
export interface StaleMedia extends BaseMedia {
  lifecycleState: 'stale';
  contentHash: string; // Previous content hash
  source: 'google-drive' | 'local';
  drive?: {
    fileId: string;
    driveId?: string;
    corpusId?: string; // P0 FIX: Preserve corpus context to prevent Shared Drive → My Drive drift
    name: string;
    mimeType: string;
    webViewUrl?: string;
    modifiedTime?: string;
  };
  dimensions: MediaDimensions;
  variants: MediaVariants;
}

/**
 * Media - Discriminated union of all lifecycle states
 * 
 * This is the type-safe union that represents all possible media states.
 * Use type guards to narrow to specific lifecycle states.
 * 
 * Legacy additional fields for backward compatibility with media.v1.json
 */
export interface Media extends BaseMedia {
  contentHash?: string; // SHA-256 hash of actual bytes (null for source_reference)
  sourceIdentityHash?: string; // Hash of source identity (fileId + driveId) for source_reference
  source?: 'google-drive' | 'local'; // Source of the asset
  lifecycleState?: MediaLifecycleState; // Explicit lifecycle state
  drive?: {
    fileId: string;
    driveId?: string; // Shared Drive ID if applicable
    corpusId?: string; // P0 FIX: Preserve corpus context to prevent Shared Drive → My Drive drift
    name: string;
    mimeType: string;
    webViewUrl?: string;
    modifiedTime?: string;
  };
  dimensions: MediaDimensions;
  variants: MediaVariants;

  // Classification
  service?: string;
  city?: string;
  county?: string;
  state?: string;
  projectId?: string;

  // Roles
  roles: MediaRole[];

  // Ordering
  order?: number; // Display order within project

  // Editorial
  featured?: boolean;
  heroEligible?: boolean;
  homepageEligible?: boolean;

  // Metadata
  updatedAt?: string; // ISO date string

  // Provenance (for reconciliation tracking)
  provenance?: {
    august3_driveId?: string;
    sharedDriveId?: string; // Shared Drive context (corpus/metadata, not file identity)
    driveFileId?: string; // CONSTITUTIONAL FIX: Authoritative Drive file ID for reconciliation
    originalShortcutId?: string; // P0 FIX: Preserve shortcut provenance for resolution tracking
    match_type?: string;
    confidence?: string;
    drive_canonical?: boolean;
    physical_deployment?: boolean;
    status?: string;
    current_authority?: boolean;
    preserved_at?: string;
  };
}

/**
 * Type guards for lifecycle states
 * 
 * These are runtime predicates that check the lifecycleState field.
 * NOTE: These return boolean, not type predicates, due to Media union type incompatibility.
 * The Media type requires dimensions, but some lifecycle states have optional dimensions.
 * Type predicates require the predicate type to be assignable to the parameter type.
 * 
 * Future improvement: Restructure type hierarchy to support proper type predicates.
 */
export function isDriveReference(media: Media): boolean {
  return media.lifecycleState === 'source_reference';
}

export function isMaterializingMedia(media: Media): boolean {
  return media.lifecycleState === 'materializing';
}

export function isPublishedMediaAsset(media: Media): boolean {
  // CRITICAL: Constitutional validation for PublishedMediaAsset
  // Only PublishedMediaAsset can cross the public boundary
  // Static storage assets don't require Blob metadata
  // Blob storage assets require Blob metadata (enforced in verifyPublicMediaAuthority)
  return media.lifecycleState === 'published' && 
         media.source === 'local' && 
         typeof media.contentHash === 'string' &&
         media.contentHash.length > 0 &&
         media.dimensions.width > 0 &&
         media.dimensions.height > 0 &&
         !media.drive && // No Drive dependency
         !media.id.startsWith('drive-') && // No drive- prefix (reserved for DriveReference)
         !media.id.startsWith('drive-ref-'); // No drive-ref- prefix (reserved for DriveReference)
}

export function isStaleMedia(media: Media): boolean {
  return media.lifecycleState === 'stale';
}

export interface MediaManifest {
  version: string;
  generatedAt: string;
  media: Media[];
}
