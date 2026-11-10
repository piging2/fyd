"use client";

import * as React from "react";
import { diyMonthlyCost, TOOLING_PER_SITE_ESTIMATE } from "@/lib/open-data";

const money = (n: number) => "$" + n.toLocaleString("en-US");

/**
 * The DIY true-cost calculator (spec: /open/costs). The visitor prices
 * their own hours; the tooling line is a labeled estimate. Pure math
 * lives in diyMonthlyCost and is unit-tested.
 */
const example = { hours: "3", rate: "75", sites: "1" };

const fields = [
  {
    key: "hours",
    label: "Your hours per week",
    help: "Posting, replying, fixing the site, chasing follow-up.",
    range: "0–60 hours, in half-hour increments.",
    min: 0, max: 60, step: 0.5,
  },
  {
    key: "rate",
    label: "What an hour of yours is worth",
    help: "What you would charge a customer for that hour.",
    range: "$0–$1,000 per hour, in $5 increments.",
    min: 0, max: 1000, step: 5,
  },
  {
    key: "sites",
    label: "Sites you run",
    help: "Each one needs the same upkeep.",
    range: "1–20 sites, in whole numbers.",
    min: 1, max: 20, step: 1,
  },
] as const;

export function DiyCalculator() {
  const [draft, setDraft] = React.useState(example);
  const [announcement, setAnnouncement] = React.useState("");
  const hasEdited = React.useRef(false);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []);

  const invalidFields = fields.filter(({ key, min, max, step }) => {
    const value = Number(draft[key]);
    return !draft[key] || value < min || value > max || !Number.isInteger((value - min) / step);
  });
  const valid = invalidFields.length === 0;
  const hours = Number(draft.hours);
  const rate = Number(draft.rate);
  const sites = Number(draft.sites);
  const diy = valid ? diyMonthlyCost(hours, rate, sites) : null;
  const growthTotal = valid ? 59 + Math.max(0, sites - 3) * 15 : null;

  React.useEffect(() => {
    if (!hasEdited.current) return;
    const timer = window.setTimeout(() => {
      setAnnouncement(diy === null || growthTotal === null
        ? "Estimate unavailable. Check the marked fields."
        : "Monthly estimates updated. Doing it yourself: " + money(diy) + ". Hosted DIY, Growth: " + money(growthTotal) + ".");
    }, 400);
    return () => window.clearTimeout(timer);
  }, [diy, growthTotal]);

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <fieldset className="grid gap-5 sm:grid-cols-3" disabled={!ready}>
        <legend className="sr-only">Cost assumptions</legend>
        {fields.map(({ key, label, help, range, min, max, step }) => {
          const id = "diy-" + key;
          const invalid = invalidFields.some((field) => field.key === key);
          return (
            <div key={key}>
              <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-text">{label}</label>
              <input
                id={id}
                type="number"
                min={min}
                max={max}
                step={step}
                value={draft[key]}
                onChange={(event) => {
                  hasEdited.current = true;
                  setDraft({ ...draft, [key]: event.target.value });
                }}
                aria-invalid={invalid || undefined}
                aria-describedby={id + "-help"}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text aria-invalid:border-red-600"
              />
              <p id={id + "-help"} className="mt-1.5 text-xs text-text-muted">
                {help} {invalid && <strong className="text-text">Enter a value in this range. </strong>}{range}
              </p>
            </div>
          );
        })}
      </fieldset>
      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          hasEdited.current = true;
          setDraft(example);
        }}
        className="mt-2 inline-flex min-h-11 items-center font-medium text-honey-text underline underline-offset-4"
      >
        Reset to example
      </button>
      <noscript><p className="mt-2 text-sm text-text-muted">The amounts below use the example inputs.</p></noscript>
      <p role="status" className="sr-only">{announcement}</p>

      <div className="mt-6 space-y-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border py-3">
          <p className="font-medium text-text">Doing it yourself, true cost</p>
          {diy === null ? (
            <p className="text-sm font-semibold text-text">Estimate unavailable</p>
          ) : (
            <p className="text-2xl font-bold tabular-nums text-text">{money(diy)}<span className="text-sm font-medium text-text-muted"> / mo</span></p>
          )}
        </div>
        <p className="pb-3 text-sm text-text-muted">
          {diy === null
            ? "Enter valid values in all three fields to see an estimate."
            : <>Your time at {money(Math.round(hours * rate * 4.33))} plus an estimated {money(TOOLING_PER_SITE_ESTIMATE)} per site for tools.</>}
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border py-3">
          <p className="font-medium text-text">Hosted DIY, Launch</p>
          <p className="text-2xl font-bold text-text">$29<span className="text-sm font-medium text-text-muted"> / mo</span></p>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border py-3">
          <p className="font-medium text-text">Hosted DIY, Growth{valid && sites > 3 ? " (incl. extra sites)" : ""}</p>
          {growthTotal === null ? (
            <p className="text-sm font-semibold text-text">Estimate unavailable</p>
          ) : (
            <p className="text-2xl font-bold tabular-nums text-text">{money(growthTotal)}<span className="text-sm font-medium text-text-muted"> / mo</span></p>
          )}
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border py-3">
          <p className="font-medium text-text">Concierge Retainer (we run it)</p>
          <p className="text-2xl font-bold text-text">$1,250<span className="text-sm font-medium text-text-muted"> / mo</span></p>
        </div>
      </div>
      <p className="mt-4 text-xs text-text-muted">
        Estimates, honestly labeled: the DIY total prices your hours at the rate you entered and a
        $20 per site tooling estimate. Tier prices are the locked v1 prices on the tiers page.
      </p>
    </div>
  );
}
