/**
 * POST /api/newsletter/subscribe: newsletter signup intake.
 *
 * Relay amendment (2026-10-25, FYD-PIG-RELAY): this route used to
 * make the Kit sync the acceptance test. Kit credentials exist
 * nowhere in this deployment, so every signup failed 503 and no
 * record of the signup survived anywhere. Acceptance is now the
 * durable capture, exactly like the other public forms:
 *
 *   1. The signup (email, name, source, acquisition metadata, and
 *      the consent granted by submitting the form) is persisted to
 *      the submission outbox BEFORE success is acknowledged, keyed
 *      by a hash of the normalized email, so a repeat signup replays
 *      instead of duplicating the record or the notification email.
 *   2. The Pig mail worker delivers the operator notification over
 *      the proven Yahoo route.
 *   3. Kit is a SEPARATE integration. When KIT_API_KEY is configured
 *      the sync is attempted and its outcome is recorded on the
 *      outbox record (synced / failed); when it is not configured
 *      the record is preserved, marked not_configured, for a future
 *      verified sync. A Kit subscription is never claimed unless
 *      Kit's API confirmed it.
 *
 * On planes where the outbox is not configured (no blob token), the
 * legacy Kit-first behavior below is preserved exactly.
 */

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { syncNewsletterSubscriber } from "@/lib/kit";
import { logEvent } from "@/lib/events";
import {
  buildSubmissionMailWithIdentity,
  submissionMailIdentity,
} from "@/fyd/owner-mode/submission-mailer";
import {
  findOutboxRecord,
  newsletterOutboxKey,
  outboxConfigured,
  persistToOutbox,
  PING_FYD_TENANT_ID,
} from "@/fyd/owner-mode/submission-outbox";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : undefined;
    const source = typeof body.source === "string" ? body.source.trim() : undefined;

    // Extract acquisition metadata
    const referrer = request.headers.get("referer") || undefined;
    const userAgent = request.headers.get("user-agent") || "";
    const deviceClass = userAgent.includes("Mobile") ? "mobile" : userAgent.includes("Tablet") ? "tablet" : "desktop";
    const landingPage = request.url;

    // Extract UTM parameters from URL
    const url = new URL(request.url);
    const utmSource = url.searchParams.get("utm_source") || undefined;
    const utmMedium = url.searchParams.get("utm_medium") || undefined;
    const utmCampaign = url.searchParams.get("utm_campaign") || undefined;
    const utmContent = url.searchParams.get("utm_content") || undefined;
    const utmTerm = url.searchParams.get("utm_term") || undefined;

    // Validate email
    if (!email || !/^[^\s@]+\@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    const acquisition = {
      acquisitionSource: source || "website",
      landingPage,
      referrer,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      deviceClass,
    };

    if (outboxConfigured()) {
      const key = newsletterOutboxKey(email);
      const existing = await findOutboxRecord(
        PING_FYD_TENANT_ID,
        "newsletter-signup",
        key,
      );
      if (existing) {
        return NextResponse.json({
          success: true,
          replayed: true,
          captured: true,
          kit: {
            synced: existing.kitSync?.state === "synced",
            state: existing.kitSync?.state ?? "not_configured",
          },
        });
      }

      const receivedAt = new Date().toISOString();
      const receiptId = "nl-" + randomBytes(16).toString("hex");

      // Kit sync is attempted only when its credential exists, and
      // its outcome is recorded; it never gates the capture.
      let kitState: "not_configured" | "synced" | "failed" =
        "not_configured";
      let kitNote =
        "Kit credentials not configured; signup preserved for a future verified Kit sync.";
      let kitSubscriber: unknown;
      let kitCreated = false;
      let kitTagsApplied: unknown;
      let kitSequenceEnrolled = false;
      if ((process.env.KIT_API_KEY ?? "").trim()) {
        const kitResult = await syncNewsletterSubscriber({
          email,
          firstName,
          source,
        });
        if (kitResult.success) {
          kitState = "synced";
          kitNote = "Kit sync confirmed by the Kit API at capture time.";
          kitSubscriber = kitResult.subscriber;
          kitCreated = kitResult.created;
          kitTagsApplied = kitResult.tagsApplied;
          kitSequenceEnrolled = kitResult.sequenceEnrolled;
        } else {
          kitState = "failed";
          kitNote =
            "Kit sync attempted at capture and failed (" +
            (kitResult.failedOperation ?? kitResult.failure ?? "unknown") +
            "); signup preserved for a verified retry.";
        }
      }

      const identity = submissionMailIdentity();
      const mail = identity
        ? buildSubmissionMailWithIdentity(
            {
              kind: "newsletter-signup",
              headline: email,
              fields: [
                ["Email", email],
                ["First name", firstName ?? ""],
                ["Source", source ?? ""],
                [
                  "Consent",
                  "Granted by submitting the signup form on the website",
                ],
                ["Landing page", landingPage],
                ["Referrer", referrer ?? ""],
              ],
              receiptId,
              receivedAt,
            },
            identity,
          )
        : null;

      const persisted = await persistToOutbox({
        tenantId: PING_FYD_TENANT_ID,
        kind: "newsletter-signup",
        key,
        receipt: {
          receiptId,
          refId: null,
          businessName: null,
          receivedAt,
        },
        payload: {
          email,
          firstName: firstName ?? "",
          source: source ?? "",
          consent: {
            granted: true,
            method: "website-form",
            at: receivedAt,
            landingPage,
          },
          acquisition,
        },
        mail,
        kitSync: { state: kitState, at: receivedAt, note: kitNote },
      });

      if (!persisted.persisted) {
        // No durable capture, no success claim: the visitor keeps
        // their entry and can retry, exactly like the form routes.
        return NextResponse.json(
          {
            error: "capture_failed",
            message:
              "The signup could not be recorded. Please try again.",
          },
          { status: 503 }
        );
      }

      try {
        await logEvent(
          "NewsletterSignup",
          {
            email,
            firstName,
            captured: true,
            kitSyncState: kitState,
            ...(kitState === "synced"
              ? {
                  subscriberId: (
                    kitSubscriber as { id?: unknown } | undefined
                  )?.id,
                  tagsApplied: kitTagsApplied,
                  sequenceEnrolled: kitSequenceEnrolled,
                }
              : {}),
          },
          acquisition,
        );
      } catch {
        // Event logging is best-effort and must never fail a capture.
      }

      return NextResponse.json({
        success: true,
        captured: true,
        replayed: persisted.replayed,
        ...(kitState === "synced"
          ? {
              subscriber: kitSubscriber,
              kit: {
                synced: true,
                created: kitCreated,
                tagsApplied: kitTagsApplied,
                sequenceEnrolled: kitSequenceEnrolled,
              },
            }
          : {
              kit: { synced: false, state: kitState },
            }),
      });
    }

    // Legacy path (no outbox configured on this plane): Kit-first,
    // unchanged from the pre-relay behavior.
    const kitResult = await syncNewsletterSubscriber({
      email,
      firstName,
      source,
    });

    if (!kitResult.success) {
      const status = kitResult.failure === "validation" ? 503 : kitResult.suppressed ? 409 : 502;
      return NextResponse.json(
        {
          error: kitResult.suppressed ? "subscription_suppressed" : "kit_sync_failed",
          failure: kitResult.failure,
          operation: kitResult.failedOperation,
          message: kitResult.message,
        },
        { status }
      );
    }

    await logEvent("NewsletterSignup", {
      email,
      firstName,
      subscriberId: kitResult.subscriber?.id,
      tagsApplied: kitResult.tagsApplied,
      sequenceEnrolled: kitResult.sequenceEnrolled,
    }, acquisition);

    return NextResponse.json({
      success: true,
      subscriber: kitResult.subscriber,
      kit: {
        created: kitResult.created,
        tagsApplied: kitResult.tagsApplied,
        sequenceEnrolled: kitResult.sequenceEnrolled,
      },
    });
  } catch (error) {
    console.error("Newsletter subscription error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
