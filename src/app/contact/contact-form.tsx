"use client";

/**
 * ContactForm: the general contact form for /contact (2026-10-23).
 *
 * Posts to POST /api/fyd/contact. Built on the same component
 * patterns as NominateForm: server-side validation is authoritative,
 * the client checks mirror it, the confirmation renders ONLY after
 * the server returns a receipt, and an error preserves the entered
 * values and offers retry plus the Facebook message path.
 */

import { useState } from "react";

const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61594275542163";

interface Receipt {
  receiptId: string;
  receivedAt: string;
}

type Errors = Partial<Record<string, string>>;

const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-3 text-text focus:border-honey focus:outline-none focus:ring-2 focus:ring-honey/40";
const labelClass = "block text-sm font-semibold text-text";
const errorClass = "mt-1 text-sm font-medium text-red-700";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [business, setBusiness] = useState("");
  const [message, setMessage] = useState("");

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  function validate(): Errors {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = "Please give your name.";
    if (!EMAIL_RE.test(email.trim()))
      e.email = "Please give a valid email address so we can reply.";
    if (business.trim().length < 2) e.business = "Please give the business name.";
    if (message.trim().length < 10)
      e.message = "Please tell us a little more: at least 10 characters.";
    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setFormError("A few fields need attention. They are marked below, and everything you entered is still here.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/fyd/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, business, message }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        field?: string;
        reason?: string;
        receipt?: Receipt;
      };
      if (!data.ok || !data.receipt) {
        if (data.field && data.reason) {
          setErrors((prev) => ({ ...prev, [data.field as string]: data.reason }));
        }
        setFormError(
          data.reason ??
            "The message could not be sent. Your entries are still on the form: please try again.",
        );
        return;
      }
      setReceipt(data.receipt);
    } catch {
      setFormError(
        "The message could not be sent. Your entries are still on the form: please try again, or message PING on Facebook instead.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div role="status" className="rounded-2xl border border-border-soft bg-surface p-8">
        <h2 className="text-2xl font-bold text-text">Thank you. Your message is in.</h2>
        <p className="mt-3 text-text-muted" style={{ lineHeight: "var(--leading-body)" }}>
          Your message reached the PING inbox. A conversation about your
          workflow comes first, recommendations second: expect a reply at
          the email address you gave us.
        </p>
        <dl className="mt-6 space-y-2 text-sm text-text-muted">
          <div>
            <dt className="font-semibold text-text">Receipt</dt>
            <dd>
              <code>{receipt.receiptId}</code>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text">Received</dt>
            <dd>{receipt.receivedAt}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 font-semibold text-text transition-colors hover:bg-surface-2"
          >
            Back to the homepage
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-2xl border border-border-soft bg-surface p-6 sm:p-8">
      <div className="grid gap-6">
        <div>
          <label htmlFor="ct-name" className={labelClass}>
            Your name (required)
          </label>
          <input
            id="ct-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            autoComplete="name"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "ct-name-error" : undefined}
          />
          {errors.name && (
            <p id="ct-name-error" className={errorClass}>
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="ct-email" className={labelClass}>
            Your email (required)
          </label>
          <input
            id="ct-email"
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={200}
            autoComplete="email"
            placeholder="you@yourbusiness.com"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "ct-email-error" : undefined}
          />
          {errors.email && (
            <p id="ct-email-error" className={errorClass}>
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="ct-business" className={labelClass}>
            Business name (required)
          </label>
          <input
            id="ct-business"
            className={inputClass}
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
            required
            maxLength={120}
            autoComplete="organization"
            aria-invalid={errors.business ? true : undefined}
            aria-describedby={errors.business ? "ct-business-error" : undefined}
          />
          {errors.business && (
            <p id="ct-business-error" className={errorClass}>
              {errors.business}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="ct-message" className={labelClass}>
            How can we help (required)
          </label>
          <textarea
            id="ct-message"
            className={inputClass}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            minLength={10}
            maxLength={2000}
            rows={6}
            placeholder="Tell us how your business runs and where it gets stuck."
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={errors.message ? "ct-message-error" : undefined}
          />
          {errors.message && (
            <p id="ct-message-error" className={errorClass}>
              {errors.message}
            </p>
          )}
        </div>

        {formError && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <p>{formError}</p>
            <p className="mt-2">
              Rather message us?{" "}
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                Message PING on Facebook
              </a>
              .
            </p>
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-honey px-8 font-semibold text-honey-foreground transition-colors hover:bg-honey-hover disabled:opacity-60 sm:w-auto"
          >
            {busy ? "Sending..." : "Send message"}
          </button>
        </div>
      </div>
    </form>
  );
}
