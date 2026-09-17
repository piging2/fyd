import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/events";

/**
 * Kit Webhook Handler
 * 
 * Receives Kit webhook events and maps them to HPP events.
 * Events flow into HPP first for logging and future analysis by PING.
 */

// Kit event name to HPP event type mapping
const KIT_EVENT_MAPPING: Record<string, string> = {
  "subscriber.subscriber_activate": "NewsletterConfirmed",
  "subscriber.subscriber_unsubscribe": "NewsletterConfirmed", // Track unsubscribes
  "subscriber.form_subscribe": "NewsletterSignup",
  "subscriber.link_click": "EmailClicked",
  "subscriber.product_purchase": "CustomerCreated",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Kit webhook structure
    const { event, subscriber } = body;
    
    if (!event || !subscriber) {
      return NextResponse.json(
        { error: "Invalid webhook payload" },
        { status: 400 }
      );
    }

    const eventName = event.name;
    const eventType = KIT_EVENT_MAPPING[eventName];

    if (eventType) {
      // Map Kit event to HPP event
      logEvent(eventType as any, {
        kitEventName: eventName,
        email: subscriber.email_address,
        subscriberId: subscriber.id,
        firstName: subscriber.first_name,
        state: subscriber.state,
        eventData: event,
      }, {
        acquisitionSource: "kit_webhook",
      });
    } else {
      // Log unknown Kit events for debugging
      console.log("[Kit Webhook] Unmapped event:", eventName);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Kit webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

// Kit webhooks require GET endpoint for verification
export async function GET(request: NextRequest) {
  return NextResponse.json({ status: "Kit webhook endpoint active" });
}
