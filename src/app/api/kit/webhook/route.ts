import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/events";

/**
 * Kit Webhook Handler
 *
 * Receives Kit webhook events and maps them to HPP events.
 * Events flow into HPP first for logging and future analysis by PING.
 *
 * P0 2026-10-03: Kit signs every delivery with X-Kit-Signature
 * (HMAC-SHA256 hex over the raw request body, "v1=<hex>" entries,
 * comma-separated; dual-signed during secret rotation). The signature is
 * verified BEFORE the event is accepted. Fail closed:
 *   - KIT_WEBHOOK_SECRET not configured -> 503, nothing processed
 *   - missing/invalid signature -> 401, nothing processed
 * KIT_WEBHOOK_PREVIOUS_SECRET (optional) accepts the pre-rotation secret
 * during a rotation window.
 */

// Kit event name to HPP event type mapping
const KIT_EVENT_MAPPING: Record<string, string> = {
  "subscriber.subscriber_activate": "NewsletterConfirmed",
  "subscriber.subscriber_unsubscribe": "NewsletterUnsubscribed",
  "subscriber.form_subscribe": "NewsletterSignup",
  "subscriber.link_click": "EmailClicked",
  "subscriber.product_purchase": "CustomerCreated",
};

function signaturesMatch(rawBody: string, header: string, secrets: string[]): boolean {
  // Header shape: "v1=<hex>[,v1=<hex>]". Accept if ANY entry verifies
  // against ANY configured secret (rotation overlap).
  const entries = header
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.startsWith("v1="))
    .map((e) => e.slice(3));
  if (entries.length === 0) return false;
  let ok = false;
  for (const secret of secrets) {
    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    for (const entry of entries) {
      const entryBuf = Buffer.from(entry, "utf8");
      // timingSafeEqual requires equal lengths; compare lengths first so
      // a malformed entry fails closed instead of throwing.
      if (entryBuf.length === expectedBuf.length && timingSafeEqual(entryBuf, expectedBuf)) {
        ok = true;
      }
    }
  }
  return ok;
}

export async function POST(request: NextRequest) {
  try {
    // Raw bytes first: the HMAC is over the exact body Kit sent.
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("x-kit-signature") ?? "";

    const secret = process.env.KIT_WEBHOOK_SECRET;
    if (!secret) {
      // Fail closed: without the signing secret we cannot authenticate
      // the sender, so we accept nothing. This is a server misconfiguration,
      // not a client error.
      console.error("[Kit Webhook] KIT_WEBHOOK_SECRET not configured; refusing delivery");
      return NextResponse.json({ error: "Webhook receiver not configured" }, { status: 503 });
    }
    const secrets = [secret];
    const previous = process.env.KIT_WEBHOOK_PREVIOUS_SECRET;
    if (previous) secrets.push(previous);

    if (!signaturesMatch(rawBody, signatureHeader, secrets)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody);

    // Kit webhook structure
    const { event, subscriber } = body;

    if (!event || !subscriber) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
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
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

// Kit webhooks require GET endpoint for verification
export async function GET(request: NextRequest) {
  return NextResponse.json({ status: "Kit webhook endpoint active" });
}
