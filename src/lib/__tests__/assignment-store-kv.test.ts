/**
 * Tests for KV credential resolution in assignment-store.
 *
 * Verifies the fail-closed invariant for assignment persistence:
 *  - manual KV_REST_API_URL / KV_REST_API_TOKEN are used when present
 *  - Upstash Vercel-integration names (KV_REST_API__*) are used as a fallback
 *  - if NEITHER source is present, storeServiceCardAssignment rejects
 *    (the route then returns a truthful 500, never a fake success)
 *
 * @upstash/redis is mocked so we observe the exact { url, token } passed to the
 * Redis constructor without performing any network I/O.
 * 
 * resolvePublicMedia is mocked to return a valid PublishedMediaAsset for test mediaId
 * since the test is about KV credential resolution, not media validation.
 */

jest.mock('../media', () => ({
  resolvePublicMedia: jest.fn().mockResolvedValue({
    id: 'media-xyz',
    filename: 'test.jpg',
    lifecycleState: 'published',
    variants: { web: 'https://example.com/test.jpg' },
  }),
}));

const upstashMock = { Redis: jest.fn() };

jest.mock('@upstash/redis', () => {
  function Redis(this: unknown, ...args: unknown[]) {
    return upstashMock.Redis(...args);
  }
  return { Redis };
});

// Mock getServiceCardAssignment to return null (so expectedRevision=0 is valid)
jest.mock('../assignment-store', () => {
  const originalModule = jest.requireActual('../assignment-store');
  return {
    ...originalModule,
    getServiceCardAssignment: jest.fn().mockResolvedValue(null),
  };
});

type AssignmentStore = typeof import('../assignment-store');

function validAssignment() {
  return {
    serviceSlug: 'brand-hero',
    mediaId: 'media-xyz',
    expectedRevision: 0, // Required for CAS enforcement (0 = create)
    updatedAt: new Date().toISOString(),
    source: 'workbench' as const,
  };
}

describe('assignment-store KV credential resolution', () => {
  const ORIGINAL_ENV = process.env;
  let store: AssignmentStore;

  beforeEach(() => {
    jest.resetModules();
    upstashMock.Redis.mockReset();
    upstashMock.Redis.mockImplementation((_opts: unknown) => ({
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    }));

    process.env = { ...ORIGINAL_ENV };
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.KV_REST_API__KV_REST_API_URL;
    delete process.env.KV_REST_API__KV_REST_API_TOKEN;
    delete process.env.KV_REST_API__REDIS_URL;
    delete process.env.KV_REST_API__KV_URL;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    store = require('../assignment-store');
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('uses manual KV_REST_API_URL / KV_REST_API_TOKEN when present', async () => {
    process.env.KV_REST_API_URL = 'https://manual.upstash.io';
    process.env.KV_REST_API_TOKEN = 'manual-token';

    await store.storeServiceCardAssignment(validAssignment());

    expect(upstashMock.Redis).toHaveBeenCalledTimes(1);
    expect(upstashMock.Redis).toHaveBeenCalledWith({
      url: 'https://manual.upstash.io',
      token: 'manual-token',
    });
  });

  it('falls back to integration KV_REST_API__* vars when manual absent', async () => {
    process.env.KV_REST_API__KV_REST_API_URL = 'https://integration.upstash.io';
    process.env.KV_REST_API__KV_REST_API_TOKEN = 'integration-token';

    await store.storeServiceCardAssignment(validAssignment());

    expect(upstashMock.Redis).toHaveBeenCalledTimes(1);
    expect(upstashMock.Redis).toHaveBeenCalledWith({
      url: 'https://integration.upstash.io',
      token: 'integration-token',
    });
  });

  it('prefers manual credentials over integration when both are present', async () => {
    process.env.KV_REST_API_URL = 'https://manual.upstash.io';
    process.env.KV_REST_API_TOKEN = 'manual-token';
    process.env.KV_REST_API__KV_REST_API_URL = 'https://integration.upstash.io';
    process.env.KV_REST_API__KV_REST_API_TOKEN = 'integration-token';

    await store.storeServiceCardAssignment(validAssignment());

    expect(upstashMock.Redis).toHaveBeenCalledWith({
      url: 'https://manual.upstash.io',
      token: 'manual-token',
    });
  });

  it('rejects (fail-closed) when neither credential source is present', async () => {
    await expect(store.storeServiceCardAssignment(validAssignment())).rejects.toThrow(
      /Missing required environment variables/,
    );
    expect(upstashMock.Redis).not.toHaveBeenCalled();
  });
});
