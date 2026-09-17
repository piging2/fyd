/**
 * Kit API Integration
 *
 * Direct Kit API V4 integration for subscriber management.
 * Follows Kit's official API documentation.
 *
 * Environment Variables Required:
 * - KIT_API_KEY: Kit API key
 * - KIT_WEBSITE_SUBSCRIBER_TAG_ID: Tag ID for website subscribers
 * - KIT_HOMEPAGE_SIGNUP_TAG_ID: Tag ID for homepage signups
 * - KIT_ESTIMATE_REQUEST_TAG_ID: Tag ID for estimate requests
 * - KIT_GUIDE_DOWNLOAD_TAG_ID: Tag ID for guide downloads
 * - KIT_REVIEWER_TAG_ID: Tag ID for reviewers
 * - KIT_WELCOME_SEQUENCE_ID: Sequence ID for welcome sequence
 */

const KIT_API_BASE = "https://api.kit.com/v4";

/**
 * Exponential backoff for rate limiting
 */
async function fetchWithBackoff(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        lastResponse = response;
        // Rate limited - wait with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = Math.min(250 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error("Max retries exceeded");
}

/**
 * Parse Kit error response
 */
async function parseKitError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (data.errors && Array.isArray(data.errors)) {
      return data.errors.map((error: unknown) =>
        typeof error === "string" ? error : JSON.stringify(error)
      ).join(", ");
    }
    return response.statusText;
  } catch {
    return response.statusText;
  }
}

/**
 * Kit Marketing Configuration
 *
 * Centralized configuration for tags and sequences.
 * These IDs are created in Kit by administrator, not dynamically.
 */
const KIT_CONFIG = {
  get apiKey(): string {
    const key = process.env.KIT_API_KEY;
    if (!key) {
      throw new Error("KIT_API_KEY environment variable is not set");
    }
    return key;
  },

  get tags() {
    return {
      websiteSubscriber: parseInt(process.env.KIT_WEBSITE_SUBSCRIBER_TAG_ID || '', 10),
      homepageSignup: parseInt(process.env.KIT_HOMEPAGE_SIGNUP_TAG_ID || '', 10),
      estimateRequest: parseInt(process.env.KIT_ESTIMATE_REQUEST_TAG_ID || '', 10),
      guideDownload: parseInt(process.env.KIT_GUIDE_DOWNLOAD_TAG_ID || '', 10),
      reviewer: parseInt(process.env.KIT_REVIEWER_TAG_ID || '', 10),
    };
  },

  get sequences() {
    return {
      welcome: parseInt(process.env.KIT_WELCOME_SEQUENCE_ID || '', 10),
    };
  },
};

export interface KitSubscriber {
  id?: number;
  first_name?: string;
  email_address: string;
  fields?: Record<string, string>;
  state?: "active" | "bounced" | "cancelled" | "complained" | "inactive" | "unsubscribed";
}

export interface KitSubscribeResponse {
  subscriber: KitSubscriber;
  success: boolean;
  created?: boolean;
  status?: number;
  failureType?: KitFailureType;
  retryable?: boolean;
  message?: string;
}

export type KitFailureType =
  | "validation"
  | "authentication"
  | "rate_limit"
  | "retryable"
  | "permanent"
  | "network"
  | "suppressed";

export interface KitOperationResult {
  success: boolean;
  status?: number;
  failureType?: KitFailureType;
  retryable?: boolean;
  message?: string;
}

export interface KitSyncRequest {
  email: string;
  firstName?: string;
  source: string;
  fields?: Record<string, string>;
  tagIds: number[];
  sequenceId?: number;
}

export interface KitSyncResult {
  success: boolean;
  subscriber?: KitSubscriber;
  created: boolean;
  tagsApplied: number[];
  sequenceEnrolled: boolean;
  suppressed: boolean;
  failure?: KitFailureType;
  failedOperation?: "subscriber" | "tag" | "sequence";
  message?: string;
}

function classifyHttpFailure(status: number): KitFailureType {
  if (status === 401 || status === 403) return "authentication";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "retryable";
  return "permanent";
}

/**
 * Create a new subscriber in Kit
 */
export async function createSubscriber(data: {
  email_address: string;
  first_name?: string;
  fields?: Record<string, string>;
  tags?: number[];
  sequences?: number[];
}): Promise<KitSubscribeResponse> {
  try {
    const response = await fetchWithBackoff(`${KIT_API_BASE}/subscribers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Kit-Api-Key": KIT_CONFIG.apiKey,
      },
      body: JSON.stringify({
        email_address: data.email_address,
        first_name: data.first_name,
        fields: data.fields,
        tags: data.tags || [],
        sequences: data.sequences || [],
      }),
    });

    if (!response.ok) {
      const error = await parseKitError(response);
      console.error("Kit API error:", error);
      return {
        subscriber: { email_address: data.email_address },
        success: false,
        status: response.status,
        failureType: classifyHttpFailure(response.status),
        retryable: response.status === 429 || response.status >= 500,
        message: `Kit API error: ${error}`,
      };
    }

    const result = await response.json();

    return {
      subscriber: result.subscriber,
      success: true,
      created: response.status === 201,
      status: response.status,
    };
  } catch (error) {
    console.error("Kit API request failed:", error);
    return {
      subscriber: { email_address: data.email_address },
      success: false,
      failureType: "network",
      retryable: true,
      message: "Network error",
    };
  }
}

/**
 * Find subscriber by email address
 * Returns first subscriber from first page (pagination not implemented)
 * For full pagination support, use listSubscribers with cursor-based pagination
 */
export async function findSubscriberByEmail(email: string): Promise<KitSubscriber | null> {
  try {
    const response = await fetchWithBackoff(`${KIT_API_BASE}/subscribers?email_address=${encodeURIComponent(email)}`, {
      method: "GET",
      headers: {
        "X-Kit-Api-Key": KIT_CONFIG.apiKey,
      },
    });

    if (!response.ok) {
      const error = await parseKitError(response);
      console.error("Kit API error:", error);
      return null;
    }

    const result = await response.json();
    const subscribers = result.subscribers || [];
    return subscribers.length > 0 ? subscribers[0] : null;
  } catch (error) {
    console.error("Kit subscriber lookup failed:", error);
    return null;
  }
}

/**
 * List subscribers with cursor-based pagination
 * For full pagination support, use this instead of findSubscriberByEmail
 */
export async function listSubscribers(options: {
  email_address?: string;
  after?: string;
  before?: string;
  per_page?: number;
}): Promise<{ subscribers: KitSubscriber[]; pagination: { has_next_page: boolean; has_previous_page: boolean; end_cursor: string; start_cursor: string } }> {
  try {
    const params = new URLSearchParams();
    if (options.email_address) params.append("email_address", options.email_address);
    if (options.after) params.append("after", options.after);
    if (options.before) params.append("before", options.before);
    if (options.per_page) params.append("per_page", options.per_page.toString());

    const response = await fetchWithBackoff(`${KIT_API_BASE}/subscribers?${params.toString()}`, {
      method: "GET",
      headers: {
        "X-Kit-Api-Key": KIT_CONFIG.apiKey,
      },
    });

    if (!response.ok) {
      const error = await parseKitError(response);
      console.error("Kit API error:", error);
      return { subscribers: [], pagination: { has_next_page: false, has_previous_page: false, end_cursor: "", start_cursor: "" } };
    }

    return await response.json();
  } catch (error) {
    console.error("Kit subscriber list failed:", error);
    return { subscribers: [], pagination: { has_next_page: false, has_previous_page: false, end_cursor: "", start_cursor: "" } };
  }
}

/**
 * Add tag to subscriber
 * Correct endpoint: POST /v4/tags/{tag_id}/subscribers/{id}
 */
export async function addTagToSubscriber(subscriberId: number, tagId: number): Promise<boolean> {
  const result = await addTagToSubscriberResult(subscriberId, tagId);
  return result.success;
}

async function addTagToSubscriberResult(subscriberId: number, tagId: number): Promise<KitOperationResult> {
  try {
    const response = await fetchWithBackoff(`${KIT_API_BASE}/tags/${tagId}/subscribers/${subscriberId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Kit-Api-Key": KIT_CONFIG.apiKey,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const error = await parseKitError(response);
      console.error("Kit tag addition failed:", error);
      return {
        success: false,
        status: response.status,
        failureType: classifyHttpFailure(response.status),
        retryable: response.status === 429 || response.status >= 500,
        message: error,
      };
    }

    return { success: true, status: response.status };
  } catch (error) {
    console.error("Kit tag addition failed:", error);
    return { success: false, failureType: "network", retryable: true, message: "Network error" };
  }
}

/**
 * Enroll subscriber in sequence
 * Correct endpoint: POST /v4/sequences/{sequence_id}/subscribers/{id}
 */
export async function enrollInSequence(subscriberId: number, sequenceId: number): Promise<boolean> {
  const result = await enrollInSequenceResult(subscriberId, sequenceId);
  return result.success;
}

async function enrollInSequenceResult(subscriberId: number, sequenceId: number): Promise<KitOperationResult> {
  try {
    const response = await fetchWithBackoff(`${KIT_API_BASE}/sequences/${sequenceId}/subscribers/${subscriberId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Kit-Api-Key": KIT_CONFIG.apiKey,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const error = await parseKitError(response);
      console.error("Kit sequence enrollment failed:", error);
      return {
        success: false,
        status: response.status,
        failureType: classifyHttpFailure(response.status),
        retryable: response.status === 429 || response.status >= 500,
        message: error,
      };
    }

    return { success: true, status: response.status };
  } catch (error) {
    console.error("Kit sequence enrollment failed:", error);
    return { success: false, failureType: "network", retryable: true, message: "Network error" };
  }
}

/**
 * Canonical HPP -> Kit boundary for newsletter and lead capture.
 * Kit's subscriber endpoint is an email-keyed upsert; tag and sequence
 * endpoints are also idempotent for existing memberships.
 */
export async function syncSubscriberToKit(input: KitSyncRequest): Promise<KitSyncResult> {
  // Validate tagIds are valid numbers
  const validTagIds = input.tagIds.filter((tagId): tagId is number => 
    typeof tagId === 'number' && Number.isInteger(tagId) && tagId > 0
  );
  
  if (validTagIds.length !== input.tagIds.length) {
    return {
      success: false,
      created: false,
      tagsApplied: [],
      sequenceEnrolled: false,
      suppressed: false,
      failure: "validation",
      failedOperation: "tag",
      message: "Kit tag configuration is incomplete",
    };
  }

  // Validate sequenceId if present
  const validSequenceId = input.sequenceId !== undefined && 
    typeof input.sequenceId === 'number' && 
    Number.isInteger(input.sequenceId) && 
    input.sequenceId > 0 
    ? input.sequenceId 
    : undefined;

  if (input.sequenceId !== undefined && validSequenceId === undefined) {
    return {
      success: false,
      created: false,
      tagsApplied: [],
      sequenceEnrolled: false,
      suppressed: false,
      failure: "validation",
      failedOperation: "sequence",
      message: "Kit sequence configuration is invalid",
    };
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const subscription = await createSubscriber({
    email_address: normalizedEmail,
    first_name: input.firstName?.trim() || undefined,
    fields: input.fields,
  });

  if (!subscription.success || !subscription.subscriber.id) {
    return {
      success: false,
      created: false,
      tagsApplied: [],
      sequenceEnrolled: false,
      suppressed: false,
      failure: subscription.failureType || "permanent",
      failedOperation: "subscriber",
      message: subscription.message,
    };
  }

  const subscriber = subscription.subscriber;
  const suppressedStates = new Set(["cancelled", "bounced", "complained", "inactive", "unsubscribed"]);
  if (subscriber.state && suppressedStates.has(subscriber.state)) {
    return {
      success: false,
      subscriber,
      created: subscription.created === true,
      tagsApplied: [],
      sequenceEnrolled: false,
      suppressed: true,
      failure: "suppressed",
      failedOperation: "subscriber",
      message: `Subscriber is ${subscriber.state} in Kit`,
    };
  }

  const tagsApplied: number[] = [];
  for (const tagId of validTagIds) {
    // @ts-ignore - Validation above ensures tagId is number
    const tagResult = await addTagToSubscriberResult(subscriber.id, tagId);
    if (!tagResult.success) {
      return {
        success: false,
        subscriber,
        created: subscription.created === true,
        tagsApplied,
        sequenceEnrolled: false,
        suppressed: false,
        failure: tagResult.failureType || "permanent",
        failedOperation: "tag",
        message: tagResult.message,
      };
    }
    tagsApplied.push(tagId);
  }

  let sequenceEnrolled = true;
  if (validSequenceId !== undefined) {
    // @ts-ignore - Validation above ensures validSequenceId is number
    const sequenceResult = await enrollInSequenceResult(subscriber.id, validSequenceId);
    sequenceEnrolled = sequenceResult.success;
    if (!sequenceResult.success) {
      return {
        success: false,
        subscriber,
        created: subscription.created === true,
        tagsApplied,
        sequenceEnrolled: false,
        suppressed: false,
        failure: sequenceResult.failureType || "permanent",
        failedOperation: "sequence",
        message: sequenceResult.message,
      };
    }
  }

  return {
    success: true,
    subscriber,
    created: subscription.created === true,
    tagsApplied,
    sequenceEnrolled,
    suppressed: false,
  };
}

export function syncNewsletterSubscriber(input: {
  email: string;
  firstName?: string;
  source?: string;
  fields?: Record<string, string>;
}): Promise<KitSyncResult> {
  const tags = [KIT_CONFIG.tags.websiteSubscriber];
  if (input.source === "homepage") tags.push(KIT_CONFIG.tags.homepageSignup);

  return syncSubscriberToKit({
    email: input.email,
    firstName: input.firstName,
    source: input.source || "website",
    fields: input.fields,
    tagIds: tags,
    sequenceId: KIT_CONFIG.sequences.welcome,
  });
}

export function syncEstimateSubscriber(input: {
  email: string;
  firstName?: string;
  source?: string;
}): Promise<KitSyncResult> {
  return syncSubscriberToKit({
    email: input.email,
    firstName: input.firstName,
    source: input.source || "estimate_wizard",
    tagIds: [KIT_CONFIG.tags.websiteSubscriber, KIT_CONFIG.tags.estimateRequest],
  });
}

/**
 * Apply website subscriber tag
 */
export async function applyWebsiteSubscriberTag(subscriberId: number): Promise<boolean> {
  try {
    const tagId = KIT_CONFIG.tags.websiteSubscriber;
    if (!tagId || isNaN(tagId)) {
      throw new Error("KIT_WEBSITE_SUBSCRIBER_TAG_ID is not set or invalid");
    }
    return await addTagToSubscriber(subscriberId, tagId);
  } catch (error) {
    console.error("Failed to apply website subscriber tag:", error);
    return false;
  }
}

/**
 * Apply homepage signup tag
 */
export async function applyHomepageSignupTag(subscriberId: number): Promise<boolean> {
  try {
    const tagId = KIT_CONFIG.tags.homepageSignup;
    if (!tagId || isNaN(tagId)) {
      throw new Error("KIT_HOMEPAGE_SIGNUP_TAG_ID is not set or invalid");
    }
    return await addTagToSubscriber(subscriberId, tagId);
  } catch (error) {
    console.error("Failed to apply homepage signup tag:", error);
    return false;
  }
}

/**
 * Apply estimate request tag
 */
export async function applyEstimateRequestTag(subscriberId: number): Promise<boolean> {
  try {
    const tagId = KIT_CONFIG.tags.estimateRequest;
    if (!tagId || isNaN(tagId)) {
      throw new Error("KIT_ESTIMATE_REQUEST_TAG_ID is not set or invalid");
    }
    return await addTagToSubscriber(subscriberId, tagId);
  } catch (error) {
    console.error("Failed to apply estimate request tag:", error);
    return false;
  }
}

/**
 * Apply guide download tag
 */
export async function applyGuideDownloadTag(subscriberId: number): Promise<boolean> {
  try {
    const tagId = KIT_CONFIG.tags.guideDownload;
    if (!tagId || isNaN(tagId)) {
      throw new Error("KIT_GUIDE_DOWNLOAD_TAG_ID is not set or invalid");
    }
    return await addTagToSubscriber(subscriberId, tagId);
  } catch (error) {
    console.error("Failed to apply guide download tag:", error);
    return false;
  }
}

/**
 * Apply reviewer tag
 */
export async function applyReviewerTag(subscriberId: number): Promise<boolean> {
  try {
    const tagId = KIT_CONFIG.tags.reviewer;
    if (!tagId || isNaN(tagId)) {
      throw new Error("KIT_REVIEWER_TAG_ID is not set or invalid");
    }
    return await addTagToSubscriber(subscriberId, tagId);
  } catch (error) {
    console.error("Failed to apply reviewer tag:", error);
    return false;
  }
}

/**
 * Enroll subscriber in welcome sequence
 */
export async function enrollInWelcomeSequence(subscriberId: number): Promise<boolean> {
  try {
    const sequenceId = KIT_CONFIG.sequences.welcome;
    if (!sequenceId || isNaN(sequenceId)) {
      throw new Error("KIT_WELCOME_SEQUENCE_ID is not set or invalid");
    }
    return await enrollInSequence(subscriberId, sequenceId);
  } catch (error) {
    console.error("Failed to enroll in welcome sequence:", error);
    return false;
  }
}
