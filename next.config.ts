import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SHARP_IGNORE_GLOBAL_LIBVIPS is configured in vercel.json for Vercel runtime
  // Sharp native binary loading requires this environment variable at Node.js runtime
  // It is NOT a Next.js build-time configuration
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
  async redirects() {
    return [
      {
        source: '/services/built-ins',
        destination: '/services/finish-carpentry',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
