/**
 * POST /api/fyd/assessment-request: assessment request intake.
 *
 * The request path for the practical technology and operations
 * assessment (/assessment, Offer B). Validated server-side (client
 * checks are a courtesy), persisted durably in the tenant-private
 * assessment request store, and answered with an opaque receipt that
 * carries no contact details.
 *
 * Dedupe: an identical repeat submission (same normalized business
 * name + best contact detail) replays the stored receipt and creates
 * no second record.
 *
 * A sibling of POST /api/fyd/featured-application, on the same
 * storage discipline (see src/fyd/owner-mode/assessment-request-store.ts).
 * No external sends, ever.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assessmentReceiptForRecord,
  assessmentRequestDedupeKey,
  findAssessmentRequestByDedupeKey,
  makeAssessmentRequestRefs,
  saveAssessmentRequestRecord,
  type AssessmentContactChannel,
  type AssessmentRequestRecord,
} from "@/fyd/owner-mode/assessment-request-store";

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
  channel: AssessmentContactChannel,
  detail: string,
): boolean {
  if (channel === "email") return EMAIL_RE.test(detail);
  if (channel === "phone") {
    const digits = detail.replace(/[\s\-().]/g, "");
    return /^\+?\d{7,15}$/.test(digits);
  }
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
  const contactName = str(body, "contactName");
  if (contactName.length < 2 || contactName.length > 80) {
    return invalid("contactName", "The contact name must be 2-80 characters.");
  }
  const channelRaw = str(body, "contactChannel");
  if (channelRaw !== "facebook" && channelRaw !== "phone" && channelRaw !== "email") {
    return invalid("contactChannel", "Choose a preferred follow-up channel.");
  }
  const contactChannel = channelRaw as AssessmentContactChannel;
  const contactDetail = str(body, "contactDetail");
  if (!contactDetailLooksValid(contactChannel, contactDetail)) {
    return invalid(
      "contactDetail",
      "Give the best contact detail for the channel you chose.",
    );
  }
  const businessType = str(body, "businessType");
  if (businessType.length < 2 || businessType.length > 120) {
    return invalid("businessType", "The business type or trade must be 2-120 characters.");
  }
  const serviceArea = str(body, "serviceArea");
  if (serviceArea.length < 5 || serviceArea.length > 1000) {
    return invalid("serviceArea", "The service area must be 5-1000 characters.");
  }
  const stuck = str(body, "stuck");
  if (stuck.length < 20 || stuck.length > 2000) {
    return invalid(
      "stuck",
      "Tell us what feels slow, wasteful, or stuck (20-2000 characters).",
    );
  }
  if (body.permissionFollowUp !== true) {
    return invalid(
      "permissionFollowUp",
      "Permission to follow up is required so PING can respond to the request.",
    );
  }

  const dedupeKey = assessmentRequestDedupeKey(businessName, contactDetail);
  const existing = findAssessmentRequestByDedupeKey(dedupeKey);
  if (existing) {
    return NextResponse.json({
      ok: true,
      replayed: true,
      receipt: assessmentReceiptForRecord(existing),
    });
  }

  const { requestRef, receiptId } = makeAssessmentRequestRefs();
  const record: AssessmentRequestRecord = {
    receiptId,
    requestRef,
    dedupeKey,
    businessName,
    contactName,
    contactChannel,
    contactDetail,
    businessType,
    serviceArea,
    stuck,
    permissionFollowUp: true,
    receivedAt: new Date().toISOString(),
  };

  try {
    saveAssessmentRequestRecord(record);
  } catch {
    // Fail closed, no receipt, and no raw error leakage to the visitor.
    return NextResponse.json(
      {
        ok: false,
        code: "admission_failed",
        reason:
          "The request could not be stored. Your entries are still on the form: please try again.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    replayed: false,
    receipt: assessmentReceiptForRecord(record),
  });
}
