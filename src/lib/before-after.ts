/**
 * Before/After Authority Adapter
 * 
 * Provides intent-based access to before/after photo pairs.
 * Components never import before-after.v1.json directly.
 * 
 * All authority loading flows through AuthorityLoader (CEO 051 constitutional requirement).
 */

import type { BeforeAfterManifest, BeforeAfterPair } from "@/types/before-after";
import { loadAuthority, clearAuthorityCache, findById } from "./authority-loader";

export function loadBeforeAfterManifest(): BeforeAfterManifest {
  return loadAuthority<BeforeAfterManifest>({
    path: "@/config/before-after.v1.json",
    fallback: {
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      pairs: []
    },
    name: "Before/After",
  });
}

/**
 * Get all before/after pairs
 */
export function getAllBeforeAfterPairs(): BeforeAfterPair[] {
  const manifest = loadBeforeAfterManifest();
  return manifest.pairs;
}

/**
 * Get before/after pair by ID
 */
export function getBeforeAfterPairById(id: string): BeforeAfterPair | null {
  const pairs = getAllBeforeAfterPairs();
  return findById(pairs, id);
}

/**
 * Get before/after pairs by service
 */
export function getBeforeAfterPairsByService(service: string): BeforeAfterPair[] {
  const pairs = getAllBeforeAfterPairs();
  return pairs.filter(p => p.service === service);
}

/**
 * Clear before/after cache (useful for testing or hot reload)
 */
export function clearBeforeAfterCache(): void {
  clearAuthorityCache("@/config/before-after.v1.json");
}
