/**
 * Unified Environment Detection
 * 
 * Single authoritative source of truth for environment detection across all modules.
 * Prevents namespace mismatches and cross-environment contamination.
 * 
 * FAILS CLOSED on unknown environments - no silent defaults.
 */

type Environment = 'production' | 'preview' | 'development' | 'test';

export function getEnvironment(): Environment {
  const vercelEnv = process.env.VERCEL_ENV;
  const nodeEnv = process.env.NODE_ENV;
  const nextPhase = process.env.NEXT_PHASE;
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  
  // Test environment takes precedence over CI
  if (nodeEnv === 'test') {
    return 'test';
  }
  
  // During static build (phase-production-build), treat as development for safety
  // This prevents build failures when VERCEL_ENV is not set locally
  if (nextPhase === 'phase-production-build') {
    return 'development';
  }
  
  // Vercel production
  if (vercelEnv === 'production') {
    return 'production';
  }
  
  // Vercel preview
  if (vercelEnv === 'preview') {
    return 'preview';
  }
  
  // CI environment: treat as development for build purposes
  // CI builds run with NODE_ENV=production but no VERCEL_ENV
  // This is NOT production runtime - it's a build verification environment
  if (isCI && nodeEnv === 'production' && !vercelEnv) {
    return 'development';
  }
  
  // Local build with NODE_ENV=production but no VERCEL_ENV
  // This is a local production build, not runtime production
  // Treat as development for build-time operations
  if (nodeEnv === 'production' && !vercelEnv) {
    return 'development';
  }
  
  // Local development
  if (nodeEnv === 'development') {
    return 'development';
  }
  
  // P0 FIX: Fail closed on unknown environment
  // Unknown/missing environment must not silently default to development
  // This prevents production-like execution from accidentally routing into development namespace
  throw new Error(
    `Unknown environment: VERCEL_ENV=${vercelEnv}, NODE_ENV=${nodeEnv}, NEXT_PHASE=${nextPhase}, CI=${isCI}. ` +
    'Environment must be explicitly configured. Cannot proceed with unsafe default.'
  );
}

export function getKvNamespace(): string {
  // CRITICAL: Use TEST_NAMESPACE if present for integration test isolation
  // This prevents tests from writing to production/development data
  if (process.env.TEST_NAMESPACE) {
    return process.env.TEST_NAMESPACE;
  }
  
  const env = getEnvironment();
  return `hpp:${env}:`;
}

export type { Environment };
