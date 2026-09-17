/**
 * Tenant Authority Adapter
 *
 * Provides intent-based access to the tenant configuration.
 * Components never import tenant.*.v1.json directly.
 *
 * This is the TenantOS configuration boundary: tenant identity, brand,
 * navigation, and contact live in config, not in component code.
 * A second tenant adds a new tenant.<slug>.v1.json; no fork required.
 *
 * All authority loading flows through AuthorityLoader.
 */

import type { TenantManifest, Tenant, TenantNavItem } from "@/types/tenant";
import { loadAuthority, clearAuthorityCache } from "./authority-loader";

const TENANT_PATH = "@/config/tenant.ping.v1.json";

function isTenantManifest(data: unknown): data is TenantManifest {
  if (typeof data !== "object" || data === null) return false;
  const m = data as Record<string, unknown>;
  if (typeof m.schemaVersion !== "string") return false;
  const t = m.tenant as Record<string, unknown> | undefined;
  if (typeof t !== "object" || t === null) return false;
  return (
    typeof t.id === "string" &&
    typeof t.siteName === "string" &&
    typeof t.tagline === "string" &&
    Array.isArray(t.navigation)
  );
}

const FALLBACK: TenantManifest = {
  schemaVersion: "1.0.0",
  description: "Fallback tenant manifest (config failed to load)",
  generatedAt: new Date().toISOString(),
  tenant: {
    id: "ping",
    slug: "ping",
    siteName: "PING",
    tagline: "Continuity infrastructure for AI agents and the businesses they serve.",
    description: "",
    domain: null,
    operator: { name: "Nolan Geske", business: "PING Social", role: "Founder and operator" },
    brand: {
      wordmark: "PING",
      voice: "Concrete, honest, technical.",
      colors: { ink: "#1A1729", inkDeep: "#12101D", gold: "#C9A227", violet: "#7C5CD6", paper: "#F7F7F9" },
      mascot: { note: "" },
    },
    navigation: [
      { label: "Home", href: "/" },
      { label: "Technology", href: "/technology" },
      { label: "Blog", href: "/blog" },
      { label: "Products", href: "/products" },
      { label: "About", href: "/about" },
    ],
    contact: { facebook: null, email: null, note: "" },
    provenance: { note: "" },
  },
};

export function loadTenantManifest(): TenantManifest {
  return loadAuthority<TenantManifest>({
    path: TENANT_PATH,
    validator: isTenantManifest,
    fallback: FALLBACK,
    name: "Tenant",
  });
}

/** Get the tenant record (identity, brand, contact). */
export function getTenant(): Tenant {
  return loadTenantManifest().tenant;
}

/** Get tenant navigation items for the header/footer. */
export function getTenantNavigation(): TenantNavItem[] {
  return getTenant().navigation;
}

/** Get primary (non-secondary) navigation items. */
export function getPrimaryTenantNavigation(): TenantNavItem[] {
  return getTenantNavigation().filter((item) => !item.secondary);
}

/** Get secondary navigation items (contact, FAQ, etc.). */
export function getSecondaryTenantNavigation(): TenantNavItem[] {
  return getTenantNavigation().filter((item) => item.secondary);
}

/** Clear tenant cache (useful for testing or hot reload). */
export function clearTenantCache(): void {
  clearAuthorityCache(TENANT_PATH);
}
