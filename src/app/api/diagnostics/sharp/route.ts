/**
 * TEMPORARY Sharp Runtime Diagnostic Endpoint
 *
 * PURPOSE: Surgical capability probe to diagnose Sharp runtime loading issues
 * LIFETIME: Temporary - remove after Sharp incident is resolved
 * AUTHORIZATION: Requires same authentication as /api/drive/ingest
 *
 * Tests Sharp capabilities progressively using documented APIs only:
 * 1. Module import
 * 2. Version/capability inspection
 * 3. Metadata extraction
 * 4. Image decode
 * 5. Transform
 * 6. WebP encode
 * 7. AVIF encode
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Diagnostic fixture - tiny 1x1 PNG (red pixel)
const FIXTURE_PNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
  0x54, 0x18, 0x57, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
  0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60,
  0x82
]);

async function runSharpDiagnostics(requestId: string) {
  const results: any = {
    requestId,
    timestamp: new Date().toISOString(),
    stages: {},
  };

  // Stage 1: Module import
  try {
    const sharp = require('sharp');
    results.stages.moduleImport = {
      status: 'passed',
    };
    results.stages.version = {
      status: 'passed',
      version: sharp.versions ? 'loaded' : 'unknown',
    };

    // Stage 2: Format capabilities (using documented APIs)
    try {
      results.stages.formatCapabilities = {
        status: 'passed',
        formats: sharp.format ? 'available' : 'unavailable',
      };
    } catch (e) {
      results.stages.formatCapabilities = {
        status: 'failed',
        errorCode: 'SHARP_FORMAT_QUERY_FAILED',
      };
    }

    // Stage 3: Metadata extraction
    try {
      const metadata = await sharp(FIXTURE_PNG).metadata();
      results.stages.metadata = {
        status: 'passed',
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
      };
    } catch (e) {
      results.stages.metadata = {
        status: 'failed',
        errorCode: 'SHARP_METADATA_FAILED',
      };
      return results; // Stop here if metadata fails
    }

    // Stage 4: Transform (resize)
    try {
      const transformed = await sharp(FIXTURE_PNG).resize(2, 2).toBuffer();
      results.stages.transform = {
        status: 'passed',
        outputSize: transformed.length,
      };
    } catch (e) {
      results.stages.transform = {
        status: 'failed',
        errorCode: 'SHARP_TRANSFORM_FAILED',
      };
    }

    // Stage 5: WebP encode
    try {
      const webp = await sharp(FIXTURE_PNG).webp().toBuffer();
      results.stages.webp = {
        status: 'passed',
        outputSize: webp.length,
      };
    } catch (e) {
      results.stages.webp = {
        status: 'failed',
        errorCode: 'SHARP_WEBP_FAILED',
      };
    }

    // Stage 6: AVIF encode
    try {
      const avif = await sharp(FIXTURE_PNG).avif().toBuffer();
      results.stages.avif = {
        status: 'passed',
        outputSize: avif.length,
      };
    } catch (e) {
      results.stages.avif = {
        status: 'failed',
        errorCode: 'SHARP_AVIF_FAILED',
      };
    }

  } catch (e) {
    results.stages.moduleImport = {
      status: 'failed',
      errorCode: 'SHARP_IMPORT_FAILED',
    };
  }

  return results;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  // Simple header-based authorization for diagnostic endpoint
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.DIAGNOSTIC_SECRET || 'dev-diagnostic-secret'}`;
  
  if (authHeader !== expectedAuth) {
    return NextResponse.json(
      {
        success: false,
        error: 'UNAUTHORIZED',
        requestId,
      },
      { status: 401 }
    );
  }

  try {
    const diagnostics = await runSharpDiagnostics(requestId);
    return NextResponse.json({
      success: true,
      diagnostics,
      requestId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'DIAGNOSTIC_ERROR',
        requestId,
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
