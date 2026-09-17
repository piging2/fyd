/**
 * MarketingProvider Interface
 *
 * Abstraction for marketing automation providers (Kit, etc.).
 * HPP depends only on this interface, not on specific provider implementations.
 *
 * This allows provider switching without changing application code.
 */

/**
 * Canonical Event Types
 *
 * Every marketing action emits a canonical event.
 * PING consumes these events for historical intelligence.
 */
export type CanonicalEvent =
  | LeadCaptured
  | TagApplied
  | SequenceStarted
  | SequenceCompleted
  | EmailOpened
  | LinkClicked
  | EstimateRequested;

export interface LeadCaptured {
  type: "LeadCaptured";
  data: {
    email: string;
    firstName?: string;
    source: "kit" | "google" | "referral" | "phone" | "form" | "crm";
    subscriberId?: number;
  };
  timestamp: string;
}

export interface TagApplied {
  type: "TagApplied";
  data: {
    subscriberId: number;
    tagId: number;
    tagName: string;
  };
  timestamp: string;
}

export interface SequenceStarted {
  type: "SequenceStarted";
  data: {
    subscriberId: number;
    sequenceId: number;
    sequenceName: string;
  };
  timestamp: string;
}

export interface SequenceCompleted {
  type: "SequenceCompleted";
  data: {
    subscriberId: number;
    sequenceId: number;
    sequenceName: string;
  };
  timestamp: string;
}

export interface EmailOpened {
  type: "EmailOpened";
  data: {
    subscriberId: number;
    emailId: number;
    subject: string;
  };
  timestamp: string;
}

export interface LinkClicked {
  type: "LinkClicked";
  data: {
    subscriberId: number;
    emailId: number;
    url: string;
  };
  timestamp: string;
}

export interface EstimateRequested {
  type: "EstimateRequested";
  data: {
    email: string;
    source: string;
  };
  timestamp: string;
}

/**
 * MarketingProvider Interface
 *
 * Abstraction for marketing automation providers.
 * HPP depends only on this interface.
 */
export interface MarketingProvider {
  /**
   * Subscribe a new lead
   * Emits LeadCaptured event
   */
  subscribe(
    email: string,
    firstName?: string,
    tags?: number[],
    sequences?: number[]
  ): Promise<LeadCaptured>;

  /**
   * Apply a tag to a subscriber
   * Emits TagApplied event
   */
  applyTag(subscriberId: number, tagId: number): Promise<TagApplied>;

  /**
   * Start a sequence for a subscriber
   * Emits SequenceStarted event
   */
  startSequence(subscriberId: number, sequenceId: number): Promise<SequenceStarted>;

  /**
   * Handle webhook from provider
   * Returns array of canonical events
   */
  handleWebhook(payload: unknown, signature?: string): Promise<CanonicalEvent[]>;
}
