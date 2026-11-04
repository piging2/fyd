import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Playfair_Display } from "next/font/google";
import "./globals.css";
import { getTenant } from "@/lib/tenant-config";
import { seo } from "@/config/seo";
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/structured-data";
import { socialDestinations } from "@/lib/longping-media";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ScrollToTop } from "@/components/scroll-to-top";
import { ThemeProvider } from "@/components/theme-provider";
import { LenisProvider } from "@/components/lenis-provider";
import { MotionProvider } from "@/components/motion-provider";
import { SpeculationRules } from "@/components/speculation-rules";

// F-6 (wave 13): Geist and Geist Mono are not preloaded. Their variables
// are referenced only by mission control styles (mono nowhere), so
// preloading them cost 52,396 B on every page. Playfair stays preloaded.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], preload: false });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], preload: false });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"] });

const tenant = getTenant();
const siteUrl = tenant.domain ?? (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://fyd-product.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: seo.title,
    template: `%s · ${seo.siteName}`,
  },
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    type: "website",
    siteName: seo.siteName,
    title: seo.title,
    description: seo.description,
    url: siteUrl,
    images: [
      {
        url: "/brand/og-card.webp",
        width: 1200,
        height: 630,
        alt: "PING Social",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: seo.title,
    description: seo.description,
    images: ["/brand/og-card.webp"],
  },
  verification: {
    google: "9GfJhTOKiF4Qb9JXQFPkHOFU_y6aVaE780foNAYCY_o",
  },
  alternates: { canonical: siteUrl },
  icons: { icon: "/brand/favicon.svg", apple: "/brand/favicon.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Structured data comes from the shared builders in
  // @/lib/structured-data (Wave 17, B-14), the pattern of the FAQ helper
  // from Wave 15. This replaces the inline Organization object that used
  // to live here: same fields, plus a real logo, plus a sameAs list that
  // covers every profile the site already links. Contact facts come from
  // the tenant authority (tenant.*.v1.json), the same source the visible
  // contact surfaces render from, so the structured data can never drift
  // from what visitors see. sameAs is derived from the verified social
  // inventory (@/lib/longping-media) filtered to profile platforms: the
  // Spotify episode link, the Rumble video link, and the RSS feed are
  // linked on the site but are not profiles, so they are excluded. The
  // logo is the real brand asset served at /brand/logo.png.
  const profilePlatforms = ["YouTube", "Substack", "Facebook", "Instagram", "Threads", "X"];
  const sameAs = socialDestinations
    .filter((d) => profilePlatforms.includes(d.platform))
    .map((d) => d.href);
  const orgJsonLd = buildOrganizationJsonLd({
    name: tenant.siteName,
    url: siteUrl,
    description: tenant.description ? tenant.description : undefined,
    logo: siteUrl + "/brand/logo.png",
    telephone: tenant.contact.phone ?? undefined,
    sameAs,
    founderName: tenant.operator.name,
  });
  const webSiteJsonLd = buildWebSiteJsonLd({ name: tenant.siteName, url: siteUrl });

  // Object routes (/o/*) belong visually to the object, not to PING,
  // generated site routes (/sites/*) belong visually to the customer
  // business, never to PING engineering, and dynamic composition routes
  // (/build/*) are the customer site itself: all three render without
  // the PING marketing header, footer, and org JSON-LD. Generated routes
  // carry their own demo framing instead. The pathname arrives via the
  // x-pathname header set in middleware.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const chromeless =
    pathname === "/mission-control" ||
    pathname === "/o" ||
    pathname.startsWith("/o/") ||
    pathname.startsWith("/sites/") ||
    pathname.startsWith("/build/");

  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`} style={{ colorScheme: 'dark light' }}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = localStorage.getItem('ping-theme');
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              })();
            `,
          }}
        />
        {!chromeless && (
          <>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
            />
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }}
            />
          </>
        )}
      </head>
      <body className="min-h-full flex flex-col bg-background">
        <ThemeProvider defaultTheme="light" storageKey="ping-theme">
          <MotionProvider>
            <LenisProvider>
            <SpeculationRules />
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg"
            >
              Skip to main content
            </a>
            <ScrollToTop />
            {!chromeless && <SiteHeader />}
            <main id="main-content" className="flex-1">{children}</main>
            {!chromeless && <SiteFooter />}
            </LenisProvider>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
