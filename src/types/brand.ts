/**
 * Brand Authority - Company Branding Assets
 * 
 * brand.v1.json owns all company branding:
 * - Homepage hero
 * - Owner portraits
 * - Team photos
 * - Logos
 * - Office photography
 * - Marketing assets
 * 
 * Separated from Media Authority to prevent project photos
 * from becoming mixed with company branding over time.
 */

import type { Media } from './media';

export interface BrandAsset {
  id: string;
  mediaId: string | null;
  alt: string;
  resolvedMedia?: Media; // P1 FIX: Pre-validated media object (passed public media gate)
}

export interface BrandHero {
  id: string;
  mediaId: string | null;
  alt: string;
  fallback: {
    gradient: boolean;
    overlay: boolean;
  };
  resolvedMedia?: Media; // P1 FIX: Pre-validated media object (passed public media gate)
}

export interface BrandOwnerPortrait {
  id: string;
  mediaId: string | null;
  alt: string;
  names: string[];
  resolvedMedia?: Media; // P1 FIX: Pre-validated media object (passed public media gate)
}

export interface BrandManifest {
  version: string;
  generatedAt: string;
  homepageHero: BrandHero;
  ownerPortrait: BrandOwnerPortrait;
  logo: BrandAsset;
  team: BrandAsset[];
  office: BrandAsset;
  marketingAssets: BrandAsset[];
}
