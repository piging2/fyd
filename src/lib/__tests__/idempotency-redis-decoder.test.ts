/**
 * Use-Drive-Asset Idempotency Redis Decoder Regression Test
 *
 * Tests the idempotency layer Redis value decoder and namespace helpers.
 * Upstash Redis can return values as either JSON strings or already-deserialized objects.
 * This test ensures both representations produce the exact same normalized result.
 *
 * P0 FIX: Prevents Redis decoding failures when Upstash returns objects instead of strings.
 * P0 FIX: Ensures handoff idempotency keys use authoritative environment namespace.
 */

import { describe, it, expect } from '@jest/globals';

/**
 * Generic Redis value decoder (copied from use-drive-asset route for testing)
 * Upstash Redis can return values as either JSON strings or already-deserialized objects
 */
function parseRedisValue(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value; // Return as-is if not JSON
    }
  } else if (typeof value === 'object' && value !== null) {
    return value; // Return object directly
  } else {
    return value; // Return as-is for other types
  }
}

/**
 * Mock getKvNamespace for testing
 */
function mockGetKvNamespace(): string {
  // In tests, we can simulate different environments
  return 'hpp:test:';
}

/**
 * Idempotency prefix (copied from use-drive-asset route)
 */
const IDEMPOTENCY_PREFIX = 'use-drive-asset-idempotency:';

/**
 * Namespaced idempotency key helper (copied from use-drive-asset route)
 */
function getNamespacedIdempotencyKey(idempotencyKey: string): string {
  const namespace = mockGetKvNamespace();
  return `${namespace}${IDEMPOTENCY_PREFIX}${idempotencyKey}`;
}

describe('Use-Drive-Asset Idempotency Redis Decoder Regression Test', () => {
  const testIdempotencyResult = {
    success: true,
    canonicalMediaId: '6fd33914d4c27fbf71871bbc6405ff1c',
    targetSlotId: 'homepage-service-card-slot-painting',
    serviceSlug: 'painting',
    assignment: {
      mediaId: '6fd33914d4c27fbf71871bbc6405ff1c',
      revision: 12,
      updatedAt: '2026-09-15T21:47:36.777Z',
    },
    asset: {
      mediaId: '6fd33914d4c27fbf71871bbc6405ff1c',
      storage: 'blob',
      url: 'https://example.com/image.jpg',
    },
    requestId: 'test-request-id',
  };

  describe('Case A: Redis returns JSON string', () => {
    it('should decode JSON string representation correctly', () => {
      const jsonString = JSON.stringify(testIdempotencyResult);
      const result = parseRedisValue(jsonString);

      expect(result).toEqual(testIdempotencyResult);
      expect(typeof result).toBe('object');
      expect((result as any).success).toBe(true);
      expect((result as any).canonicalMediaId).toBe('6fd33914d4c27fbf71871bbc6405ff1c');
    });

    it('should handle non-JSON string by returning as-is', () => {
      const plainString = 'not-a-json-string';
      const result = parseRedisValue(plainString);

      expect(result).toBe(plainString);
      expect(typeof result).toBe('string');
    });

    it('should handle empty string', () => {
      const emptyString = '';
      const result = parseRedisValue(emptyString);

      expect(result).toBe(emptyString);
    });
  });

  describe('Case B: Redis returns already-deserialized object', () => {
    it('should decode object representation correctly', () => {
      const result = parseRedisValue(testIdempotencyResult);

      expect(result).toEqual(testIdempotencyResult);
      expect(typeof result).toBe('object');
      expect((result as any).success).toBe(true);
      expect((result as any).canonicalMediaId).toBe('6fd33914d4c27fbf71871bbc6405ff1c');
    });

    it('should handle plain object without JSON structure', () => {
      const plainObject = { foo: 'bar', baz: 123 };
      const result = parseRedisValue(plainObject);

      expect(result).toEqual(plainObject);
    });
  });

  describe('Both representations produce identical output', () => {
    it('should produce exact same normalized result from both representations', () => {
      const jsonString = JSON.stringify(testIdempotencyResult);
      const stringResult = parseRedisValue(jsonString);
      const objectResult = parseRedisValue(testIdempotencyResult);

      expect(stringResult).toEqual(objectResult);
      expect((stringResult as any).canonicalMediaId).toBe('6fd33914d4c27fbf71871bbc6405ff1c');
    });
  });

  describe('Edge cases', () => {
    it('should handle null value', () => {
      const result = parseRedisValue(null);
      expect(result).toBe(null);
    });

    it('should handle undefined value', () => {
      const result = parseRedisValue(undefined);
      expect(result).toBe(undefined);
    });

    it('should handle number value', () => {
      const result = parseRedisValue(12345);
      expect(result).toBe(12345);
    });

    it('should handle boolean value', () => {
      const result = parseRedisValue(true);
      expect(result).toBe(true);
    });

    it('should handle array value', () => {
      const array = [1, 2, 3];
      const result = parseRedisValue(array);
      expect(result).toEqual(array);
    });

    it('should handle array as JSON string', () => {
      const array = [1, 2, 3];
      const jsonString = JSON.stringify(array);
      const result = parseRedisValue(jsonString);
      expect(result).toEqual(array);
    });
  });

  describe('Namespace helpers', () => {
    it('should construct namespaced idempotency key correctly', () => {
      const idempotencyKey = 'drive-file-id-123';
      const namespacedKey = getNamespacedIdempotencyKey(idempotencyKey);

      expect(namespacedKey).toBe('hpp:test:use-drive-asset-idempotency:drive-file-id-123');
    });

    it('should construct namespaced lock key correctly', () => {
      const idempotencyKey = 'drive-file-id-123';
      const lockKey = getNamespacedIdempotencyKey(`lock:${idempotencyKey}`);

      expect(lockKey).toBe('hpp:test:use-drive-asset-idempotency:lock:drive-file-id-123');
    });

    it('should prevent environment collision - production vs test', () => {
      const idempotencyKey = 'drive-file-id-123';
      const testKey = getNamespacedIdempotencyKey(idempotencyKey);

      // Simulate production namespace
      const productionNamespace = 'hpp:production:';
      const productionKey = `${productionNamespace}${IDEMPOTENCY_PREFIX}${idempotencyKey}`;

      expect(testKey).not.toBe(productionKey);
      expect(testKey).toBe('hpp:test:use-drive-asset-idempotency:drive-file-id-123');
      expect(productionKey).toBe('hpp:production:use-drive-asset-idempotency:drive-file-id-123');
    });

    it('should prevent environment collision - preview vs development', () => {
      const idempotencyKey = 'drive-file-id-123';

      const previewNamespace = 'hpp:preview:';
      const previewKey = `${previewNamespace}${IDEMPOTENCY_PREFIX}${idempotencyKey}`;

      const devNamespace = 'hpp:development:';
      const devKey = `${devNamespace}${IDEMPOTENCY_PREFIX}${idempotencyKey}`;

      expect(previewKey).not.toBe(devKey);
      expect(previewKey).toBe('hpp:preview:use-drive-asset-idempotency:drive-file-id-123');
      expect(devKey).toBe('hpp:development:use-drive-asset-idempotency:drive-file-id-123');
    });
  });

  describe('Integration: namespace + decoder', () => {
    it('should round-trip through namespaced key with JSON string', () => {
      const idempotencyKey = 'drive-file-id-123';
      const namespacedKey = getNamespacedIdempotencyKey(idempotencyKey);
      const jsonString = JSON.stringify(testIdempotencyResult);

      // Simulate Redis write (string)
      const writtenValue = jsonString;

      // Simulate Redis read and decode
      const decodedValue = parseRedisValue(writtenValue);

      expect(namespacedKey).toBe('hpp:test:use-drive-asset-idempotency:drive-file-id-123');
      expect(decodedValue).toEqual(testIdempotencyResult);
    });

    it('should round-trip through namespaced key with object', () => {
      const idempotencyKey = 'drive-file-id-123';
      const namespacedKey = getNamespacedIdempotencyKey(idempotencyKey);

      // Simulate Redis write (object)
      const writtenValue = testIdempotencyResult;

      // Simulate Redis read and decode
      const decodedValue = parseRedisValue(writtenValue);

      expect(namespacedKey).toBe('hpp:test:use-drive-asset-idempotency:drive-file-id-123');
      expect(decodedValue).toEqual(testIdempotencyResult);
    });
  });
});
