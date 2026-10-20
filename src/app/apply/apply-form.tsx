"use client";

/**
 * ApplyForm: the featured application form for /apply.
 *
 * Posts to POST /api/fyd/featured-application. Server-side validation
 * is authoritative; the client checks mirror it so errors are kind
 * and immediate. The confirmation renders ONLY after a real persisted
 * submission returns a receipt, never on click alone. Every state
 * offers a next step: success says what happens next, and an error
 * preserves the entered values and offers retry plus the Message
 * PING nomination path.
 */

import { useState } from "react";

const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61594275542163";

interface Receipt {
  receiptId: string;
  applicationRef: string;
  businessName: string;
  receivedAt: string;
}

type Errors = Partial<Record<string, string>>;

const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-3 text-text focus:border-honey focus:outline-none focus:ring-2 focus:ring-honey/40";
const labelClass = "block text-sm font-semibold text-text";
const hintClass = "mt-1 text-sm text-text-muted";
const errorClass = "mt-1 text-sm font-medium text-red-600";

export function ApplyForm() {
  const [businessName, setBusinessName] = useState("");
  const [collar, setCollar] = useState("");
  const [trade, setTrade] = useState("");
  const [contactName, setContactName] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [website, setWebsite] = useState("");
  const [socialLinks, setSocialLinks] = useState("");
  const [exceptional, setExceptional] = useState("");
  const [portfolioLink, setPortfolioLink] = useState("");
  const [contactChannel, setContactChannel] = useState("");
  const [contactDetail, setContactDetail] = useState("");
  const [permissionFollowUp, setPermissionFollowUp] = useState(false);

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [replayed, setReplayed] = useState(false);

  function validate(): Errors {
    const e: Errors = {};
    if (businessName.trim().length < 2) e.businessName = "Please give the business name.";
    if (collar !== "blue" && collar !== "white") e.collar = "Choose blue collar or white collar.";
    if (trade.trim().length < 2) e.trade = "Please give the trade or profession.";
    if (contactName.trim().length < 2) e.contactName = "Please give the owner or contact name.";
    if (serviceArea.trim().length < 5) e.serviceArea = "Please describe the service area.";
    if (exceptional.trim().length < 20)
      e.exceptional = "Please tell us a little more: at least 20 characters about what makes this business exceptional.";
    if (contactChannel !== "facebook" && contactChannel !== "phone" && contactChannel !== "email")
      e.contactChannel = "Choose how PING should follow up.";
    if (contactDetail.trim().length < 3)
      e.contactDetail = "Give the best contact detail for the channel you chose.";
    if (!permissionFollowUp)
      e.permissionFollowUp = "Please confirm PING may follow up about this application.";
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
      const res = await fetch("/api/fyd/featured-application", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
            "The application could not be submitted. Your entries are still on the form: please try again.",
        );
        return;
      }
      setReceipt(data.receipt);
      setReplayed(data.replayed === true);
    } catch {
      setFormError(
        "The application could not be submitted. Your entries are still on the form: please try again, or message PING on Facebook instead.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div role="status" className="rounded-2xl border border-border-soft bg-surface p-8">
        <h2 className="text-2xl font-bold text-text">Thank you. Your application is in.</h2>
        <p className="mt-3 text-text-muted" style={{ lineHeight: "var(--leading-body)" }}>
          Applications are reviewed by PING. Selection is not promised. Features
          appear in the Top Ranked Blue Collar Businesses of Western Colorado and
          Top Ranked White Collar Businesses of Western Colorado groups and on
          PING&apos;s pages.
        </p>
        {replayed && (
          <p className="mt-3 text-text-muted">
            This application matches one already on file, so this is the stored
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
              <code>{receipt.applicationRef}</code>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text">Received</dt>
            <dd>{receipt.receivedAt}</dd>
          </div>
        </dl>
        <p className="mt-6 text-text-muted">What happens next:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-text-muted">
          <li>PING reviews the application.</li>
          <li>If it is a strong fit, PING follows up using the contact preference you gave.</li>
          <li>Know another business that deserves a spotlight? Nominate it below.</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={FACEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-full bg-honey px-6 font-semibold text-honey-foreground transition-colors hover:bg-honey-hover"
          >
            Message PING to nominate a business
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
          <label htmlFor="fa-business" className={labelClass}>
            Business name (required)
          </label>
          <input
            id="fa-business"
            className={inputClass}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            maxLength={120}
            autoComplete="organization"
            aria-invalid={errors.businessName ? true : undefined}
            aria-describedby={errors.businessName ? "fa-business-error" : undefined}
          />
          {errors.businessName && (
            <p id="fa-business-error" className={errorClass}>
              {errors.businessName}
            </p>
          )}
        </div>

        <fieldset>
          <legend className={labelClass}>Category (required)</legend>
          <p className={hintClass}>
            The two featured groups are the destination, so tell us which one this
            business belongs in, and its trade or profession.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-text">
              <input
                type="radio"
                name="fa-collar"
                value="blue"
                checked={collar === "blue"}
                onChange={(e) => setCollar(e.target.value)}
                className="focus:outline-none focus:ring-2 focus:ring-honey/60"
              />
              Blue collar
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-text">
              <input
                type="radio"
                name="fa-collar"
                value="white"
                checked={collar === "white"}
                onChange={(e) => setCollar(e.target.value)}
                className="focus:outline-none focus:ring-2 focus:ring-honey/60"
              />
              White collar
            </label>
          </div>
          {errors.collar && (
            <p id="fa-collar-error" className={errorClass}>
              {errors.collar}
            </p>
          )}
          <div className="mt-4">
            <label htmlFor="fa-trade" className={labelClass}>
              Trade or profession (required)
            </label>
            <input
              id="fa-trade"
              className={inputClass}
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              required
              maxLength={120}
              placeholder="For example: roofing, plumbing, accounting, law"
              aria-invalid={errors.trade ? true : undefined}
              aria-describedby={errors.trade ? "fa-trade-error" : undefined}
            />
            {errors.trade && (
              <p id="fa-trade-error" className={errorClass}>
                {errors.trade}
              </p>
            )}
          </div>
        </fieldset>

        <div>
          <label htmlFor="fa-contact-name" className={labelClass}>
            Owner or contact name (required)
          </label>
          <input
            id="fa-contact-name"
            className={inputClass}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            required
            maxLength={80}
            autoComplete="name"
            aria-invalid={errors.contactName ? true : undefined}
            aria-describedby={errors.contactName ? "fa-contact-name-error" : undefined}
          />
          {errors.contactName && (
            <p id="fa-contact-name-error" className={errorClass}>
              {errors.contactName}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="fa-service-area" className={labelClass}>
            Service area (required)
          </label>
          <p className={hintClass}>
            The towns and areas this business serves across Western Colorado.
          </p>
          <textarea
            id="fa-service-area"
            className={inputClass}
            value={serviceArea}
            onChange={(e) => setServiceArea(e.target.value)}
            required
            maxLength={1000}
            rows={3}
            aria-invalid={errors.serviceArea ? true : undefined}
            aria-describedby={errors.serviceArea ? "fa-service-area-error" : undefined}
          />
          {errors.serviceArea && (
            <p id="fa-service-area-error" className={errorClass}>
              {errors.serviceArea}
            </p>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="fa-website" className={labelClass}>
              Website (optional)
            </label>
            <input
              id="fa-website"
              className={inputClass}
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              maxLength={300}
              inputMode="url"
              placeholder="https://"
            />
          </div>
          <div>
            <label htmlFor="fa-socials" className={labelClass}>
              Social links (optional)
            </label>
            <input
              id="fa-socials"
              className={inputClass}
              value={socialLinks}
              onChange={(e) => setSocialLinks(e.target.value)}
              maxLength={500}
              placeholder="Facebook, Instagram, or other profile links"
            />
          </div>
        </div>

        <div>
          <label htmlFor="fa-exceptional" className={labelClass}>
            What makes this business exceptional (required)
          </label>
          <p className={hintClass}>
            The work, the people, the reputation, the story. Whatever makes this
            business one of the best of the best.
          </p>
          <textarea
            id="fa-exceptional"
            className={inputClass}
            value={exceptional}
            onChange={(e) => setExceptional(e.target.value)}
            required
            minLength={20}
            maxLength={2000}
            rows={6}
            aria-invalid={errors.exceptional ? true : undefined}
            aria-describedby={errors.exceptional ? "fa-exceptional-error" : undefined}
          />
          {errors.exceptional && (
            <p id="fa-exceptional-error" className={errorClass}>
              {errors.exceptional}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="fa-portfolio" className={labelClass}>
            Photos or portfolio (optional)
          </label>
          <p className={hintClass}>
            A link to photos or a portfolio page, if you have one to share.
          </p>
          <input
            id="fa-portfolio"
            className={inputClass}
            value={portfolioLink}
            onChange={(e) => setPortfolioLink(e.target.value)}
            maxLength={300}
            inputMode="url"
            placeholder="https://"
          />
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
                  name="fa-contact-channel"
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
            <p id="fa-contact-channel-error" className={errorClass}>
              {errors.contactChannel}
            </p>
          )}
          <div className="mt-4">
            <label htmlFor="fa-contact-detail" className={labelClass}>
              Best contact detail for that channel (required)
            </label>
            <input
              id="fa-contact-detail"
              className={inputClass}
              value={contactDetail}
              onChange={(e) => setContactDetail(e.target.value)}
              required
              maxLength={200}
              placeholder="A Facebook page or profile, a phone number, or an email address"
              aria-invalid={errors.contactDetail ? true : undefined}
              aria-describedby={errors.contactDetail ? "fa-contact-detail-error" : undefined}
            />
            {errors.contactDetail && (
              <p id="fa-contact-detail-error" className={errorClass}>
                {errors.contactDetail}
              </p>
            )}
          </div>
        </fieldset>

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={permissionFollowUp}
              onChange={(e) => setPermissionFollowUp(e.target.checked)}
              required
              className="mt-1 focus:outline-none focus:ring-2 focus:ring-honey/60"
              aria-invalid={errors.permissionFollowUp ? true : undefined}
              aria-describedby={errors.permissionFollowUp ? "fa-permission-error" : undefined}
            />
            <span>
              PING may follow up with me about this application (required).
            </span>
          </label>
          {errors.permissionFollowUp && (
            <p id="fa-permission-error" className={errorClass}>
              {errors.permissionFollowUp}
            </p>
          )}
        </div>

        {formError && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <p>{formError}</p>
            <p className="mt-2">
              You can also{" "}
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                message PING on Facebook
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
            {busy ? "Submitting..." : "Submit application"}
          </button>
          <p className="mt-3 text-sm text-text-muted">
            Applying is free. No ranking is sold, and no placement is guaranteed.
          </p>
        </div>
      </div>
    </form>
  );
}
