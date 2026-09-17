/**
 * KitAdapter
 *
 * Implementation of MarketingProvider for Kit.
 * Wraps Kit API and emits canonical events.
 *
 * HPP depends only on MarketingProvider, not on Kit directly.
 */

import * as crypto from 'crypto';
import {
  MarketingProvider,
  LeadCaptured,
  TagApplied,
  SequenceStarted,
  CanonicalEvent,
} from "./marketing-provider";
import {
  createSubscriber,
  addTagToSubscriber,
  enrollInSequence,
} from "./kit";

/**
 * KitAdapter implements MarketingProvider
 *
 * Wraps Kit API calls and emits canonical events.
 */
export class KitAdapter implements MarketingProvider {
  /**
   * Subscribe a new lead
   * Emits LeadCaptured event
   */
  async subscribe(
    email: string,
    firstName?: string,
    tags?: number[],
    sequences?: number[]
  ): Promise<LeadCaptured> {
    const result = await createSubscriber({
      email_address: email,
      first_name: firstName,
      tags,
      sequences,
    });

    return {
      type: "LeadCaptured",
      data: {
        email: result.subscriber.email_address,
        firstName: result.subscriber.first_name,
        source: "kit",
        subscriberId: result.subscriber.id,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Apply a tag to a subscriber
   * Emits TagApplied event
   */
  async applyTag(subscriberId: number, tagId: number): Promise<TagApplied> {
    await addTagToSubscriber(subscriberId, tagId);

    // TODO: Fetch tag name from Kit API
    // For now, use tagId as placeholder
    return {
      type: "TagApplied",
      data: {
        subscriberId,
        tagId,
        tagName: `Tag ${tagId}`,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Start a sequence for a subscriber
   * Emits SequenceStarted event
   */
  async startSequence(
    subscriberId: number,
    sequenceId: number
  ): Promise<SequenceStarted> {
    const result = await enrollInSequence(subscriberId, sequenceId);

    // TODO: Fetch sequence name from Kit API
    // For now, use sequenceId as placeholder
    return {
      type: "SequenceStarted",
      data: {
        subscriberId,
        sequenceId,
        sequenceName: `Sequence ${sequenceId}`,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle webhook from Kit
   * Returns array of canonical events
   */
  async handleWebhook(
    payload: unknown,
    signature?: string
  ): Promise<CanonicalEvent[]> {
    // Verify signature if provided
    if (signature) {
      const secret = process.env.KIT_WEBHOOK_SECRET;
      if (!secret) {
        console.error("KIT_WEBHOOK_SECRET not set");
        throw new Error("KIT_WEBHOOK_SECRET not set");
      }

      const rawPayload = JSON.stringify(payload);
      if (!this.verifyKitSignature(rawPayload, secret, signature)) {
        throw new Error("Invalid webhook signature");
      }
    }

    // Parse webhook payload and normalize to canonical events
    return this.normalizeWebhookPayload(payload);
  }

  /**
   * Verify Kit webhook signature using HMAC-SHA256
   */
  private verifyKitSignature(
    rawBody: string,
    secret: string,
    signatureHeader: string
  ): boolean {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    return signatureHeader === `sha256=${expected}`;
  }

  /**
   * Normalize Kit webhook payload to canonical events
   */
  private normalizeWebhookPayload(payload: unknown): CanonicalEvent[] {
    const events: CanonicalEvent[] = [];

    if (!payload || typeof payload !== 'object') {
      return events;
    }

    const data = payload as { event?: { name?: string }; data?: Record<string, unknown> };
    const eventName = data.event?.name;

    if (!eventName) {
      return events;
    }

    // Map Kit webhook events to canonical events
    switch (eventName) {
      case 'subscriber.subscriber_activate':
        events.push({
          type: 'LeadCaptured',
          data: {
            email: data.data?.email_address as string,
            source: 'kit',
          },
          timestamp: new Date().toISOString(),
        });
        break;

      case 'subscriber.tag_add':
        events.push({
          type: 'TagApplied',
          data: {
            subscriberId: data.data?.subscriber_id as number,
            tagId: data.data?.tag_id as number,
            tagName: `Tag ${data.data?.tag_id}`,
          },
          timestamp: new Date().toISOString(),
        });
        break;

      case 'subscriber.course_subscribe':
        events.push({
          type: 'SequenceStarted',
          data: {
            subscriberId: data.data?.subscriber_id as number,
            sequenceId: data.data?.sequence_id as number,
            sequenceName: `Sequence ${data.data?.sequence_id}`,
          },
          timestamp: new Date().toISOString(),
        });
        break;

      case 'subscriber.course_complete':
        events.push({
          type: 'SequenceCompleted',
          data: {
            subscriberId: data.data?.subscriber_id as number,
            sequenceId: data.data?.sequence_id as number,
            sequenceName: `Sequence ${data.data?.sequence_id}`,
          },
          timestamp: new Date().toISOString(),
        });
        break;

      case 'subscriber.link_click':
        events.push({
          type: 'LinkClicked',
          data: {
            subscriberId: data.data?.subscriber_id as number,
            emailId: data.data?.email_id as number,
            url: data.data?.initiator_value as string,
          },
          timestamp: new Date().toISOString(),
        });
        break;

      // Add more event mappings as needed
      default:
        console.warn(`Unhandled Kit webhook event: ${eventName}`);
        break;
    }

    return events;
  }
}

/**
 * Singleton instance of KitAdapter
 */
export const kitAdapter = new KitAdapter();
