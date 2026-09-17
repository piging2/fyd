import { NextRequest, NextResponse } from "next/server";
import { applyGuideDownloadTag, findSubscriberByEmail } from "@/lib/kit";
import { logEvent } from "@/lib/events";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, resourceTitle, resourceUrl } = body;

    // Validate input
    if (!email || !resourceTitle) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Apply "Downloaded Guide" tag
    try {
      const subscriber = await findSubscriberByEmail(email);
      if (subscriber?.id) {
        await applyGuideDownloadTag(subscriber.id);
      }
    } catch (kitError) {
      console.error("Kit tagging failed (non-critical):", kitError);
    }

    // Log HPP event
    const url = new URL(request.url);
    logEvent("GuideDownloaded", {
      email,
      resourceTitle,
      resourceUrl,
    }, {
      acquisitionSource: "resource_download",
      landingPage: request.url,
      referrer: request.headers.get("referer") || undefined,
      utmSource: url.searchParams.get("utm_source") || undefined,
      utmMedium: url.searchParams.get("utm_medium") || undefined,
      utmCampaign: url.searchParams.get("utm_campaign") || undefined,
      utmContent: url.searchParams.get("utm_content") || undefined,
      utmTerm: url.searchParams.get("utm_term") || undefined,
    });

    return NextResponse.json({
      success: true,
      downloadUrl: resourceUrl,
    });
  } catch (error) {
    console.error("Resource download error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
