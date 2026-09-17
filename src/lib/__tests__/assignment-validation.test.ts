/**
 * Assignment Validation Tests
 * 
 * Tests for ServiceCardAssignment schema validation
 * Focus on fail-closed behavior for malformed actor values
 */

import { validateServiceCardAssignment, type ServiceCardAssignment } from '../assignment-store';

describe('ServiceCardAssignment Validation', () => {
  const baseAssignment: ServiceCardAssignment = {
    serviceSlug: 'test-service',
    mediaId: 'test-media-id',
    updatedAt: new Date().toISOString(),
    source: 'workbench',
  };

  describe('actor field validation', () => {
    it('should accept valid actor values', () => {
      const validActors: Array<'workbench' | 'reconciliation' | 'migration'> = ['workbench', 'reconciliation', 'migration'];
      
      for (const actor of validActors) {
        const assignment = { ...baseAssignment, actor };
        expect(validateServiceCardAssignment(assignment)).toBe(true);
      }
    });

    it('should accept assignment without actor field', () => {
      const assignment = { ...baseAssignment };
      expect(validateServiceCardAssignment(assignment)).toBe(true);
    });

    it('should reject numeric actor value', () => {
      const assignment = { ...baseAssignment, actor: 123 as any };
      expect(validateServiceCardAssignment(assignment)).toBe(false);
    });

    it('should reject object actor value', () => {
      const assignment = { ...baseAssignment, actor: {} as any };
      expect(validateServiceCardAssignment(assignment)).toBe(false);
    });

    it('should reject boolean actor value', () => {
      const assignment = { ...baseAssignment, actor: true as any };
      expect(validateServiceCardAssignment(assignment)).toBe(false);
    });

    it('should reject null actor value', () => {
      const assignment = { ...baseAssignment, actor: null as any };
      expect(validateServiceCardAssignment(assignment)).toBe(false);
    });

    it('should reject invalid string actor value', () => {
      const assignment = { ...baseAssignment, actor: 'invalid' as any };
      expect(validateServiceCardAssignment(assignment)).toBe(false);
    });

    it('should reject array actor value', () => {
      const assignment = { ...baseAssignment, actor: [] as any };
      expect(validateServiceCardAssignment(assignment)).toBe(false);
    });
  });

  describe('source field validation', () => {
    it('should require source to be "workbench"', () => {
      const assignment = { ...baseAssignment, source: 'workbench' };
      expect(validateServiceCardAssignment(assignment)).toBe(true);
    });

    it('should reject source that is not "workbench"', () => {
      const assignment = { ...baseAssignment, source: 'invalid' as any };
      expect(validateServiceCardAssignment(assignment)).toBe(false);
    });
  });

  describe('required field validation', () => {
    it('should reject missing serviceSlug', () => {
      const { serviceSlug, ...assignment } = baseAssignment;
      expect(validateServiceCardAssignment(assignment as any)).toBe(false);
    });

    it('should reject missing mediaId', () => {
      const { mediaId, ...assignment } = baseAssignment;
      expect(validateServiceCardAssignment(assignment as any)).toBe(false);
    });

    it('should reject missing updatedAt', () => {
      const { updatedAt, ...assignment } = baseAssignment;
      expect(validateServiceCardAssignment(assignment as any)).toBe(false);
    });

    it('should reject missing source', () => {
      const { source, ...assignment } = baseAssignment;
      expect(validateServiceCardAssignment(assignment as any)).toBe(false);
    });
  });
});