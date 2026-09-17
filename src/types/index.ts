/**
 * Stable domain objects for the Contractor Platform.
 *
 * These names are the future platform language. Even though the MVP has no
 * backend, every component references these types so that when a real API
 * replaces the mock services, only the service implementation changes — not
 * the components. Do not invent UI-specific models.
 */

export interface Company {
  name: string;
  legalName: string;
  tagline: string;
  description: string;
  ccbNumber: string;
  email: string;
  phone: string;
  phoneDisplay: string;
  address: {
    city: string;
    region: string;
    country: string;
  };
  serviceArea: string;
  businessHours: string;
  social: SocialProfile[];
  /** Public owners/faces of the company (partnership). */
  owners: {
    name: string;
    title: string;
    focus: string;
  }[];
  /** Micro-proof woven through the site (no big "why choose us" block needed). */
  proof: {
    projectsCompleted: string; // "150+"
    estimateResponse: string;  // "Most estimates within 1–2 business days"
    yearsInBusiness: string;   // "12"
    insured: boolean;
    bonded: boolean;
    serviceCounties: string[];
  };
}

export interface SocialProfile {
  platform: "facebook" | "instagram" | "youtube" | "linkedin" | "google" | "yelp";
  label: string;
  url: string;
}

export interface ServiceCategory {
  slug: string;
  title: string;
  description: string;
  icon: string; // lucide icon name
  order: number;
}

export interface EstimatorFlag {
  id: string;
  label: string;
  severity: "info" | "review" | "site_visit_required";
}

export interface EstimateQuestion {
  /** stable key used by the estimate wizard */
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "number" | "boolean";
  options?: string[];
  required?: boolean;
  placeholder?: string;
  help?: string;
  /** NEW — marks this question as the scope-determining question for pricing. */
  isScopeQuestion?: boolean;
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

export interface Service {
  slug: string;
  title: string;
  category: string; // ServiceCategory.slug
  summary: string;
  description: string;
  icon: string; // lucide icon name
  heroImage?: string; // image asset path or id (optional - sourced from media.ts)
  galleryRefs: string[]; // GalleryItem.id[]
  /** Micro-proof line shown on the card (e.g. "150+ completed"). Optional. */
  stat?: string;
  estimateQuestions: EstimateQuestion[];
  seo: SeoMeta;
  /** If true, skip the wizard's "Tell us about your project" intent step */
  skipsIntentStep?: boolean;
  /** Default project intent for services that skip the intent step */
  defaultProjectIntent?: string;
}

export interface GalleryItem {
  id: string;
  project: string;
  service: string; // Service.slug
  src: string; // image asset path
  alt: string;
  featured: boolean;
  beforeAfter?: "before" | "after" | null;
  county?: string;
  tags: string[];
  width: number;
  height: number;
  /** Image Registry metadata (Directive 032): intent-based curation. */
  category?: string; // Decks | Kitchens | Fences | Owner | BeforeAfter | ...
  orientation?: "landscape" | "portrait" | "square";
  hero?: boolean;
  priority?: number; // 1–10; higher = more likely featured
  /** optional base64 blur placeholder for next/image placeholder="blur" */
  blurDataURL?: string;
}

export interface Review {
  id: string;
  author: string;
  location: string;
  rating: number; // 1-5
  title: string;
  body: string;
  date: string; // ISO
  project?: string;
  service?: string; // Service.slug
  source?: string; // e.g. "Google"
  verified?: boolean;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

export interface County {
  slug: string;
  name: string;
  cities?: string[];
}

/** ---- Estimate Request aggregate (submitted via the wizard) ---- */

export interface Customer {
  name: string;
  email: string;
  phone: string;
}

export interface Property {
  address: string;
  city: string;
  county: string;
  details?: string;
  schedulingAnswer?: string; // V3 - dynamic scheduling question answer
}

export interface EstimateRequest {
  customer: Customer;
  property: Property;
  services: string[]; // Service.slug[] — up to 3 (or 0 if otherNeed given)
  otherNeed?: string; // "Don't see what you need?" free text
  projectType?: "painting" | "building"; // Determines estimation authority (legacy, for engine compatibility)
  projectIntent?: string; // Human-readable project intent from wizard (e.g., "Build something new")
  answers: Record<string, string | boolean | number>;
  photos: Array<{ name: string; size: number; data?: string; file?: File }>; // includes base64 data for API submission; name is always set when photo is added
  notes?: string;
  submittedAt: string; // ISO
}

/** ---- V3 Interview Engine: Project Intake Record ---- */

export interface ProjectIntakeRecord {
  service: string;
  intent: string;
  measurements: Record<string, number>;
  condition: Record<string, string | boolean>;
  materials: Record<string, string>;
  flags: EstimatorFlag[];
  complexity: number;
  confidence: number;
}

/** ---- V3 Interview Engine: Question Definition ---- */

export interface QuestionDefinition {
  id: string;
  label: string;
  type: "select" | "number" | "boolean" | "text" | "textarea";
  options?: string[];
  category: "intent" | "condition" | "material" | "scope";
  measurementType?: "length" | "area" | "count" | "volume";
  measurementUnit?: "feet" | "square_feet" | "rooms" | "doors" | "posts" | "sections";
  flags?: Record<string, { flagId: string; severity: EstimatorFlag["severity"] }>;
}

export interface QuestionEdge {
  uses: string; // Reference to QuestionDefinition.id
  next: Record<string, string>; // Answer value -> next question id
}

/** ---- Contact (simple) ---- */

export interface ContactRequest {
  name: string;
  email: string;
  phone?: string;
  message: string;
  submittedAt: string;
}

export interface SeoMeta {
  title?: string;
  description?: string;
  keywords?: string[];
  ogImage?: string;
}

/** ---- Structured image asset (image pipeline is a first-class feature) ---- */
export interface ImageAsset {
  /** path to the display image (optimized variant or original) */
  src: string;
  alt: string;
  width: number;
  height: number;
  /** tiny base64 blur placeholder (data URL) for next/image placeholder="blur" */
  blurDataURL?: string;
  caption?: string;
}

/** ---- Project (Project Spotlight: tells a completed-project story) ---- */
export interface Project {
  slug: string;
  title: string;
  service: string; // Service.slug
  county?: string;
  summary: string;
  challenge: string;
  solution: string;
  materials: string[];
  outcome: string;
  /** ordered photos; first is the hero */
  photos: ImageAsset[];
  featured?: boolean;
  completedAt?: string; // ISO
}

