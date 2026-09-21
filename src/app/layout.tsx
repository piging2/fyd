import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Playfair_Display } from "next/font/google";
import "./globals.css";
import { getTenant } from "@/lib/tenant-config";
import { seo } from "@/config/seo";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ScrollToTop } from "@/components/scroll-to-top";
import { ThemeProvider } from "@/components/theme-provider";
import { LenisProvider } from "@/components/lenis-provider";
import { MotionProvider } from "@/components/motion-provider";
import { SpeculationRules } from "@/components/speculation-rules";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"] });

const tenant = getTenant();
const siteUrl = tenant.domain ?? (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://ping.vercel.app");

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
  },
  twitter: {
    card: "summary",
    title: seo.title,
    description: seo.description,
  },
  alternates: { canonical: siteUrl },
  icons: { icon: "/brand/favicon.svg", apple: "/brand/favicon.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: tenant.siteName,
    description: tenant.description,
    url: siteUrl,
    founder: {
      "@type": "Person",
      name: tenant.operator.name,
    },
  };

  // Object routes (/o/*) belong visually to the object, not to PING: they
  // render without the PING marketing header, footer, and org JSON-LD.
  // The pathname arrives via the x-pathname header set in middleware.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const chromeless = pathname === "/o" || pathname.startsWith("/o/");

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`} style={{ colorScheme: 'dark light' }}>
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
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
          />
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
