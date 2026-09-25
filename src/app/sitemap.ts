import type { MetadataRoute } from "next";
import { getTenant } from "@/lib/tenant-config";
import { getAllPosts } from "@/lib/blog";

/**
 * Version of the sitemap entry contract (Q-C-03): the URL set plus the
 * per-entry fields (url, lastModified, changeFrequency, priority).
 * Bump when the entry shape or the covered route set changes; inv-13
 * pins the current value so a contract change without a bump fails.
 */
export const SITEMAP_CONTRACT_VERSION = "fyd.sitemap@1";

/**
 * Site URL resolves from the tenant config. Falls back to the current Vercel
 * deployment URL until a PING domain is assigned. Never hardcode a domain here.
 */
function getSiteUrl(): string {
  return getTenant().domain ?? (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://ping.vercel.app");
}

const TECH_PAGES = [
  "/technology/continuity",
  "/technology/agents",
  "/technology/events",
  "/technology/evidence",
  "/technology/replay",
  "/technology/integrations",
  "/technology/social-objects",
  "/technology/business-automation",
  "/technology/tenantos",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();
  const staticRoutes = ["", "/technology", "/blog", "/products", "/about", "/contact", "/faq", "/privacy", "/newsletter"];

  const entries: MetadataRoute.Sitemap = staticRoutes.map((r) => ({
    url: `${siteUrl}${r}`,
    lastModified: now,
    changeFrequency: r === "" ? "weekly" : "monthly",
    priority: r === "" ? 1 : 0.7,
  }));

  for (const t of TECH_PAGES) {
    entries.push({
      url: `${siteUrl}${t}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  for (const post of getAllPosts()) {
    entries.push({
      url: `${siteUrl}/blog/${post.slug}`,
      lastModified: new Date(post.date + "T00:00:00"),
      changeFrequency: "yearly",
      priority: 0.5,
    });
  }

  return entries;
}
