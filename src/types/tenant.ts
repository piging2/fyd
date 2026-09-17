/**
 * Tenant Authority Types
 *
 * The tenant is the first-class configuration boundary for the TenantOS model:
 * platform code + tenant configuration + content.
 *
 * A second tenant is a new tenant.<slug>.v1.json plus content, never a fork.
 * Components read tenant identity from here, never from hardcoded strings.
 */

export interface TenantNavItem {
  label: string;
  href: string;
  secondary?: boolean;
}

export interface TenantBrand {
  wordmark: string;
  voice: string;
  colors: {
    ink: string;
    inkDeep: string;
    gold: string;
    violet: string;
    paper: string;
  };
  mascot: {
    note: string;
  };
}

export interface TenantContact {
  facebook: string | null;
  email: string | null;
  note: string;
}

export interface Tenant {
  id: string;
  slug: string;
  siteName: string;
  tagline: string;
  description: string;
  domain: string | null;
  operator: {
    name: string;
    business: string;
    role: string;
  };
  brand: TenantBrand;
  navigation: TenantNavItem[];
  contact: TenantContact;
  provenance: {
    note: string;
  };
}

export interface TenantManifest {
  schemaVersion: string;
  description: string;
  generatedAt: string;
  tenant: Tenant;
}
