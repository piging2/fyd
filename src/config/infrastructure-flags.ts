/**
 * Feature flags — central rollout control (Directive 031).
 * Flip these to enable Horizon-2 capabilities without branching the codebase.
 * Keep all flags boolean and default-off unless the capability is production-ready.
 */
export const features = {
  // Estimate flow
  estimateWizard: true,
  photoUpload: true,
  // Google Workspace (server-side only; never reaches the browser)
  googleWorkspace: false, // master switch for the GW adapters
  estimateApi: false, // when true, estimateService.submit() POSTs to /api/estimate (Gmail) instead of mailto
  // Future
  reviews: true,
  customerPortal: false,
  admin: false,
  aiEstimate: false,
  stripe: false,
  calendarIntegration: false,
  notifications: false,
  reviewsCollection: false,
  beforeAfterGallery: false,
  projectSpotlight: true,
  maintenanceMode: false,
} as const;

export type FeatureFlags = typeof features;
