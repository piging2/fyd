/**
 * Products Authority Adapter
 *
 * Loads the versioned products authority (products.<tenant>.v1.json).
 * Components must import from this adapter, never from the JSON directly.
 * Tenant B ships its own products authority; this loader is platform code.
 */

import productsAuthority from "@/config/products.ping.v1.json";

export type ProductStatus = "available" | "in-development" | "future";

export interface ProductCta {
  label: string;
  href: string;
}

export interface Product {
  id: string;
  name: string;
  tagline: string;
  status: ProductStatus;
  summary: string;
  offers?: string[];
  notOffers?: string[];
  documented?: string[];
  proof?: string;
  cta: ProductCta;
}

const STATUS_LABELS: Record<ProductStatus, string> = {
  available: "Available",
  "in-development": "In development",
  future: "Future",
};

export function getProducts(): Product[] {
  return (productsAuthority as { products: Product[] }).products;
}

export function getProductsByStatus(status: ProductStatus): Product[] {
  return getProducts().filter((p) => p.status === status);
}

export function statusLabel(status: ProductStatus): string {
  return STATUS_LABELS[status];
}

export function getProduct(id: string): Product | null {
  return getProducts().find((p) => p.id === id) ?? null;
}
