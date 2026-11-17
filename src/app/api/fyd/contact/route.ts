/**
 * POST /api/fyd/contact: general contact intake (2026-10-23).
 *
 * The /contact page previously offered only a phone number and a
 * Facebook link: there was no form, so nothing a visitor wanted to
 * say could be submitted or retrieved. This route is the form's
 * intake. Fields: name, email, business, message.
 *
 * Delivery: email only, through the shared submission mailer to the
 * operator inbox (nolangesk@gmail.com). There is deliberately no
 * server-local file store on this path: that store class is what
 * silently lost every production submission on the other forms.
 * When no sending credential is configured the route fails with the
 * generic admission error rather than pretending to accept a
 * message it cannot deliver.
 */

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { acceptSubmission } from "@/fyd/owner-mode/submission-mailer";

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

  const name = str(body, "name");
  if (name.length < 2 || name.length > 80) {
    return invalid("name", "Your name must be 2-80 characters.");
  }
  const email = str(body, "email");
  if (email.length > 200 || !EMAIL_RE.test(email)) {
    return invalid("email", "Give a valid email address so we can reply.");
  }
  const business = str(body, "business");
  if (business.length < 2 || business.length > 120) {
    return invalid("business", "The business name must be 2-120 characters.");
  }
  const message = str(body, "message");
  if (message.length < 10 || message.length > 2000) {
    return invalid("message", "Tell us a little about what you need (10-2000 characters).");
  }

  const receiptId = "ct-" + randomBytes(16).toString("hex");
  const receivedAt = new Date().toISOString();

  const outcome = await acceptSubmission({
    kind: "contact",
    headline: business,
    fields: [
      ["Name", name],
      ["Email", email],
      ["Business", business],
      ["Message", message],
    ],
    receiptId,
    receivedAt,
    replyTo: email,
    // No store by design: email is the delivery path.
  });

  if (!outcome.accepted) {
    // No raw error leakage to the visitor.
    return NextResponse.json(
      {
        ok: false,
        code: "admission_failed",
        reason:
          "The message could not be sent. Your entries are still on the form: please try again.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    receipt: { receiptId, receivedAt },
  });
}
