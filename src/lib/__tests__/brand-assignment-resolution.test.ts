/**
 * Brand Assignment Resolution Test
 *
 * Verifies that brand media functions check runtime assignments before static config.
 * This is a unit test that validates the logic path without requiring Redis.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock the assignment store
const mockGetServiceCardAssignment = jest.fn();
const mockResolvePublicMedia = jest.fn();
const mockIsStaticBuild = jest.fn();

jest.mock('@/lib/assignment-store', () => ({
  getServiceCardAssignment: mockGetServiceCardAssignment,
}));

jest.mock('@/lib/media', () => ({
  resolvePublicMedia: mockResolvePublicMedia,
  isStaticBuild: mockIsStaticBuild,
}));

// Import after mocking
import { getHomepageHero, getOwnerPortrait } from '../brand';

describe('Brand Assignment Resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getHomepageHero', () => {
    it('should use runtime assignment when available', async () => {
      const mockMedia = {
        id: 'test-media-id',
        lifecycleState: 'published',
        source: 'local',
        storage: 'static',
        contentHash: 'abc123',
        dimensions: { width: 1920, height: 1080 },
        variants: { original: '/images/test.jpg' },
        alt: 'Test media',
      };

      mockGetServiceCardAssignment.mockResolvedValue({
        serviceSlug: 'brand-hero-background',
        mediaId: 'test-media-id',
        source: 'workbench',
        updatedAt: new Date().toISOString(),
        revision: 1,
      });

      mockResolvePublicMedia.mockResolvedValue(mockMedia);

      const result = await getHomepageHero();

      expect(mockGetServiceCardAssignment).toHaveBeenCalledWith('brand-hero-background', expect.any(String));
      expect(mockResolvePublicMedia).toHaveBeenCalledWith('test-media-id');
      expect(result?.mediaId).toBe('test-media-id');
      expect(result?.resolvedMedia).toEqual(mockMedia);
    });

    it('should fall back to static config when no runtime assignment', async () => {
      const mockMedia = {
        id: 'static-media-id',
        lifecycleState: 'published',
        source: 'local',
        storage: 'static',
        contentHash: 'def456',
        dimensions: { width: 1920, height: 1080 },
        variants: { original: '/images/static.jpg' },
        alt: 'Static media',
      };

      mockGetServiceCardAssignment.mockResolvedValue(null);
      mockResolvePublicMedia.mockResolvedValue(mockMedia);

      const result = await getHomepageHero();

      expect(mockGetServiceCardAssignment).toHaveBeenCalledWith('brand-hero-background', expect.any(String));
      expect(mockResolvePublicMedia).toHaveBeenCalledWith('homepage-hero'); // Static config mediaId
      expect(result?.mediaId).toBe('homepage-hero');
      expect(result?.resolvedMedia).toEqual(mockMedia);
    });

    it('should reject invalid runtime assignment and fall back to static', async () => {
      const mockStaticMedia = {
        id: 'static-media-id',
        lifecycleState: 'published',
        source: 'local',
        storage: 'static',
        contentHash: 'def456',
        dimensions: { width: 1920, height: 1080 },
        variants: { original: '/images/static.jpg' },
        alt: 'Static media',
      };

      // Runtime assignment exists but media doesn't resolve
      mockGetServiceCardAssignment.mockResolvedValue({
        serviceSlug: 'brand-hero-background',
        mediaId: 'invalid-media-id',
        source: 'workbench',
        updatedAt: new Date().toISOString(),
        revision: 1,
      });

      mockResolvePublicMedia
        .mockResolvedValueOnce(null) // Invalid runtime assignment
        .mockResolvedValueOnce(mockStaticMedia); // Valid static fallback

      const result = await getHomepageHero();

      expect(mockResolvePublicMedia).toHaveBeenCalledTimes(2);
      expect(result?.mediaId).toBe('homepage-hero');
      expect(result?.resolvedMedia).toEqual(mockStaticMedia);
    });

    it('should throw when assignment store is unavailable (production failure)', async () => {
      mockGetServiceCardAssignment.mockRejectedValue(new Error('Redis connection failed'));
      mockIsStaticBuild.mockReturnValue(false); // Runtime, not static build

      await expect(getHomepageHero()).rejects.toThrow('Assignment store unavailable');
    });

    it('should allow static fallback for DEV_MODE_SKIP_KV (development only)', async () => {
      const mockStaticMedia = {
        id: 'static-media-id',
        lifecycleState: 'published',
        source: 'local',
        storage: 'static',
        contentHash: 'def456',
        dimensions: { width: 1920, height: 1080 },
        variants: { original: '/images/static.jpg' },
        alt: 'Static media',
      };

      mockGetServiceCardAssignment.mockRejectedValue(new Error('DEV_MODE_SKIP_KV: KV operations skipped'));
      mockResolvePublicMedia.mockResolvedValue(mockStaticMedia);
      mockIsStaticBuild.mockReturnValue(false); // Runtime, not static build

      const result = await getHomepageHero();

      expect(result?.mediaId).toBe('homepage-hero');
      expect(result?.resolvedMedia).toEqual(mockStaticMedia);
    });

    it('should return null mediaId when no valid media found', async () => {
      mockGetServiceCardAssignment.mockResolvedValue(null);
      mockResolvePublicMedia.mockResolvedValue(null);

      const result = await getHomepageHero();

      expect(result?.mediaId).toBeNull();
    });
  });

  describe('getOwnerPortrait', () => {
    it('should use runtime assignment when available', async () => {
      const mockMedia = {
        id: 'test-portrait-id',
        lifecycleState: 'published',
        source: 'local',
        storage: 'static',
        contentHash: 'xyz789',
        dimensions: { width: 800, height: 600 },
        variants: { original: '/images/portrait.jpg' },
        alt: 'Test portrait',
      };

      mockGetServiceCardAssignment.mockResolvedValue({
        serviceSlug: 'brand-portrait-homepage',
        mediaId: 'test-portrait-id',
        source: 'workbench',
        updatedAt: new Date().toISOString(),
        revision: 1,
      });

      mockResolvePublicMedia.mockResolvedValue(mockMedia);

      const result = await getOwnerPortrait();

      expect(mockGetServiceCardAssignment).toHaveBeenCalledWith('brand-portrait-homepage', expect.any(String));
      expect(mockResolvePublicMedia).toHaveBeenCalledWith('test-portrait-id');
      expect(result?.mediaId).toBe('test-portrait-id');
      expect(result?.resolvedMedia).toEqual(mockMedia);
    });

    it('should fall back to static config when no runtime assignment', async () => {
      const mockMedia = {
        id: 'static-portrait-id',
        lifecycleState: 'published',
        source: 'local',
        storage: 'static',
        contentHash: 'uvw101',
        dimensions: { width: 800, height: 600 },
        variants: { original: '/images/static-portrait.jpg' },
        alt: 'Static portrait',
      };

      mockGetServiceCardAssignment.mockResolvedValue(null);
      mockResolvePublicMedia.mockResolvedValue(mockMedia);

      const result = await getOwnerPortrait();

      expect(mockGetServiceCardAssignment).toHaveBeenCalledWith('brand-portrait-homepage', expect.any(String));
      expect(mockResolvePublicMedia).toHaveBeenCalledWith('brand-portrait'); // Static config mediaId
      expect(result?.mediaId).toBe('brand-portrait');
      expect(result?.resolvedMedia).toEqual(mockMedia);
    });

    it('should return null mediaId when no valid media found', async () => {
      mockGetServiceCardAssignment.mockResolvedValue(null);
      mockResolvePublicMedia.mockResolvedValue(null);

      const result = await getOwnerPortrait();

      expect(result?.mediaId).toBeNull();
    });

    it('should throw when assignment store is unavailable (production failure)', async () => {
      mockGetServiceCardAssignment.mockRejectedValue(new Error('Redis connection failed'));
      mockIsStaticBuild.mockReturnValue(false); // Runtime, not static build

      await expect(getOwnerPortrait()).rejects.toThrow('Assignment store unavailable');
    });

    it('should allow static fallback for DEV_MODE_SKIP_KV (development only)', async () => {
      const mockStaticMedia = {
        id: 'static-portrait-id',
        lifecycleState: 'published',
        source: 'local',
        storage: 'static',
        contentHash: 'uvw101',
        dimensions: { width: 800, height: 600 },
        variants: { original: '/images/static-portrait.jpg' },
        alt: 'Static portrait',
      };

      mockGetServiceCardAssignment.mockRejectedValue(new Error('DEV_MODE_SKIP_KV: KV operations skipped'));
      mockResolvePublicMedia.mockResolvedValue(mockStaticMedia);
      mockIsStaticBuild.mockReturnValue(false); // Runtime, not static build

      const result = await getOwnerPortrait();

      expect(result?.mediaId).toBe('brand-portrait');
      expect(result?.resolvedMedia).toEqual(mockStaticMedia);
    });
  });
});
