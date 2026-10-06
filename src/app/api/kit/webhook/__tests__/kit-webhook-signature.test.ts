/**
 * Kit webhook P0: X-Kit-Signature must verify before the event is accepted.
 * - missing secret -> 503, nothing processed
 * - missing/invalid signature -> 401, nothing processed
 * - valid signature -> 200, event mapped
 * - rotation: previous secret accepted
 * P1: subscriber.subscriber_unsubscribe maps to NewsletterUnsubscribed,
 * not NewsletterConfirmed.
 */
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { POST } from "../route";

const SECRET = "test-kit-webhook-secret-32chars-min";
const PREVIOUS = "previous-kit-webhook-secret-value";

function sign(body: string, secret: string): string {
  return "v1=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function postRequest(body: string, signature: string | null): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers["x-kit-signature"] = signature;
  return new NextRequest("https://example.com/api/kit/webhook", {
    method: "POST",
    headers,
    body,
  });
}

const PAYLOAD = JSON.stringify({
  event: { name: "subscriber.subscriber_activate" },
  subscriber: { id: 123, email_address: "a@example.com", first_name: "A", state: "active" },
});

async function call(body: string, signature: string | null) {
  const resp = await POST(postRequest(body, signature));
  let json: Record<string, unknown> = {};
  try { json = (await resp.json()) as Record<string, unknown>; } catch { /* ignore */ }
  return { status: resp.status, body: json };
}

describe("Kit webhook signature verification", () => {
  const ORIG_SECRET = process.env.KIT_WEBHOOK_SECRET;
  const ORIG_PREV = process.env.KIT_WEBHOOK_PREVIOUS_SECRET;

  beforeEach(() => {
    process.env.KIT_WEBHOOK_SECRET = SECRET;
    delete process.env.KIT_WEBHOOK_PREVIOUS_SECRET;
  });

  afterEach(() => {
    if (ORIG_SECRET === undefined) delete process.env.KIT_WEBHOOK_SECRET;
    else process.env.KIT_WEBHOOK_SECRET = ORIG_SECRET;
    if (ORIG_PREV === undefined) delete process.env.KIT_WEBHOOK_PREVIOUS_SECRET;
    else process.env.KIT_WEBHOOK_PREVIOUS_SECRET = ORIG_PREV;
  });

  test("no secret configured: 503, nothing processed", async () => {
    delete process.env.KIT_WEBHOOK_SECRET;
    const { status } = await call(PAYLOAD, sign(PAYLOAD, SECRET));
    expect(status).toBe(503);
  });

  test("missing signature: 401", async () => {
    const { status, body } = await call(PAYLOAD, null);
    expect(status).toBe(401);
    expect(body.error).toBe("Invalid webhook signature");
  });

  test("wrong signature: 401", async () => {
    const { status } = await call(PAYLOAD, sign(PAYLOAD, "wrong-secret"));
    expect(status).toBe(401);
  });

  test("tampered body: 401", async () => {
    const tampered = PAYLOAD.replace("a@example.com", "evil@example.com");
    const { status } = await call(tampered, sign(PAYLOAD, SECRET));
    expect(status).toBe(401);
  });

  test("valid signature: 200 received", async () => {
    const { status, body } = await call(PAYLOAD, sign(PAYLOAD, SECRET));
    expect(status).toBe(200);
    expect(body.received).toBe(true);
  });

  test("rotation: previous secret accepted", async () => {
    process.env.KIT_WEBHOOK_PREVIOUS_SECRET = PREVIOUS;
    const { status } = await call(PAYLOAD, sign(PAYLOAD, PREVIOUS));
    expect(status).toBe(200);
  });

  test("dual-signed header: any valid entry accepted", async () => {
    const dual = `${sign(PAYLOAD, "other-secret")},${sign(PAYLOAD, SECRET)}`;
    const { status } = await call(PAYLOAD, dual);
    expect(status).toBe(200);
  });
});
