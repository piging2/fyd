import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Publisher loader cache policy (CEO Continuation workstream A, measured
  // 2026-11-11): the loader is an unversioned URL embedded on publisher
  // pages, so it must never be cached immutably; a five minute freshness
  // window with a short stale-while-revalidate tail removes most
  // revalidation round trips while keeping a fix minutes away from every
  // publisher. Reconciled 2026-11-11: the tail was 3600 at first landing,
  // which let a browser serve a stale loader for up to about 65 minutes
  // after a fix, against the minutes standard above; at 60 the worst case
  // is about 6 minutes. Before: the platform default, max-age=0 with an
  // ETag revalidation per load.
  async headers() {
    return [
      {
        source: "/fyd-circle-loader.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, stale-while-revalidate=60",
          },
        ],
      },
    ];
  },
  // nodemailer must be required at runtime in route handlers, not
  // webpack-bundled: the bundled copy cannot load its transport in
  // the serverless function (submission-mailer delivery path).
  serverExternalPackages: ["nodemailer"],
  // F-4 (wave 13): strip console calls in production builds, keeping
  // console.error. The form routes use no console calls at all and the
  // submission mailer logs only through console.error, so the delivery
  // path keeps its logging. Census and proof in WAVE-13-RECEIPT.
  compiler: { removeConsole: { exclude: ["error"] } },
  // SHARP_IGNORE_GLOBAL_LIBVIPS is configured in vercel.json for Vercel runtime
  // Sharp native binary loading requires this environment variable at Node.js runtime
  // It is NOT a build-time configuration
  eslint: {
    // Disable ESLint during Next.js build due to Next 15.5.7 + eslint-config-next/Rushstack patching failure
    // ESLint will be run separately in CI with standalone configuration
    ignoreDuringBuilds: true,
  },
  images: {
    // next/image will serve AVIF/WebP automatically for raster images.
    formats: ["image/avif", "image/webp"],
    // SAFETY: All SVGs are committed trusted assets in public/brand/ and public/images/
    // No user-controlled SVGs are accepted through any upload/ingest path
    // dangerouslyAllowSVG is required for brand logos, favicons, and service icons
    dangerouslyAllowSVG: true,
    // REMOVED: contentDispositionType: "attachment"
    // This was causing images to download instead of display inline
    // Website-facing image delivery should display inline, not force download
    // Allow local project images (including filenames with spaces)
    // Allow brand assets (logo, favicon, etc.)
    // Allow Drive API proxy endpoints for Workbench (must use unoptimized flag)
    localPatterns: [
      {
        pathname: '/images/**',
      },
      {
        pathname: '/brand/**',
      },
      {
        pathname: '/api/drive/files/**',
      },
    ],
    // Allow Vercel Blob storage for media assets
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Allow browser preview for development
  allowedDevOrigins: ['127.0.0.1'],
  // DEPLOY-2026-10-02: outputFileTracingIncludes bundles the file-backed
  // data the API routes read at request time into serverless functions.
  // /sites pages and / are static (build-time reads, full tree present);
  // /api/live and Ask FYD read at request time and need these files.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./fyd-projections/*.json",
      "./src/fyd/preview/manifests/*.json",
      "./src/fyd/media/manifests/*.json",
    ],
    "/": [
      "./fyd-projections/*.json",
      "./src/fyd/preview/manifests/*.json",
      "./src/fyd/media/manifests/*.json",
    ],
    "/sites": [
      "./fyd-projections/*.json",
      "./src/fyd/preview/manifests/*.json",
      "./src/fyd/media/manifests/*.json",
    ],
    "/sites/**/*": [
      "./fyd-projections/*.json",
      "./src/fyd/preview/manifests/*.json",
      "./src/fyd/media/manifests/*.json",
    ],
    "/o": [
      "./fyd-projections/*.json",
      "./src/fyd/preview/manifests/*.json",
      "./src/fyd/media/manifests/*.json",
    ],
    "/o/**/*": [
      "./fyd-projections/*.json",
      "./src/fyd/preview/manifests/*.json",
      "./src/fyd/media/manifests/*.json",
    ],
  },
  async redirects() {
    return [
      {
        source: '/services/built-ins',
        destination: '/services/finish-carpentry',
        permanent: true,
      },
      {
        // FYD demo alias (2026-09-24, Nolan): /sites/coppersmith is the
        // short name Nolan uses; the canonical tenant slug is
        // coppersmith-plumbing. Temporary redirect so browsers do not
        // permanently cache the alias while the demo surface evolves.
        source: '/sites/coppersmith',
        destination: '/sites/coppersmith-plumbing',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
