/**
 * System Status Subsystem
 * 
 * Monitors runtime state of integrations and automation systems.
 * This is separate from authority validation - it tracks operational status.
 * 
 * Architecture: System Status → Dashboard
 * 
 * This is runtime state, not authority state.
 */

import type { MediaManifest } from "@/types/media";

export interface SystemStatus {
  googleDrive: GoogleDriveStatus;
  variantGeneration: VariantGenerationStatus;
  exifExtraction: ExifExtractionStatus;
  overallStatus: "operational" | "partial" | "offline";
  lastChecked: string;
}

export interface GoogleDriveStatus {
  enabled: boolean;
  lastSync?: string;
  status: "active" | "inactive" | "error";
  lastError?: string;
  syncInterval?: number; // minutes
}

export interface VariantGenerationStatus {
  totalMedia: number;
  mediaWithVariants: number;
  coveragePercentage: number;
  lastGenerated?: string;
  queueSize?: number;
  processing?: boolean;
}

export interface ExifExtractionStatus {
  totalMedia: number;
  mediaWithExif: number;
  coveragePercentage: number;
  lastExtracted?: string;
  queueSize?: number;
  processing?: boolean;
}

/**
 * Get current system status
 */
export function getSystemStatus(media: MediaManifest): SystemStatus {
  const totalMedia = media.media.length;
  const mediaWithVariants = media.media.filter(m => m.variants && Object.keys(m.variants).length > 0).length;
  const mediaWithExif = media.media.filter(m => m.dimensions || m.orientation).length;

  const variantGenerationStatus: VariantGenerationStatus = {
    totalMedia,
    mediaWithVariants,
    coveragePercentage: totalMedia > 0 ? Math.round((mediaWithVariants / totalMedia) * 100) : 0,
  };

  const exifExtractionStatus: ExifExtractionStatus = {
    totalMedia,
    mediaWithExif,
    coveragePercentage: totalMedia > 0 ? Math.round((mediaWithExif / totalMedia) * 100) : 0,
  };

  const googleDriveStatus: GoogleDriveStatus = {
    enabled: false,
    status: "inactive",
  };

  // Determine overall status
  let overallStatus: "operational" | "partial" | "offline" = "offline";
  if (googleDriveStatus.enabled && googleDriveStatus.status === "active") {
    overallStatus = "operational";
  } else if (variantGenerationStatus.coveragePercentage > 50 || exifExtractionStatus.coveragePercentage > 50) {
    overallStatus = "partial";
  }

  return {
    googleDrive: googleDriveStatus,
    variantGeneration: variantGenerationStatus,
    exifExtraction: exifExtractionStatus,
    overallStatus,
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Update Google Drive sync status
 */
export function updateGoogleDriveStatus(params: {
  enabled: boolean;
  lastSync?: string;
  status: "active" | "inactive" | "error";
  lastError?: string;
  syncInterval?: number;
}): GoogleDriveStatus {
  return {
    enabled: params.enabled,
    lastSync: params.lastSync,
    status: params.status,
    lastError: params.lastError,
    syncInterval: params.syncInterval,
  };
}

/**
 * Update variant generation status
 */
export function updateVariantGenerationStatus(params: {
  totalMedia: number;
  mediaWithVariants: number;
  lastGenerated?: string;
  queueSize?: number;
  processing?: boolean;
}): VariantGenerationStatus {
  const coveragePercentage = params.totalMedia > 0 
    ? Math.round((params.mediaWithVariants / params.totalMedia) * 100) 
    : 0;

  return {
    totalMedia: params.totalMedia,
    mediaWithVariants: params.mediaWithVariants,
    coveragePercentage,
    lastGenerated: params.lastGenerated,
    queueSize: params.queueSize,
    processing: params.processing,
  };
}

/**
 * Update EXIF extraction status
 */
export function updateExifExtractionStatus(params: {
  totalMedia: number;
  mediaWithExif: number;
  lastExtracted?: string;
  queueSize?: number;
  processing?: boolean;
}): ExifExtractionStatus {
  const coveragePercentage = params.totalMedia > 0 
    ? Math.round((params.mediaWithExif / params.totalMedia) * 100) 
    : 0;

  return {
    totalMedia: params.totalMedia,
    mediaWithExif: params.mediaWithExif,
    coveragePercentage,
    lastExtracted: params.lastExtracted,
    queueSize: params.queueSize,
    processing: params.processing,
  };
}
