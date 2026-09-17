/**
 * Registry Types - Data-Driven Configuration
 */

export interface ServiceCapabilities {
  paintableSurface?: boolean;
  surfaceType?: string;
  paintingType?: string;
  estimationAuthority: "building" | "painting";
}

export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  featured: boolean;
  homepageEligible: boolean;
  order: number;
  capabilities: ServiceCapabilities;
  estimateQuestions?: EstimateQuestion[];
  /** If true, skip the wizard's "Tell us about your project" intent step */
  skipsIntentStep?: boolean;
  /** Default project intent for services that skip the intent step */
  defaultProjectIntent?: string;
  /** If true, this service is archived and should not appear publicly */
  archived?: boolean;
  /** Workbench-assigned media ID for service card display */
  cardMediaId?: string | null;
}

export interface EstimatorFlag {
  id: string;
  label: string;
  severity: "info" | "review" | "site_visit_required";
}

export interface EstimateQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "number" | "boolean";
  options?: string[];
  required?: boolean;
  placeholder?: string;
  help?: string;
  /** V3 — category classification: intent, condition, material, or scope */
  category?: "intent" | "condition" | "material" | "scope";
  /** V3 — measurement type for pricing engine dispatch */
  measurementType?: "length" | "area" | "count" | "volume";
  /** V3 — actual unit for display and future service compatibility */
  measurementUnit?: "feet" | "square_feet" | "rooms" | "doors" | "posts" | "sections";
  /** V3 — flags emitted by specific answers */
  flags?: Record<string, { flagId: string; severity: EstimatorFlag["severity"] }>;
  /** V3 — branching logic: answer value -> next question id */
  next?: Record<string, string>;
}

export interface ServicesRegistry {
  version: string;
  generatedAt: string;
  services: Service[];
}

export interface City {
  id: string;
  name: string;
  county: string;
  state: string;
  zipCodes: string[];
  featured: boolean;
  homepageEligible: boolean;
  order: number;
}

export interface CitiesRegistry {
  version: string;
  generatedAt: string;
  cities: City[];
}

export interface Material {
  id: string;
  name: string;
  description: string;
  icon: string;
  featured: boolean;
  order: number;
}

export interface MaterialsRegistry {
  version: string;
  generatedAt: string;
  materials: Material[];
}

export interface GalleryPresetFilter {
  hasBefore?: boolean;
  hasAfter?: boolean;
  featured?: boolean;
  services?: string[];
  tags?: string[];
  status?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
}

export interface GalleryPreset {
  id: string;
  name: string;
  description: string;
  filter: GalleryPresetFilter;
  featured: boolean;
  order: number;
}

export interface GalleryPresetsRegistry {
  version: string;
  generatedAt: string;
  presets: GalleryPreset[];
}
