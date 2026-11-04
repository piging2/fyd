/**
 * [Build My FYD] intake route (Track F, 2026-09-25).
 * New route only; the other lane's src/app/build/[siteId]/page.tsx is untouched.
 */

import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant-config";
import BuildMyFydClient from "./build-my-fyd-client";

const tenant = getTenant();
const siteUrl =
  tenant.domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://fyd-product.vercel.app");

const TITLE = "Build My FYD";
const DESCRIPTION =
  "Give us your website. FYD discovers it, reads the real pages, understands the business, checks the facts against evidence, and generates your presence.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/build-my-fyd" },
  openGraph: {
    type: "website",
    title: TITLE + " · PING",
    description: DESCRIPTION,
    url: siteUrl + "/build-my-fyd",
    images: [{ url: "/brand/og-card.png", width: 1200, height: 630, alt: "PING Social" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.png"],
    title: TITLE + " · PING",
    description: DESCRIPTION,
  },
};

export default function BuildMyFydPage() {
  return <BuildMyFydClient />;
}
