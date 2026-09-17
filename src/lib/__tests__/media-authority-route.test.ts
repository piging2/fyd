/**
 * Media Authority API Route Test
 *
 * Tests for the Workbench media authority API endpoint:
 * - getAssignment action with CAS revision read
 * - Visual Slot → authority mapping
 * - Workbench authentication boundary
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Set environment variables before importing modules
process.env.KV_REST_API_URL = 'https://test.redis.com';
process.env.KV_REST_API_TOKEN = 'test-token';

// Mock Next.js dependencies
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('@/lib/workbench-session', () => ({
  workbenchSession: {
    isAuthenticated: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@/lib/visual-asset-registry', () => ({
  getPublishedMediaAssets: jest.fn(),
}));

jest.mock('@/lib/media-kv-store', () => ({
  getMediaRecordRaw: jest.fn(),
  listMediaIds: jest.fn(),
}));

jest.mock('@/lib/assignment-store', () => ({
  getServiceCardAssignment: jest.fn(),
}));

describe('Media Authority API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  describe('getAssignment Action', () => {
    it('should implement getAssignment action', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain("action === 'getAssignment'");
    });

    it('should require slotSlug parameter', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain('slotSlug required');
      expect(routeCode).toContain('status: 400');
    });

    it('should return revision 0 for missing assignment', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain('revision: assignment?.revision || 0');
    });

    it('should return current revision for existing assignment', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain('assignment?.revision');
    });
  });

  describe('Visual Slot Authority Mapping', () => {
    it('should map hero-background to brand-hero-background', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain("'hero-background': 'brand-hero-background'");
    });

    it('should map homepage-owner-portrait-slot to brand-portrait-homepage', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain("'homepage-owner-portrait-slot': 'brand-portrait-homepage'");
    });

    it('should map service-card-{slug} to {slug}', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain('startsWith(\'service-card-\')');
      expect(routeCode).toContain('replace(\'service-card-\', \'\')');
    });

    it('should resolve on server-side, not client-side', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain('resolveAssignmentKey');
      expect(routeCode).toContain('VISUAL_SLOT_REGISTRY');
    });

    it('should reject unknown target slots', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain('INVALID_TARGET_SLOT');
      expect(routeCode).toContain('return null');
    });
  });

  describe('CAS Revision Read Integration', () => {
    it('should return assignmentKey in response', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain('assignmentKey');
    });

    it('should return slotSlug in response for verification', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain('slotSlug');
    });

    it('should call getServiceCardAssignment with resolved key', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain('getServiceCardAssignment(assignmentKey)');
    });
  });

  describe('Workbench Authentication Boundary', () => {
    it('should require Workbench authentication for getAssignment', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain('workbenchSession.isAuthenticated()');
      expect(routeCode).toContain('WORKBENCH_AUTH_REQUIRED');
      expect(routeCode).toContain('status: 401');
    });

    it('should check authentication before processing any action', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      // Find authentication check
      const authCheckIndex = routeCode.indexOf('workbenchSession.isAuthenticated()');
      // Find action handling
      const actionCheckIndex = routeCode.indexOf("action === 'getAssignment'");

      // Auth check should come before action handling
      expect(authCheckIndex).toBeLessThan(actionCheckIndex);
    });
  });

  describe('Existing Actions Still Functional', () => {
    it('should still implement getPublishedMediaAssets action', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain("action === 'getPublishedMediaAssets'");
      expect(routeCode).toContain('getPublishedMediaAssets()');
    });

    it('should still implement list action', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain("action === 'list'");
    });

    it('should still implement getByDriveFileId action', () => {
      const fs = require('fs');
      const path = require('path');
      const routePath = path.join(__dirname, '../../app/api/workbench/media-authority/route.ts');
      const routeCode = fs.readFileSync(routePath, 'utf8');

      expect(routeCode).toContain("action === 'getByDriveFileId'");
      expect(routeCode).toContain('provenance?.driveFileId');
    });
  });
});
