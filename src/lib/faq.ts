/**
 * FAQ Authority Adapter
 * 
 * Provides intent-based access to FAQ items.
 * Components never import faq.v1.json directly.
 * 
 * All authority loading flows through AuthorityLoader (CEO 051 constitutional requirement).
 */

import type { FaqManifest, FaqItem } from "@/types/faq";
import { loadAuthority, clearAuthorityCache, findById } from "./authority-loader";

export function loadFaqManifest(): FaqManifest {
  return loadAuthority<FaqManifest>({
    path: "@/config/faq.v1.json",
    fallback: {
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      faqs: [],
    },
    name: "FAQ",
  });
}

/**
 * Get all FAQ items
 */
export function getAllFaqs(): FaqItem[] {
  const manifest = loadFaqManifest();
  return manifest.faqs;
}

/**
 * Get FAQ by ID
 */
export function getFaqById(id: string): FaqItem | null {
  const faqs = getAllFaqs();
  return findById(faqs, id);
}

/**
 * Get FAQs by category
 */
export function getFaqsByCategory(category: string): FaqItem[] {
  const faqs = getAllFaqs();
  return faqs.filter(f => f.category === category);
}

/**
 * Get all unique categories
 */
export function getFaqCategories(): string[] {
  const faqs = getAllFaqs();
  const categories = new Set(faqs.map(f => f.category));
  return Array.from(categories);
}

/**
 * Clear FAQ cache (useful for testing or hot reload)
 */
export function clearFaqCache(): void {
  clearAuthorityCache("@/config/faq.v1.json");
}
