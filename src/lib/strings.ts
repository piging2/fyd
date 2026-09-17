/**
 * Canonical String Authority
 * 
 * Single authoritative source for all user-facing static strings.
 * Every user-facing static string should be traceable from canonical key → source → component → production UI.
 * 
 * Architecture Principle:
 * - Canonical identity → authority → component → presentation
 * - Same constitutional pattern as media: source identity → materialization → publication → presentation
 * 
 * Namespace Convention:
 * - nav.* - Navigation items
 * - homepage.* - Homepage-specific strings
 * - trust.* - Trust signals/statistics
 * - services.* - Services section strings
 * - featuredProjects.* - Featured projects section
 * - family.* - Family/owner section
 * - reviews.* - Reviews section
 * - about.* - About page
 * - contact.* - Contact page
 * - estimate.* - Estimate page
 * - workbench.* - Workbench UI
 * - newsletter.* - Newsletter signup
 * - cta.* - Call-to-action components
 * - serviceCard.* - Service card components
 * - placeholder.* - Placeholder sections
 * - beforeAfter.* - Before/after slider
 * - api.error.* - API error messages
 * - a11y.* - Accessibility strings
 */

// Navigation (nav.*)
export const NAV = {
  home: "Home",
  services: "Services",
  ourWork: "Our Work",
  about: "About",
  reviews: "Reviews",
  estimate: "Get a Free Estimate",
} as const;

// Homepage (homepage.*)
export const HOMEPAGE = {
  hero: {
    title: "Your favorite part of coming home should be the home itself.",
    description: "We repair, restore, and improve homes across the Mid-Willamette Valley. The work should look right the day we leave, and still look right years later.",
  },
  seeOurWork: "See Our Work",
  tellUsPlanning: "Tell us what you're planning.",
} as const;

// Trust Signals (trust.*)
export const TRUST = {
  licensed: "Licensed, Bonded & Insured",
  familyOwned: "Family-Owned",
  serviceArea: "Mid-Willamette Valley",
  projectsCompleted: "Projects Completed",
} as const;

// Services (services.*)
export const SERVICES = {
  title: "A few ways we can help",
  description: "Pick a service to start a free estimate — we'll guide you through the rest.",
} as const;

// Featured Projects (featuredProjects.*)
export const FEATURED_PROJECTS = {
  title: "Recent Work",
  description: "A selection of our latest work across the Mid-Willamette Valley.",
  seeAll: "See all projects",
} as const;

// Family Section (family.*)
export const FAMILY = {
  tagline: "Built by one family. Trusted by many more.",
  title: "A family business built on doing things the right way.",
} as const;

// Reviews (reviews.*)
export const REVIEWS = {
  title: "What people say once the work's done",
  empty: "We are building our review portfolio. In the meantime, ask us for references in your neighborhood.",
  readAll: "Read all reviews",
  helpingNeighbors: "Helping neighbors find their happy place",
  leaveReview: "Leave a Review",
} as const;

// About Page (about.*)
export const ABOUT = {
  serviceArea: {
    title: "Serving the mid-Willamette Valley",
  },
  cta: {
    title: "Ready to love coming home again?",
  },
} as const;

// Contact Page (contact.*)
export const CONTACT = {
  title: "Let's talk about your project",
  phone: "Phone",
  email: "Email",
  serviceArea: "Service area",
  hours: "Hours",
} as const;

// Estimate Page (estimate.*)
export const ESTIMATE = {
  title: "Let's scope your project",
  description: "About two minutes. Your details go straight to our inbox — no account, no spam.",
} as const;

// Workbench (workbench.*)
export const WORKBENCH = {
  login: {
    title: "Workbench Login",
    subtitle: "Administrative access required",
    password: "Password",
    placeholder: "Enter workbench password",
    button: "Login",
  },
  connectors: {
    title: "Connector Studio",
    connectDrive: "Connect Drive",
    openDrive: "Open Drive",
  },
  explorer: {
    title: "Google Drive Explorer",
    search: "Search files and folders...",
    useAsset: "Use This Asset",
  },
} as const;

// Newsletter (newsletter.*)
export const NEWSLETTER = {
  title: "Stay Ahead of Home Maintenance",
  description: "Get practical homeowner tips, seasonal maintenance reminders, remodeling ideas, project showcases, and exclusive offers delivered to your inbox.",
  emailPlaceholder: "Email address",
  firstNamePlaceholder: "First name (optional)",
  subscribe: "Subscribe",
  noSpam: "No spam, ever. Unsubscribe anytime.",
} as const;

// CTA Components (cta.*)
export const CTA = {
  startFreeEstimate: "Start Your Free Estimate",
} as const;

// Service Card (serviceCard.*)
export const SERVICE_CARD = {
  startQuote: "Start a quote",
  photosComingSoon: "Project photos coming soon",
} as const;

// Placeholder (placeholder.*)
export const PLACEHOLDER = {
  gallery: "Project Photos Coming Soon",
  galleryDescription: "We're currently building our portfolio. Check back soon to see our latest work.",
} as const;

// Before/After (beforeAfter.*)
export const BEFORE_AFTER = {
  before: "Before",
  after: "After",
} as const;

// API Errors (api.error.*)
export const API_ERROR = {
  unauthorized: "Unauthorized",
  workbenchAuthRequired: "Workbench authentication required",
  driveDiscoveryFailed: "Failed to discover Drive structure",
  driveFilesFailed: "Failed to list Drive files",
  estimateFailed: "Estimate submission failed",
  reviewValidationFailed: "Review validation failed",
  newsletterFailed: "Failed to subscribe to newsletter",
} as const;

// Accessibility (a11y.*)
export const A11Y = {
  theme: {
    toggle: "Toggle theme",
  },
  siteHeader: {
    home: "{company.name} home",
    primary: "Primary",
    mobile: "Mobile",
    closeMenu: "Close menu",
    openMenu: "Open menu",
  },
} as const;

// Dynamic Templates (with interpolation support)
export const DYNAMIC = {
  about: {
    heroTitle: (signature: string) => `Every family deserves a ${signature} place.`,
  },
  estimate: {
    preferTalk: (phone: string, email: string) => `Prefer to talk? Call ${phone} or email ${email}.`,
  },
  starRating: {
    aria: (rating: number) => `Rated ${rating} out of 5`,
  },
  stats: {
    average: (average: number, count: number) => `${average} / 5 across ${count} featured reviews from homeowners across the Willamette Valley.`,
  },
} as const;

/**
 * Helper function to get a string by key
 * This provides a typed lookup interface for string resolution
 */
export function getString(namespace: string, key: string): string {
  // This function will be expanded as needed for dynamic lookup
  // For now, direct namespace access is preferred for type safety
  throw new Error(`String lookup not yet implemented for ${namespace}.${key}`);
}

/**
 * Dynamic string interpolation helper
 */
export function interpolate(template: string, variables: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key]?.toString() || match;
  });
}
