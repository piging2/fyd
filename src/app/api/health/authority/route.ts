/**
 * Authority Readiness Check API Route
 *
 * Verifies that all required infrastructure for authoritative operations is present.
 * Returns environment variable presence without exposing values.
 *
 * Checks:
 * - KV (Redis for sessions/authorizations)
 * - Encryption (for secure credential storage)
 * - Google OAuth (for Drive authentication)
 * - Workbench (for administrative access)
 * - Blob (for media storage)
 *
 * This is separate from basic health check - this verifies authority readiness.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authorityCheck = {
    // KV (Redis for sessions/authorizations)
    kv_redis: {
      configured: !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN,
      url_present: !!process.env.KV_REST_API_URL,
      token_present: !!process.env.KV_REST_API_TOKEN,
    },
    
    // Encryption (for secure credential storage)
    encryption: {
      configured: !!process.env.ENCRYPTION_KEY,
      key_present: !!process.env.ENCRYPTION_KEY,
    },
    
    // Google OAuth (for Drive authentication)
    google_oauth: {
      configured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && !!process.env.GOOGLE_REDIRECT_URI,
      client_id_present: !!process.env.GOOGLE_CLIENT_ID,
      client_secret_present: !!process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri_present: !!process.env.GOOGLE_REDIRECT_URI,
    },
    
    // Workbench (for administrative access)
    workbench: {
      configured: !!process.env.WORKBENCH_PASSWORD,
      password_present: !!process.env.WORKBENCH_PASSWORD,
    },
    
    // Blob (for media storage)
    blob: {
      configured: !!process.env.BLOB_READ_WRITE_TOKEN,
      token_present: !!process.env.BLOB_READ_WRITE_TOKEN,
    },
  };

  const allConfigured = 
    authorityCheck.kv_redis.configured &&
    authorityCheck.encryption.configured &&
    authorityCheck.google_oauth.configured &&
    authorityCheck.workbench.configured &&
    authorityCheck.blob.configured;

  return NextResponse.json({
    ready: allConfigured,
    timestamp: new Date().toISOString(),
    authority: authorityCheck,
    vercel_env: process.env.VERCEL_ENV || 'unknown',
  });
}
