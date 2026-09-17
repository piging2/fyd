/**
 * Constitutional Projection Types
 * 
 * Type definitions for projection artifacts that React components consume.
 * These are read-only types for static JSON imports.
 */

export interface HeroProjection {
  projectionId: string;
  schemaVersion: string;
  projectionVersion: string;
  scoringVersion: string;
  canonicalGraphVersion: string;
  generatorVersion: string;
  inputHash: string;
  generatedAt: string;
  generatedHash: string;
  hero: {
    heroMediaId: string;
    filename: string;
    dimensions: string;
    score: number;
  };
}

export interface GalleryProjection {
  projectionId: string;
  schemaVersion: string;
  projectionVersion: string;
  scoringVersion: string;
  canonicalGraphVersion: string;
  generatorVersion: string;
  inputHash: string;
  generatedAt: string;
  generatedHash: string;
  projects: Array<{
    projectId: string;
    projectName: string;
    galleryRepresentative: string;
    supportingGalleryEvidence: string[];
    galleryOrder: number;
    coverage: 'COMPLETE' | 'AFTER_ONLY' | 'BEFORE_ONLY' | 'UNKNOWN';
  }>;
}

export interface ServiceProjection {
  projectionId: string;
  schemaVersion: string;
  projectionVersion: string;
  scoringVersion: string;
  canonicalGraphVersion: string;
  generatorVersion: string;
  inputHash: string;
  generatedAt: string;
  generatedHash: string;
  services: Array<{
    serviceName: string;
    serviceRepresentative: string;
    supportingServiceEvidence: string[];
  }>;
}
