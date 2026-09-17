import { NextRequest, NextResponse } from "next/server";
import { syncNewsletterSubscriber } from "@/lib/kit";
import { logEvent } from "@/lib/events";

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
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

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
    }, {
      acquisitionSource: source || "website",
      landingPage,
      referrer,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      deviceClass,
    });

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
