import type { SeoMeta } from "@/types";
import { getTenant } from "@/lib/tenant-config";

/**
 * Site-wide SEO defaults, resolved from the tenant authority.
 * Per-page metadata extends these via the Next Metadata API.
 * Tenant B overrides by changing tenant.*.v1.json, not this file.
 */
const tenant = getTenant();

export const seo: {
  siteName: string;
  title: string;
  description: string;
  keywords: string[];
  // ogImage: intentionally omitted until a real 1200x630 brand asset exists.
  // Referencing a missing file produces 404s on social scrapers.
} = {
  siteName: tenant.siteName,
  title: `${tenant.siteName} — ${tenant.tagline}`,
  description: tenant.description,
  keywords: ["PING", "AI agents", "continuity", "business automation", "agent infrastructure", "PING Social", "TenantOS"],
};
