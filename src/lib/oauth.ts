/**
 * OAuth Authority Adapter
 * 
 * Provides intent-based access to OAuth provider configurations.
 * Components never import oauth.v1.json directly.
 * 
 * All authority loading flows through AuthorityLoader (CEO 051 constitutional requirement).
 */

import type { OAuthAuthority, OAuthProvider, OAuthProviderConfig } from "@/types/oauth";
import { loadAuthority, clearAuthorityCache } from "./authority-loader";

export function loadOAuthManifest(): OAuthAuthority {
  return loadAuthority<OAuthAuthority>({
    path: "@/config/oauth.v1.json",
    fallback: {
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      providers: [],
    },
    name: "OAuth",
  });
}

/**
 * Get all OAuth providers
 */
export function getAllProviders(): OAuthProviderConfig[] {
  const manifest = loadOAuthManifest();
  return manifest.providers;
}

/**
 * Get provider by ID
 */
export function getProviderById(id: OAuthProvider): OAuthProviderConfig | null {
  const providers = getAllProviders();
  return providers.find(p => p.id === id) || null;
}

/**
 * Get enabled providers
 */
export function getEnabledProviders(): OAuthProviderConfig[] {
  const providers = getAllProviders();
  return providers.filter(p => p.enabled);
}

/**
 * Get scopes for a provider
 */
export function getProviderScopes(id: OAuthProvider): string[] {
  const provider = getProviderById(id);
  return provider?.scopes || [];
}

/**
 * Check if a provider is enabled
 */
export function isProviderEnabled(id: OAuthProvider): boolean {
  const provider = getProviderById(id);
  return provider?.enabled || false;
}

/**
 * Clear OAuth cache (useful for testing or hot reload)
 */
export function clearOAuthCache(): void {
  clearAuthorityCache("@/config/oauth.v1.json");
}
