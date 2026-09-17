/**
 * HPP Event Types
 *
 * Clean internal event model for marketing and customer interactions.
 * These events will eventually be consumed by PING for intelligence.
 *
 * Schema Version: 1 (immutable)
 *
 * Uses discriminated unions for compile-time type safety.
 * Each event type has its own data interface.
 *
 * NOTE: Schema version is immutable. When version 2 is introduced,
 * keep both versions. PING can migrate independently.
 */

export const SCHEMA_VERSION = 1;

export type HPPEventType =
  | "NewsletterSignup"
  | "NewsletterConfirmed"
  | "EmailOpened"
  | "EmailClicked"
  | "EstimateRequested"
  | "EstimateStarted"
  | "EstimateFinished"
  | "EstimateAbandoned"
  | "GuideDownloaded"
  | "CustomerCreated"
  | "RepeatCustomer"
  | "Referral"
  | "ReviewRequested"
  | "ReviewCompleted"
  | "HomepageViewed"
  | "ServiceViewed"
  | "CTAClicked"
  | "BlogViewed"
  | "ProjectViewed"
  | "PhoneClick"
  | "EmailClick"
  | "InspectionReminder"
  | "InvoicePaid";

/**
 * Common metadata for all events
 */
export interface HPPMetadata {
  acquisitionSource?: string;
  landingPage?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  sessionId?: string;
  anonymousVisitorId?: string;
  deviceClass?: string;
  location?: string;
}

/**
 * Event-specific data interfaces
 */
export interface NewsletterSignupData {
  email: string;
  firstName?: string;
  subscriberId?: number;
  tags?: string[];
}

export interface NewsletterConfirmedData {
  email: string;
  subscriberId: number;
}

export interface EmailOpenedData {
  email: string;
  subscriberId: number;
  emailId?: string;
  subject?: string;
}

export interface EmailClickedData {
  email: string;
  subscriberId: number;
  emailId?: string;
  clickUrl?: string;
}

export interface EstimateRequestedData {
  email: string;
  name: string;
  phone?: string;
  services?: string[];
  property?: {
    city?: string;
    county?: string;
  };
  photosCount?: number;
}

export interface EstimateStartedData {
  email?: string;
  step?: number;
}

export interface EstimateFinishedData {
  email: string;
  name: string;
  services?: string[];
}

export interface EstimateAbandonedData {
  email?: string;
  step?: number;
  abandonmentReason?: string;
}

export interface GuideDownloadedData {
  email: string;
  resourceTitle: string;
  resourceUrl?: string;
}

export interface CustomerCreatedData {
  email: string;
  name: string;
  phone?: string;
  source?: string;
}

export interface RepeatCustomerData {
  email: string;
  previousProjectDate?: string;
  previousProjectId?: string;
}

export interface ReferralData {
  referrerEmail?: string;
  referredEmail?: string;
  referralSource?: string;
}

export interface ReviewRequestedData {
  email: string;
  customerName: string;
  projectId?: string;
}

export interface ReviewCompletedData {
  email?: string;
  customerName: string;
  rating: number;
  service?: string;
  location?: {
    city?: string;
    county?: string;
  };
  title?: string;
  body?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  bucket?: 'positive' | 'review';
  qualityScore?: number;
}

export interface HomepageViewedData {
  sessionId?: string;
  anonymousVisitorId?: string;
}

export interface ServiceViewedData {
  serviceSlug?: string;
  serviceName?: string;
}

export interface CTAClickedData {
  ctaType?: 'estimate' | 'phone' | 'email' | 'newsletter';
  ctaLocation?: string;
}

export interface BlogViewedData {
  postSlug?: string;
  postTitle?: string;
}

export interface ProjectViewedData {
  projectId?: string;
  projectTitle?: string;
}

export interface PhoneClickData {
  phoneNumber?: string;
}

export interface EmailClickData {
  email?: string;
}

export interface InspectionReminderData {
  email: string;
  projectId?: string;
  inspectionDate?: string;
}

export interface InvoicePaidData {
  email: string;
  invoiceId?: string;
  amount?: number;
}

/**
 * Discriminated union for event data
 */
export type HPPEventData =
  | { type: "NewsletterSignup"; data: NewsletterSignupData }
  | { type: "NewsletterConfirmed"; data: NewsletterConfirmedData }
  | { type: "EmailOpened"; data: EmailOpenedData }
  | { type: "EmailClicked"; data: EmailClickedData }
  | { type: "EstimateRequested"; data: EstimateRequestedData }
  | { type: "EstimateStarted"; data: EstimateStartedData }
  | { type: "EstimateFinished"; data: EstimateFinishedData }
  | { type: "EstimateAbandoned"; data: EstimateAbandonedData }
  | { type: "GuideDownloaded"; data: GuideDownloadedData }
  | { type: "CustomerCreated"; data: CustomerCreatedData }
  | { type: "RepeatCustomer"; data: RepeatCustomerData }
  | { type: "Referral"; data: ReferralData }
  | { type: "ReviewRequested"; data: ReviewRequestedData }
  | { type: "ReviewCompleted"; data: ReviewCompletedData }
  | { type: "HomepageViewed"; data: HomepageViewedData }
  | { type: "ServiceViewed"; data: ServiceViewedData }
  | { type: "CTAClicked"; data: CTAClickedData }
  | { type: "BlogViewed"; data: BlogViewedData }
  | { type: "ProjectViewed"; data: ProjectViewedData }
  | { type: "PhoneClick"; data: PhoneClickData }
  | { type: "EmailClick"; data: EmailClickData }
  | { type: "InspectionReminder"; data: InspectionReminderData }
  | { type: "InvoicePaid"; data: InvoicePaidData };

/**
 * Base HPP Event interface
 * Maintains backward compatibility with Record<string, unknown> for gradual migration
 *
 * Timestamps:
 * - timestamp: When the event occurred (business time)
 * - receivedAt: When HPP received the event (system time)
 * - persistedAt: When the event was stored (system time)
 *
 * Multiple timestamps are critical for:
 * - Late-arriving webhooks
 * - Retry handling
 * - Queue processing
 * - Replay ordering
 */
export interface HPPEvent {
  schemaVersion: number;
  id: string;
  type: HPPEventType;
  timestamp: string; // occurredAt - when the business event happened
  receivedAt?: string; // when HPP received the event
  persistedAt?: string; // when the event was stored
  data: Record<string, unknown>;
  metadata?: HPPMetadata;
}
