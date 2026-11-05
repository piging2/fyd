export const dynamic = "force-dynamic";

/**
 * FYD objects economic loop: the loop-demo publisher dashboard
 * (lane B6; DESIGN.md component G).
 *
 * This is the controlled publisher's reporting surface: its slots
 * and consent state, counted impressions and clicks per slot, and
 * the excluded counts by classification, so the publisher sees the
 * abuse filtering working. The publisher tenant of record is
 * loop-demo (policy.ts LOOP_PUBLISHER_TENANT_ID): a demo tenant
 * PING operates end to end, NOT a real business and NOT
 * Coppersmith (receive-only, untouched).
 *
 * Page law:
 * - The dashboard is part of the sponsored path, so the loop
 *   enable flag gates it: with the flag OFF (the default) the page
 *   does not exist (404). The tenant-scoped read API for this same
 *   view is /api/fyd/ads/dashboards, which resolves identity
 *   server-side and refuses other tenants.
 * - Every number comes from the ledger read API through the
 *   dashboards.ts read model, attested by the reconciliation
 *   stamp. If the ledger's chain fails verification, the read
 *   model withholds all totals and this page shows the failure
 *   prominently instead of numbers.
 * - The page is read-only: it writes nothing to any store.
 */

import { notFound } from "next/navigation";
import {
  buildPublisherDashboard,
  type PublisherSlotRow,
} from "@/fyd/ads/dashboards";
import {
  DecisionsSection,
  StampSection,
  TotalsSection,
} from "@/fyd/ads/dashboard-view";
import { isAdsLoopEnabled } from "@/fyd/ads/policy";

function SlotSection({ slot }: { slot: PublisherSlotRow }) {
  return (
    <section>
      <h3>Slot {slot.slotId}</h3>
      <dl>
        <dt>Surface</dt>
        <dd>{slot.surface}</dd>
        <dt>Slot kind</dt>
        <dd>{slot.slotKind}</dd>
        <dt>Composition capacity</dt>
        <dd>{slot.compositionCapacity}</dd>
        <dt>Retired</dt>
        <dd>{slot.retired ? "yes" : "no"}</dd>
        <dt>Consent status</dt>
        <dd>{slot.consentStatus}</dd>
        <dt>Consent active</dt>
        <dd>{slot.consentActive ? "yes" : "no"}</dd>
        <dt>Disclosure version consented to</dt>
        <dd>{slot.disclosureTextVersion ?? "none"}</dd>
        <dt>Granted at</dt>
        <dd>{slot.grantedAt ?? "never"}</dd>
        <dt>Revoked at</dt>
        <dd>{slot.revokedAt ?? "not revoked"}</dd>
        <dt>Counted impressions</dt>
        <dd>{slot.counted ? slot.counted.impressions : "withheld"}</dd>
        <dt>Counted clicks</dt>
        <dd>{slot.counted ? slot.counted.clicks : "withheld"}</dd>
        <dt>Rate limited</dt>
        <dd>
          {slot.rateLimited === null
            ? "withheld"
            : slot.rateLimited
              ? "yes: drafts for this slot were rate-limited"
              : "no"}
        </dd>
      </dl>
      <TotalsSection
        title={"All rows for slot " + slot.slotId + " by classification"}
        totals={
          slot.byClassification === null || slot.counted === null
            ? null
            : {
                rows: Object.values(slot.byClassification).reduce(
                  (a, b) => a + b,
                  0,
                ),
                impressions: slot.counted.impressions,
                clicks: slot.counted.clicks,
                byClassification: slot.byClassification,
              }
        }
      />
    </section>
  );
}

export default function LoopDemoPublisherDashboardPage() {
  if (!isAdsLoopEnabled()) notFound();
  const dashboard = buildPublisherDashboard();
  return (
    <main>
      <h1>Publisher dashboard for {dashboard.publisherTenantId}</h1>
      <StampSection stamp={dashboard.stamp} />
      <section>
        <h2>My slots and consent state</h2>
        {dashboard.slots.length === 0 ? (
          <p>No placement slot has been declared yet.</p>
        ) : (
          dashboard.slots.map((slot) => (
            <SlotSection key={slot.slotId} slot={slot} />
          ))
        )}
      </section>
      <TotalsSection
        title="All my surfaces: totals and excluded counts"
        totals={dashboard.totals}
      />
      {dashboard.surfaceTotals === null ? null : (
        <section>
          <h2>By surface</h2>
          {dashboard.surfaceTotals.map((entry) => (
            <TotalsSection
              key={entry.surface}
              title={"Surface " + entry.surface}
              totals={entry.totals}
            />
          ))}
        </section>
      )}
      <DecisionsSection decisions={dashboard.recentDecisions} />
    </main>
  );
}
