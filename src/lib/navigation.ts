/**
 * Navigation Authority Adapter
 * 
 * Provides intent-based access to site navigation.
 * Components never import navigation.v1.json directly.
 * 
 * All authority loading flows through AuthorityLoader (CEO 051 constitutional requirement).
 */

import type { NavigationManifest, NavItem } from "@/types/navigation";
import { loadAuthority, clearAuthorityCache } from "./authority-loader";

export function loadNavigationManifest(): NavigationManifest {
  return loadAuthority<NavigationManifest>({
    path: "@/config/navigation.v1.json",
    fallback: {
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      navigation: []
    },
    name: "Navigation",
  });
}

/**
 * Get all navigation items
 */
export function getNavigation(): NavItem[] {
  const manifest = loadNavigationManifest();
  return manifest.navigation;
}

/**
 * Get primary navigation items (non-secondary)
 */
export function getPrimaryNavigation(): NavItem[] {
  const navigation = getNavigation();
  return navigation.filter(item => !item.secondary);
}

/**
 * Get secondary navigation items
 */
export function getSecondaryNavigation(): NavItem[] {
  const navigation = getNavigation();
  return navigation.filter(item => item.secondary);
}

/**
 * Clear navigation cache (useful for testing or hot reload)
 */
export function clearNavigationCache(): void {
  clearAuthorityCache("@/config/navigation.v1.json");
}
