"use client";

import * as React from "react";
import { diyMonthlyCost } from "@/lib/open-data";

const money = (n: number) => "$" + n.toLocaleString("en-US");

/**
 * The DIY true-cost calculator (spec: /open/costs). The visitor prices
 * their own hours; the tooling line is a labeled estimate. Pure math
 * lives in diyMonthlyCost and is unit-tested.
 */
export function DiyCalculator() {
  const [hours, setHours] = React.useState(3);
  const [rate, setRate] = React.useState(75);
  const [sites, setSites] = React.useState(1);

  const diy = diyMonthlyCost(hours, rate, sites);
  const growthTotal = 59 + Math.max(0, sites - 3) * 15;

  const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-text";
  const label = "mb-1.5 block text-sm font-medium text-text";

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <label htmlFor="diy-hours" className={label}>Your hours per week</label>
          <input id="diy-hours" type="number" min={0} max={60} step={0.5} value={hours}
            onChange={(e) => setHours(Number(e.target.value))} className={field} />
          <p className="mt-1.5 text-xs text-text-muted">Posting, replying, fixing the site, chasing follow-up.</p>
        </div>
        <div>
          <label htmlFor="diy-rate" className={label}>What an hour of yours is worth</label>
          <input id="diy-rate" type="number" min={0} max={1000} step={5} value={rate}
            onChange={(e) => setRate(Number(e.target.value))} className={field} />
          <p className="mt-1.5 text-xs text-text-muted">What you would charge a customer for that hour.</p>
        </div>
        <div>
          <label htmlFor="diy-sites" className={label}>Sites you run</label>
          <input id="diy-sites" type="number" min={1} max={20} step={1} value={sites}
            onChange={(e) => setSites(Number(e.target.value))} className={field} />
          <p className="mt-1.5 text-xs text-text-muted">Each one needs the same upkeep.</p>
        </div>
      </div>

      <div className="mt-8 space-y-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border py-3">
          <p className="font-medium text-text">Doing it yourself, true cost</p>
          <p className="text-2xl font-bold text-text">{money(diy)}<span className="text-sm font-medium text-text-muted"> / mo</span></p>
        </div>
        <p className="pb-3 text-sm text-text-muted">
          Your time at {money(Math.round(hours * rate * 4.33))} plus a $20 per site tooling estimate.
          The tooling is the small line. The time is the price.
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border py-3">
          <p className="font-medium text-text">Hosted DIY, Launch</p>
          <p className="text-2xl font-bold text-text">$29<span className="text-sm font-medium text-text-muted"> / mo</span></p>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border py-3">
          <p className="font-medium text-text">Hosted DIY, Growth{sites > 3 ? " (incl. extra sites)" : ""}</p>
          <p className="text-2xl font-bold text-text">{money(growthTotal)}<span className="text-sm font-medium text-text-muted"> / mo</span></p>
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
