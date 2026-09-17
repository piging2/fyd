import type { MetadataRoute } from "next";
import { getTenant } from "@/lib/tenant-config";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getTenant().domain ?? (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://ping.vercel.app");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
