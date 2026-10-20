"use client";

/**
 * NominateForm: the business nomination form for /nominate.
 *
 * Posts to POST /api/fyd/nomination. Server-side validation is
 * authoritative; the client checks mirror it. The confirmation
 * renders ONLY after a real persisted submission returns a receipt.
 * Every state offers a next step: success says what happens next,
 * and an error preserves the entered values and offers retry plus
 * the Facebook message path.
 */

import { useState } from "react";

const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61594275542163";

interface Receipt {
  receiptId: string;
  nominationRef: string;
  businessName: string;
  receivedAt: string;
}

type Errors = Partial<Record<string, string>>;

const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-3 text-text focus:border-honey focus:outline-none focus:ring-2 focus:ring-honey/40";
const labelClass = "block text-sm font-semibold text-text";
const hintClass = "mt-1 text-sm text-text-muted";
const errorClass = "mt-1 text-sm font-medium text-red-600";

export function NominateForm() {
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [exceptional, setExceptional] = useState("");
  const [nominatorName, setNominatorName] = useState("");
  const [nominatorContact, setNominatorContact] = useState("");
  const [permissionFollowUp, setPermissionFollowUp] = useState(false);

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [replayed, setReplayed] = useState(false);

  function validate(): Errors {
    const e: Errors = {};
    if (businessName.trim().length < 2) e.businessName = "Please give the business name.";
    if (category !== "skilled" && category !== "knowledge")
      e.category = "Choose skilled trades or knowledge work.";
    if (city.trim().length < 2) e.city = "Please give the city or service area.";
    if (exceptional.trim().length < 20)
      e.exceptional = "Please tell us a little more: at least 20 characters about what makes them exceptional.";
    if (nominatorContact.trim().length > 0 && !permissionFollowUp)
      e.permissionFollowUp = "If you leave a contact detail, please confirm PING may follow up.";
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
      const res = await fetch("/api/fyd/nomination", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessName,
          category,
          city,
          exceptional,
          nominatorName,
          nominatorContact,
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
            "The nomination could not be submitted. Your entries are still on the form: please try again.",
        );
        return;
      }
      setReceipt(data.receipt);
      setReplayed(data.replayed === true);
    } catch {
      setFormError(
        "The nomination could not be submitted. Your entries are still on the form: please try again, or message PING on Facebook instead.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div role="status" className="rounded-2xl border border-border-soft bg-surface p-8">
        <h2 className="text-2xl font-bold text-text">Thank you. That nomination counts.</h2>
        <p className="mt-3 text-text-muted" style={{ lineHeight: "var(--leading-body)" }}>
          Your nomination for {receipt.businessName} is counted. Before anything
          public happens, the business will be invited to apply or confirm for
          itself: nothing about a business is published without that
          business&apos;s own consent.
        </p>
        {replayed && (
          <p className="mt-3 text-text-muted">
            You already nominated this business, so this is the stored receipt
            for your earlier nomination. It is counted once, and nothing new
            was created.
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
              <code>{receipt.nominationRef}</code>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text">Received</dt>
            <dd>{receipt.receivedAt}</dd>
          </div>
        </dl>
        <p className="mt-6 text-text-muted">What happens next:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-text-muted">
          <li>The nomination is counted privately by PING.</li>
          <li>The business is invited to apply or confirm before anything public happens.</li>
          <li>Know another business that deserves a spotlight? Nominate it too.</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/apply"
            className="inline-flex h-11 items-center justify-center rounded-full bg-honey px-6 font-semibold text-honey-foreground transition-colors hover:bg-honey-hover"
          >
            Apply to be considered for a feature.
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
          <label htmlFor="nm-business" className={labelClass}>
            Business name (required)
          </label>
          <input
            id="nm-business"
            className={inputClass}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            maxLength={120}
            aria-invalid={errors.businessName ? true : undefined}
            aria-describedby={errors.businessName ? "nm-business-error" : undefined}
          />
          {errors.businessName && (
            <p id="nm-business-error" className={errorClass}>
              {errors.businessName}
            </p>
          )}
        </div>

        <fieldset>
          <legend className={labelClass}>Category (required)</legend>
          <p className={hintClass}>
            Which featured group does this business belong in?
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-text">
              <input
                type="radio"
                name="nm-category"
                value="skilled"
                checked={category === "skilled"}
                onChange={(e) => setCategory(e.target.value)}
                className="focus:outline-none focus:ring-2 focus:ring-honey/60"
              />
              Skilled tradespeople
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-text">
              <input
                type="radio"
                name="nm-category"
                value="knowledge"
                checked={category === "knowledge"}
                onChange={(e) => setCategory(e.target.value)}
                className="focus:outline-none focus:ring-2 focus:ring-honey/60"
              />
              Knowledge workers
            </label>
          </div>
          {errors.category && (
            <p id="nm-category-error" className={errorClass}>
              {errors.category}
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="nm-city" className={labelClass}>
            City or service area (required)
          </label>
          <input
            id="nm-city"
            className={inputClass}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
            maxLength={200}
            placeholder="For example: Grand Junction, or Mesa County"
            aria-invalid={errors.city ? true : undefined}
            aria-describedby={errors.city ? "nm-city-error" : undefined}
          />
          {errors.city && (
            <p id="nm-city-error" className={errorClass}>
              {errors.city}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="nm-exceptional" className={labelClass}>
            What makes them exceptional (required)
          </label>
          <p className={hintClass}>
            In your own words: the rescue job, the honest quote, the work you
            would trust again. That is what a nomination is for.
          </p>
          <textarea
            id="nm-exceptional"
            className={inputClass}
            value={exceptional}
            onChange={(e) => setExceptional(e.target.value)}
            required
            minLength={20}
            maxLength={2000}
            rows={6}
            aria-invalid={errors.exceptional ? true : undefined}
            aria-describedby={errors.exceptional ? "nm-exceptional-error" : undefined}
          />
          {errors.exceptional && (
            <p id="nm-exceptional-error" className={errorClass}>
              {errors.exceptional}
            </p>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="nm-nominator-name" className={labelClass}>
              Your name (optional)
            </label>
            <input
              id="nm-nominator-name"
              className={inputClass}
              value={nominatorName}
              onChange={(e) => setNominatorName(e.target.value)}
              maxLength={80}
              autoComplete="name"
            />
          </div>
          <div>
            <label htmlFor="nm-nominator-contact" className={labelClass}>
              Your contact (optional, only for follow-up)
            </label>
            <input
              id="nm-nominator-contact"
              className={inputClass}
              value={nominatorContact}
              onChange={(e) => setNominatorContact(e.target.value)}
              maxLength={200}
              placeholder="An email address or phone number"
            />
          </div>
        </div>

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={permissionFollowUp}
              onChange={(e) => setPermissionFollowUp(e.target.checked)}
              className="mt-1 focus:outline-none focus:ring-2 focus:ring-honey/60"
              aria-invalid={errors.permissionFollowUp ? true : undefined}
              aria-describedby={errors.permissionFollowUp ? "nm-permission-error" : undefined}
            />
            <span>
              PING may follow up with me about this nomination (required only
              if you leave a contact detail above).
            </span>
          </label>
          {errors.permissionFollowUp && (
            <p id="nm-permission-error" className={errorClass}>
              {errors.permissionFollowUp}
            </p>
          )}
        </div>

        <p className="rounded-lg bg-surface-2 p-4 text-sm text-text-muted">
          Nominations are counted privately by PING. Nothing about a business
          is published without that business&apos;s own consent.
        </p>

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
            {busy ? "Submitting..." : "Submit nomination"}
          </button>
        </div>
      </div>
    </form>
  );
}
