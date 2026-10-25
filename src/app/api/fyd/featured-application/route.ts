/**
 * POST /api/fyd/featured-application: featured application intake.
 *
 * The application path for the featured funnel (PING-WEBSITE-IMPROVE
 * F1, owner order 2026-10-20). A visitor applies to be considered for
 * a feature; the application is validated server-side (the client
 * checks are a courtesy, never the authority), persisted durably in
 * the tenant-private featured application store, and answered with an
 * opaque receipt that carries no contact details.
 *
 * Dedupe: an identical repeat submission (same normalized business
 * name + best contact detail) replays the stored receipt and creates
 * no second record.
 *
 * This is a sibling of POST /api/fyd/inquiry: it reuses that intake's
 * storage module discipline, dedupe discipline, and receipt shape
 * (see src/fyd/owner-mode/featured-application-store.ts) without
 * changing the inquiry route's behavior for existing tenants. The
 * inquiry intake itself is catalog and tenant bound (a service id
 * from a published catalog, admitted site ids, visitor name / contact
 * / message only), so it cannot carry the featured application fields.
 *
 * Delivery (2026-10-23 fix): the file store alone lost every
 * production application (Vercel's filesystem is read-only, the
 * store write threw, the route 500'd). Acceptance now runs through
 * acceptSubmission: the record is emailed to the operator inbox
 * (nolangesk@gmail.com) when a sending credential is configured,
 * and the file store is a best-effort secondary record whose
 * failure can never fail the submission again.
 *
 * Relay amendment (2026-10-25): in production the durable capture is
 * the submission outbox (private Blob store); the Pig mail worker
 * delivers the email over the proven Yahoo route, because SMTP from
 * Vercel's serverless egress is refused. Dedupe replay consults the
 * outbox as well as the file store.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  featuredApplicationDedupeKey,
  featuredReceiptForRecord,
  findFeaturedApplicationByDedupeKey,
  makeFeaturedApplicationRefs,
  saveFeaturedApplicationRecord,
  FEATURED_APPLICATION_SITE_ID,
  type FeaturedApplicationRecord,
  type FeaturedCollar,
  type FeaturedContactChannel,
} from "@/fyd/owner-mode/featured-application-store";
import { acceptSubmission } from "@/fyd/owner-mode/submission-mailer";
import {
  findOutboxRecord,
  persistToOutbox,
} from "@/fyd/owner-mode/submission-outbox";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

function invalid(field: string, reason: string) {
  return NextResponse.json(
    { ok: false, code: "invalid_input", field, reason },
    { status: 400 },
  );
}

function str(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? (body[key] as string).trim() : "";
}

function contactDetailLooksValid(
  channel: FeaturedContactChannel,
  detail: string,
): boolean {
  if (channel === "email") return EMAIL_RE.test(detail);
  if (channel === "phone") {
    const digits = detail.replace(/[\s\-().]/g, "");
    return /^\+?\d{7,15}$/.test(digits);
  }
  // Facebook: a page name, handle, or profile URL the applicant gives us.
  return detail.length >= 3 && detail.length <= 200;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_body", reason: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const businessName = str(body, "businessName");
  if (businessName.length < 2 || businessName.length > 120) {
    return invalid("businessName", "The business name must be 2-120 characters.");
  }
  const collarRaw = str(body, "collar");
  if (collarRaw !== "blue" && collarRaw !== "white") {
    return invalid("collar", "Choose skilled trades or knowledge work.");
  }
  const collar = collarRaw as FeaturedCollar;
  const trade = str(body, "trade");
  if (trade.length < 2 || trade.length > 120) {
    return invalid("trade", "The trade or profession must be 2-120 characters.");
  }
  const contactName = str(body, "contactName");
  if (contactName.length < 2 || contactName.length > 80) {
    return invalid("contactName", "The owner or contact name must be 2-80 characters.");
  }
  const serviceArea = str(body, "serviceArea");
  if (serviceArea.length < 5 || serviceArea.length > 1000) {
    return invalid("serviceArea", "The service area must be 5-1000 characters.");
  }
  const website = str(body, "website");
  if (website.length > 300) {
    return invalid("website", "The website must be 300 characters or fewer.");
  }
  const socialLinks = str(body, "socialLinks");
  if (socialLinks.length > 500) {
    return invalid("socialLinks", "Social links must be 500 characters or fewer.");
  }
  const exceptional = str(body, "exceptional");
  if (exceptional.length < 20 || exceptional.length > 2000) {
    return invalid(
      "exceptional",
      "Tell us what makes this business exceptional (20-2000 characters).",
    );
  }
  const portfolioLink = str(body, "portfolioLink");
  if (portfolioLink.length > 300) {
    return invalid("portfolioLink", "The photos or portfolio link must be 300 characters or fewer.");
  }
  const channelRaw = str(body, "contactChannel");
  if (channelRaw !== "facebook" && channelRaw !== "phone" && channelRaw !== "email") {
    return invalid("contactChannel", "Choose a preferred follow-up channel.");
  }
  const contactChannel = channelRaw as FeaturedContactChannel;
  const contactDetail = str(body, "contactDetail");
  if (!contactDetailLooksValid(contactChannel, contactDetail)) {
    return invalid(
      "contactDetail",
      "Give the best contact detail for the channel you chose.",
    );
  }
  if (body.permissionFollowUp !== true) {
    return invalid(
      "permissionFollowUp",
      "Permission to follow up is required so PING can respond to the application.",
    );
  }

  const dedupeKey = featuredApplicationDedupeKey(businessName, contactDetail);
  const existing = findFeaturedApplicationByDedupeKey(dedupeKey);
  if (existing) {
    return NextResponse.json({
      ok: true,
      replayed: true,
      receipt: featuredReceiptForRecord(existing),
    });
  }
  // The production-durable dedupe record lives in the outbox (the
  // file store above is empty on Vercel's read-only filesystem).
  const outboxExisting = await findOutboxRecord(
    FEATURED_APPLICATION_SITE_ID,
    "featured-application",
    dedupeKey,
  );
  if (outboxExisting) {
    return NextResponse.json({
      ok: true,
      replayed: true,
      receipt: {
        receiptId: outboxExisting.receipt.receiptId,
        applicationRef: outboxExisting.receipt.refId,
        businessName: outboxExisting.receipt.businessName,
        receivedAt: outboxExisting.receipt.receivedAt,
      },
    });
  }

  const { applicationRef, receiptId } = makeFeaturedApplicationRefs();
  const record: FeaturedApplicationRecord = {
    receiptId,
    applicationRef,
    dedupeKey,
    businessName,
    collar,
    trade,
    contactName,
    serviceArea,
    website,
    socialLinks,
    exceptional,
    portfolioLink,
    contactChannel,
    contactDetail,
    permissionFollowUp: true,
    receivedAt: new Date().toISOString(),
  };

  const outcome = await acceptSubmission({
    kind: "featured-application",
    headline: businessName,
    fields: [
      ["Business name", businessName],
      ["Category", collar === "blue" ? "Skilled tradespeople" : "Knowledge workers"],
      ["Trade or profession", trade],
      ["Contact name", contactName],
      ["Service area", serviceArea],
      ["Website", website],
      ["Social links", socialLinks],
      ["What makes this business exceptional", exceptional],
      ["Photos or portfolio link", portfolioLink],
      ["Preferred follow-up channel", contactChannel],
      ["Contact detail", contactDetail],
      ["Follow-up permission", "yes"],
    ],
    receiptId,
    receivedAt: record.receivedAt,
    ...(contactChannel === "email" ? { replyTo: contactDetail } : {}),
    outbox: (mail) =>
      persistToOutbox({
        tenantId: FEATURED_APPLICATION_SITE_ID,
        kind: "featured-application",
        key: dedupeKey,
        receipt: {
          receiptId,
          refId: applicationRef,
          businessName,
          receivedAt: record.receivedAt,
        },
        payload: { ...record },
        mail,
      }),
    store: () => saveFeaturedApplicationRecord(record),
  });
  if (!outcome.accepted) {
    // Neither the store nor email delivery succeeded: no receipt,
    // and no raw error leakage to the visitor.
    return NextResponse.json(
      {
        ok: false,
        code: "admission_failed",
        reason:
          "The application could not be stored. Your entries are still on the form: please try again.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    replayed: false,
    receipt: featuredReceiptForRecord(record),
  });
}
