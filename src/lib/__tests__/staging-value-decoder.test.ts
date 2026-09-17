/**
 * Staging Value Decoder Regression Test
 *
 * Tests the authoritative staging-value decoder for Redis object/string handling.
 * Upstash Redis can return values as either JSON strings or already-deserialized objects.
 * This test ensures both representations produce the exact same normalized staging record.
 *
 * P0 FIX: Prevents [object Object] media ID error caused by String(value) coercion.
 */

import { describe, it, expect } from '@jest/globals';

/**
 * Authoritative staging-value decoder (copied from deploy route for testing)
 */
function parseStagingValue(value: unknown): { mediaId: string; expectedRevision: number; updatedAt: string; source: string } {
  let parsed: unknown;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch (e) {
      throw new Error(`Invalid staging value: string is not valid JSON and legacy format is not supported`);
    }
  } else if (typeof value === 'object' && value !== null) {
    // Upstash returned an already-deserialized object
    parsed = value;
  } else {
    throw new Error(`Invalid staging value: unexpected type ${typeof value}`);
  }

  // Validate the parsed structure
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid staging value: parsed result is not an object');
  }

  const staging = parsed as Record<string, unknown>;

  // Validate required fields
  if (typeof staging.mediaId !== 'string') {
    throw new Error(`Invalid staging value: mediaId is missing or not a string (got ${typeof staging.mediaId})`);
  }

  if (typeof staging.expectedRevision !== 'number') {
    throw new Error(`Invalid staging value: expectedRevision is missing or not a number (got ${typeof staging.expectedRevision})`);
  }

  if (typeof staging.updatedAt !== 'string') {
    throw new Error(`Invalid staging value: updatedAt is missing or not a string (got ${typeof staging.updatedAt})`);
  }

  if (typeof staging.source !== 'string') {
    throw new Error(`Invalid staging value: source is missing or not a string (got ${typeof staging.source})`);
  }

  return {
    mediaId: staging.mediaId,
    expectedRevision: staging.expectedRevision,
    updatedAt: staging.updatedAt,
    source: staging.source,
  };
}

describe('Staging Value Decoder Regression Test', () => {
  const testStagingRecord = {
    mediaId: '6fd33914d4c27fbf71871bbc6405ff1c',
    expectedRevision: 11,
    updatedAt: '2026-09-15T21:47:36.777Z',
    source: 'workbench',
  };

  describe('Case A: Redis returns JSON string', () => {
    it('should decode JSON string representation correctly', () => {
      const jsonString = JSON.stringify(testStagingRecord);
      const result = parseStagingValue(jsonString);

      expect(result.mediaId).toBe(testStagingRecord.mediaId);
      expect(result.expectedRevision).toBe(testStagingRecord.expectedRevision);
      expect(result.updatedAt).toBe(testStagingRecord.updatedAt);
      expect(result.source).toBe(testStagingRecord.source);
    });

    it('should reject invalid JSON string', () => {
      const invalidString = 'not a valid json string';
      expect(() => parseStagingValue(invalidString)).toThrow('Invalid staging value: string is not valid JSON');
    });

    it('should reject JSON string with missing mediaId', () => {
      const incompleteRecord = { expectedRevision: 11, updatedAt: '2026-09-15T21:47:36.777Z', source: 'workbench' };
      const jsonString = JSON.stringify(incompleteRecord);
      expect(() => parseStagingValue(jsonString)).toThrow('mediaId is missing or not a string');
    });

    it('should reject JSON string with wrong mediaId type', () => {
      const invalidRecord = { ...testStagingRecord, mediaId: 12345 };
      const jsonString = JSON.stringify(invalidRecord);
      expect(() => parseStagingValue(jsonString)).toThrow('mediaId is missing or not a string');
    });
  });

  describe('Case B: Redis returns already-deserialized object', () => {
    it('should decode object representation correctly', () => {
      const result = parseStagingValue(testStagingRecord);

      expect(result.mediaId).toBe(testStagingRecord.mediaId);
      expect(result.expectedRevision).toBe(testStagingRecord.expectedRevision);
      expect(result.updatedAt).toBe(testStagingRecord.updatedAt);
      expect(result.source).toBe(testStagingRecord.source);
    });

    it('should reject object with missing mediaId', () => {
      const incompleteRecord = { expectedRevision: 11, updatedAt: '2026-09-15T21:47:36.777Z', source: 'workbench' };
      expect(() => parseStagingValue(incompleteRecord)).toThrow('mediaId is missing or not a string');
    });

    it('should reject object with wrong mediaId type', () => {
      const invalidRecord = { ...testStagingRecord, mediaId: 12345 };
      expect(() => parseStagingValue(invalidRecord)).toThrow('mediaId is missing or not a string');
    });
  });

  describe('Both representations produce identical output', () => {
    it('should produce exact same normalized record from both representations', () => {
      const jsonString = JSON.stringify(testStagingRecord);
      const stringResult = parseStagingValue(jsonString);
      const objectResult = parseStagingValue(testStagingRecord);

      expect(stringResult).toEqual(objectResult);
      expect(stringResult.mediaId).toBe('6fd33914d4c27fbf71871bbc6405ff1c');
      expect(stringResult.expectedRevision).toBe(11);
    });
  });

  describe('Explicitly test that String(object) is NEVER used', () => {
    it('should reject String(object) coercion explicitly', () => {
      const object = testStagingRecord;
      const coercedString = String(object);

      // This is what the old buggy code would produce
      expect(coercedString).toBe('[object Object]');

      // The new decoder should reject this
      expect(() => parseStagingValue(coercedString)).toThrow('Invalid staging value: string is not valid JSON');
    });

    it('should reject null value', () => {
      expect(() => parseStagingValue(null)).toThrow('Invalid staging value: unexpected type object');
    });

    it('should reject undefined value', () => {
      expect(() => parseStagingValue(undefined)).toThrow('Invalid staging value: unexpected type undefined');
    });

    it('should reject number value', () => {
      expect(() => parseStagingValue(12345)).toThrow('Invalid staging value: unexpected type number');
    });

    it('should reject boolean value', () => {
      expect(() => parseStagingValue(true)).toThrow('Invalid staging value: unexpected type boolean');
    });
  });

  describe('Field validation', () => {
    it('should reject wrong expectedRevision type', () => {
      const invalidRecord = { ...testStagingRecord, expectedRevision: '11' };
      expect(() => parseStagingValue(invalidRecord)).toThrow('expectedRevision is missing or not a number');
    });

    it('should reject wrong updatedAt type', () => {
      const invalidRecord = { ...testStagingRecord, updatedAt: 12345 };
      expect(() => parseStagingValue(invalidRecord)).toThrow('updatedAt is missing or not a string');
    });

    it('should reject wrong source type', () => {
      const invalidRecord = { ...testStagingRecord, source: 12345 };
      expect(() => parseStagingValue(invalidRecord)).toThrow('source is missing or not a string');
    });
  });
});
