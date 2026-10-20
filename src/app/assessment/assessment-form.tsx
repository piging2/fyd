"use client";

/**
 * AssessmentForm: the request form for /assessment.
 *
 * Posts to POST /api/fyd/assessment-request. Server-side validation is
 * authoritative; the client checks mirror it. The confirmation renders
 * ONLY after a real persisted submission returns a receipt. Every
 * state offers a next step: success says what happens next, and an
 * error preserves the entered values and offers retry plus the
 * contact page.
 */

import { useState } from "react";

interface Receipt {
  receiptId: string;
  requestRef: string;
  businessName: string;
  receivedAt: string;
}

type Errors = Partial<Record<string, string>>;

const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-3 text-text focus:border-honey focus:outline-none focus:ring-2 focus:ring-honey/40";
const labelClass = "block text-sm font-semibold text-text";
const hintClass = "mt-1 text-sm text-text-muted";
const errorClass = "mt-1 text-sm font-medium text-red-600";

export function AssessmentForm() {
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactChannel, setContactChannel] = useState("");
  const [contactDetail, setContactDetail] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [stuck, setStuck] = useState("");
  const [permissionFollowUp, setPermissionFollowUp] = useState(false);

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [replayed, setReplayed] = useState(false);

  function validate(): Errors {
    const e: Errors = {};
    if (businessName.trim().length < 2) e.businessName = "Please give the business name.";
    if (contactName.trim().length < 2) e.contactName = "Please give the contact name.";
    if (contactChannel !== "facebook" && contactChannel !== "phone" && contactChannel !== "email")
      e.contactChannel = "Choose how PING should follow up.";
    if (contactDetail.trim().length < 3)
      e.contactDetail = "Give the best contact detail for the channel you chose.";
    if (businessType.trim().length < 2) e.businessType = "Please give the business type or trade.";
    if (serviceArea.trim().length < 5) e.serviceArea = "Please describe the service area.";
    if (stuck.trim().length < 20)
      e.stuck = "Please tell us a little more: at least 20 characters about what feels slow, wasteful, or stuck.";
    if (!permissionFollowUp)
      e.permissionFollowUp = "Please confirm PING may follow up about this request.";
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
      const res = await fetch("/api/fyd/assessment-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessName,
          contactName,
          contactChannel,
          contactDetail,
          businessType,
          serviceArea,
          stuck,
          permissionFollowUp,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        field?: string;
        reason?: string;
        replayed?: boolean;
        receipt?: Receipt;
      };
      if (!data.ok || !data.receipt) {
        if (data.field && data.reason) {
          setErrors((prev) => ({ ...prev, [data.field as string]: data.reason }));
        }
        setFormError(
          data.reason ??
            "The request could not be submitted. Your entries are still on the form: please try again.",
        );
        return;
      }
      setReceipt(data.receipt);
      setReplayed(data.replayed === true);
    } catch {
      setFormError(
        "The request could not be submitted. Your entries are still on the form: please try again, or use the contact page instead.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div role="status" className="rounded-2xl border border-border-soft bg-surface p-8">
        <h2 className="text-2xl font-bold text-text">Thank you. Your request is in.</h2>
        <p className="mt-3 text-text-muted" style={{ lineHeight: "var(--leading-body)" }}>
          PING reviews every request. If it is a fit, PING follows up using the
          contact preference you gave, and the first step is a conversation
          about how your business actually runs.
        </p>
        {replayed && (
          <p className="mt-3 text-text-muted">
            This request matches one already on file, so this is the stored
            receipt for the earlier submission. Nothing new was created.
          </p>
        )}
        <dl className="mt-6 space-y-2 text-sm text-text-muted">
          <div>
            <dt className="font-semibold text-text">Business</dt>
            <dd>{receipt.businessName}</dd>
          </div>
          <div>
            <dt className="font-semibold text-text">Receipt</dt>
            <dd>
              <code>{receipt.receiptId}</code>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text">Reference</dt>
            <dd>
              <code>{receipt.requestRef}</code>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text">Received</dt>
            <dd>{receipt.receivedAt}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/contact"
            className="inline-flex h-11 items-center justify-center rounded-full bg-honey px-6 font-semibold text-honey-foreground transition-colors hover:bg-honey-hover"
          >
            Contact PING another way
          </a>
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
          <label htmlFor="as-business" className={labelClass}>
            Business name (required)
          </label>
          <input
            id="as-business"
            className={inputClass}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            maxLength={120}
            autoComplete="organization"
            aria-invalid={errors.businessName ? true : undefined}
            aria-describedby={errors.businessName ? "as-business-error" : undefined}
          />
          {errors.businessName && (
            <p id="as-business-error" className={errorClass}>
              {errors.businessName}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="as-contact-name" className={labelClass}>
            Contact name (required)
          </label>
          <input
            id="as-contact-name"
            className={inputClass}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            required
            maxLength={80}
            autoComplete="name"
            aria-invalid={errors.contactName ? true : undefined}
            aria-describedby={errors.contactName ? "as-contact-name-error" : undefined}
          />
          {errors.contactName && (
            <p id="as-contact-name-error" className={errorClass}>
              {errors.contactName}
            </p>
          )}
        </div>

        <fieldset>
          <legend className={labelClass}>Contact preference (required)</legend>
          <p className={hintClass}>
            How should PING follow up, and what is the best contact detail for
            that channel?
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {(
              [
                ["facebook", "Facebook message"],
                ["phone", "Phone"],
                ["email", "Email"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-text"
              >
                <input
                  type="radio"
                  name="as-contact-channel"
                  value={value}
                  checked={contactChannel === value}
                  onChange={(e) => setContactChannel(e.target.value)}
                  className="focus:outline-none focus:ring-2 focus:ring-honey/60"
                />
                {label}
              </label>
            ))}
          </div>
          {errors.contactChannel && (
            <p id="as-contact-channel-error" className={errorClass}>
              {errors.contactChannel}
            </p>
          )}
          <div className="mt-4">
            <label htmlFor="as-contact-detail" className={labelClass}>
              Best contact detail for that channel (required)
            </label>
            <input
              id="as-contact-detail"
              className={inputClass}
              value={contactDetail}
              onChange={(e) => setContactDetail(e.target.value)}
              required
              maxLength={200}
              placeholder="A Facebook page or profile, a phone number, or an email address"
              aria-invalid={errors.contactDetail ? true : undefined}
              aria-describedby={errors.contactDetail ? "as-contact-detail-error" : undefined}
            />
            {errors.contactDetail && (
              <p id="as-contact-detail-error" className={errorClass}>
                {errors.contactDetail}
              </p>
            )}
          </div>
        </fieldset>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="as-business-type" className={labelClass}>
              Business type or trade (required)
            </label>
            <input
              id="as-business-type"
              className={inputClass}
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              required
              maxLength={120}
              placeholder="For example: roofing, dental practice, law firm"
              aria-invalid={errors.businessType ? true : undefined}
              aria-describedby={errors.businessType ? "as-business-type-error" : undefined}
            />
            {errors.businessType && (
              <p id="as-business-type-error" className={errorClass}>
                {errors.businessType}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="as-service-area" className={labelClass}>
              Service area (required)
            </label>
            <input
              id="as-service-area"
              className={inputClass}
              value={serviceArea}
              onChange={(e) => setServiceArea(e.target.value)}
              required
              maxLength={1000}
              placeholder="For example: Grand Junction and Mesa County"
              aria-invalid={errors.serviceArea ? true : undefined}
              aria-describedby={errors.serviceArea ? "as-service-area-error" : undefined}
            />
            {errors.serviceArea && (
              <p id="as-service-area-error" className={errorClass}>
                {errors.serviceArea}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="as-stuck" className={labelClass}>
            What feels slow, wasteful, or stuck (required)
          </label>
          <p className={hintClass}>
            Missed calls, slow follow-up, paperwork at midnight, tools that do
            not talk to each other. Whatever costs you time or money today.
          </p>
          <textarea
            id="as-stuck"
            className={inputClass}
            value={stuck}
            onChange={(e) => setStuck(e.target.value)}
            required
            minLength={20}
            maxLength={2000}
            rows={6}
            aria-invalid={errors.stuck ? true : undefined}
            aria-describedby={errors.stuck ? "as-stuck-error" : undefined}
          />
          {errors.stuck && (
            <p id="as-stuck-error" className={errorClass}>
              {errors.stuck}
            </p>
          )}
        </div>

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={permissionFollowUp}
              onChange={(e) => setPermissionFollowUp(e.target.checked)}
              required
              className="mt-1 focus:outline-none focus:ring-2 focus:ring-honey/60"
              aria-invalid={errors.permissionFollowUp ? true : undefined}
              aria-describedby={errors.permissionFollowUp ? "as-permission-error" : undefined}
            />
            <span>PING may follow up with me about this request (required).</span>
          </label>
          {errors.permissionFollowUp && (
            <p id="as-permission-error" className={errorClass}>
              {errors.permissionFollowUp}
            </p>
          )}
        </div>

        {formError && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <p>{formError}</p>
            <p className="mt-2">
              You can also reach PING through the{" "}
              <a href="/contact" className="font-semibold underline">
                contact page
              </a>{" "}
              instead.
            </p>
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-honey px-8 font-semibold text-honey-foreground transition-colors hover:bg-honey-hover disabled:opacity-60 sm:w-auto"
          >
            {busy ? "Submitting..." : "Request the assessment"}
          </button>
        </div>
      </div>
    </form>
  );
}
