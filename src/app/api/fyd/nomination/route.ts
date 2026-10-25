/**
 * POST /api/fyd/nomination: business nomination intake.
 *
 * The nomination path for the featured funnel (/nominate). Anyone can
 * nominate a business: customers, fans, and other businesses, not only
 * owners. A nomination must be a countable, durable record, which a
 * Facebook message cannot be, so the nomination lives here as its own
 * form type on the same intake discipline as the featured application
 * and assessment request routes.
 *
 * Validated server-side (client checks are a courtesy), persisted in
 * the tenant-private nomination store, answered with an opaque
 * receipt carrying no contact details. Dedupe is per nominator: a
 * repeat by the same nominator for the same business replays the
 * stored receipt; different nominators count separately.
 *
 * Nominations are counted privately by PING. Nothing about a business
 * is published without that business's own consent.
 *
 * Delivery (2026-10-23 fix): the file store alone lost every
 * production submission (Vercel's filesystem is read-only, the store
 * write threw, the route 500'd). Acceptance now runs through
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
  findNominationByDedupeKey,
  makeNominationRefs,
  nominationBusinessKey,
  nominationDedupeKey,
  nominationReceiptForRecord,
  saveNominationRecord,
  NOMINATION_SITE_ID,
  type NominationCategory,
  type NominationRecord,
} from "@/fyd/owner-mode/nomination-store";
import { acceptSubmission } from "@/fyd/owner-mode/submission-mailer";
import {
  findOutboxRecord,
  persistToOutbox,
} from "@/fyd/owner-mode/submission-outbox";

export const dynamic = "force-dynamic";

function invalid(field: string, reason: string) {
  return NextResponse.json(
    { ok: false, code: "invalid_input", field, reason },
    { status: 400 },
  );
}

function str(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? (body[key] as string).trim() : "";
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
  const categoryRaw = str(body, "category");
  if (categoryRaw !== "skilled" && categoryRaw !== "knowledge") {
    return invalid("category", "Choose skilled trades or knowledge work.");
  }
  const category = categoryRaw as NominationCategory;
  const city = str(body, "city");
  if (city.length < 2 || city.length > 200) {
    return invalid("city", "The city or service area must be 2-200 characters.");
  }
  const exceptional = str(body, "exceptional");
  if (exceptional.length < 20 || exceptional.length > 2000) {
    return invalid(
      "exceptional",
      "Tell us what makes them exceptional (20-2000 characters).",
    );
  }
  const nominatorName = str(body, "nominatorName");
  if (nominatorName.length > 80) {
    return invalid("nominatorName", "Your name must be 80 characters or fewer.");
  }
  const nominatorContact = str(body, "nominatorContact");
  if (nominatorContact.length > 200) {
    return invalid(
      "nominatorContact",
      "Your contact detail must be 200 characters or fewer.",
    );
  }
  const permissionFollowUp = body.permissionFollowUp === true;
  if (nominatorContact.length > 0 && !permissionFollowUp) {
    return invalid(
      "permissionFollowUp",
      "If you leave a contact detail, please confirm PING may follow up.",
    );
  }

  const businessKey = nominationBusinessKey(businessName, city);
  const dedupeKey = nominationDedupeKey(
    businessKey,
    nominatorContact,
    nominatorName,
  );
  if (dedupeKey !== null) {
    const existing = findNominationByDedupeKey(dedupeKey);
    if (existing) {
      return NextResponse.json({
        ok: true,
        replayed: true,
        receipt: nominationReceiptForRecord(existing),
      });
    }
    // The production-durable dedupe record lives in the outbox (the
    // file store above is empty on Vercel's read-only filesystem).
    const outboxExisting = await findOutboxRecord(
      NOMINATION_SITE_ID,
      "nomination",
      dedupeKey,
    );
    if (outboxExisting) {
      return NextResponse.json({
        ok: true,
        replayed: true,
        receipt: {
          receiptId: outboxExisting.receipt.receiptId,
          nominationRef: outboxExisting.receipt.refId,
          businessName: outboxExisting.receipt.businessName,
          receivedAt: outboxExisting.receipt.receivedAt,
        },
      });
    }
  }

  const { nominationRef, receiptId } = makeNominationRefs();
  const record: NominationRecord = {
    receiptId,
    nominationRef,
    businessKey,
    dedupeKey,
    businessName,
    category,
    city,
    exceptional,
    nominatorName,
    nominatorContact,
    permissionFollowUp,
    receivedAt: new Date().toISOString(),
  };

  const outcome = await acceptSubmission({
    kind: "nomination",
    headline: businessName,
    fields: [
      ["Business name", businessName],
      ["Category", category === "skilled" ? "Skilled tradespeople" : "Knowledge workers"],
      ["City or service area", city],
      ["What makes them exceptional", exceptional],
      ["Nominator name", nominatorName],
      ["Nominator contact", nominatorContact],
      ["Follow-up permission", permissionFollowUp ? "yes" : "no"],
    ],
    receiptId,
    receivedAt: record.receivedAt,
    ...(nominatorContact.includes("@")
      ? { replyTo: nominatorContact }
      : {}),
    outbox: (mail) =>
      persistToOutbox({
        tenantId: NOMINATION_SITE_ID,
        kind: "nomination",
        // The dedupe key makes a repeat submission a replay; an
        // anonymous nomination (null dedupe key) is always a new
        // countable record, keyed by its unique receipt id.
        key: dedupeKey ?? receiptId,
        receipt: {
          receiptId,
          refId: nominationRef,
          businessName,
          receivedAt: record.receivedAt,
        },
        payload: { ...record },
        mail,
      }),
    store: () => saveNominationRecord(record),
  });
  if (!outcome.accepted) {
    // Neither the store nor email delivery succeeded: no receipt,
    // and no raw error leakage to the visitor.
    return NextResponse.json(
      {
        ok: false,
        code: "admission_failed",
        reason:
          "The nomination could not be stored. Your entries are still on the form: please try again.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    replayed: false,
    receipt: nominationReceiptForRecord(record),
  });
}
