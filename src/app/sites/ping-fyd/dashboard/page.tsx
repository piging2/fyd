export const dynamic = "force-dynamic";

/**
 * FYD objects economic loop: the advertiser dashboard for PING
 * (lane B6; DESIGN.md component G).
 *
 * This is the advertiser's reporting surface for the loop's one
 * campaign, ping-house-001: the campaign's status and window, its
 * count caps (counts, never money), today's counted delivery
 * against those caps, per-day delivery history, and recent
 * placement-decision outcomes. The advertiser tenant of record is
 * ping-fyd, PING itself; v1 has no other advertiser.
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
  buildAdvertiserDashboard,
  type AdvertiserCampaignView,
  type CampaignDayTotals,
} from "@/fyd/ads/dashboards";
import {
  DecisionsSection,
  StampSection,
  TotalsSection,
} from "@/fyd/ads/dashboard-view";
import { isAdsLoopEnabled } from "@/fyd/ads/policy";

function CampaignSection({ campaign }: { campaign: AdvertiserCampaignView }) {
  return (
    <section>
      <h2>Campaign {campaign.campaignId}</h2>
      <dl>
        <dt>Sponsor</dt>
        <dd>{campaign.sponsorDisplayName}</dd>
        <dt>Promoted object</dt>
        <dd>{campaign.objectId}</dd>
        <dt>Status</dt>
        <dd>{campaign.status}</dd>
        <dt>Reason</dt>
        <dd>{campaign.reason}</dd>
        <dt>Surfaces</dt>
        <dd>{campaign.surfaces.join(", ")}</dd>
        <dt>Window</dt>
        <dd>
          {campaign.startsAt} to {campaign.endsAt}
        </dd>
        <dt>Purpose document</dt>
        <dd>{campaign.docRef}</dd>
        <dt>Budget scope (today)</dt>
        <dd>{campaign.budgetScopeRef}</dd>
        <dt>Daily impressions cap (count, not money)</dt>
        <dd>{campaign.caps.impressionsCap}</dd>
        <dt>Daily clicks cap (count, not money)</dt>
        <dd>{campaign.caps.clicksCap}</dd>
        <dt>Counted impressions today</dt>
        <dd>
          {campaign.today
            ? campaign.today.impressions + " of " + campaign.caps.impressionsCap
            : "withheld"}
        </dd>
        <dt>Counted clicks today</dt>
        <dd>
          {campaign.today
            ? campaign.today.clicks + " of " + campaign.caps.clicksCap
            : "withheld"}
        </dd>
      </dl>
    </section>
  );
}

function HistorySection({ history }: { history: CampaignDayTotals[] }) {
  return (
    <section>
      <h2>Delivery by day</h2>
      {history.length === 0 ? (
        <p>No delivery has been recorded yet.</p>
      ) : (
        history.map((day) => (
          <TotalsSection
            key={day.day}
            title={"Day " + day.day}
            totals={day}
          />
        ))
      )}
    </section>
  );
}

export default function PingFydAdvertiserDashboardPage() {
  if (!isAdsLoopEnabled()) notFound();
  const dashboard = buildAdvertiserDashboard();
  return (
    <main>
      <h1>Advertiser dashboard for {dashboard.advertiserTenantId}</h1>
      <StampSection stamp={dashboard.stamp} />
      {dashboard.campaign === null ? (
        <section>
          <h2>Campaign</h2>
          <p>The house campaign has not been created yet.</p>
        </section>
      ) : (
        <CampaignSection campaign={dashboard.campaign} />
      )}
      {dashboard.history === null ? (
        <section>
          <h2>Delivery by day</h2>
          <p>Withheld: the ledger does not verify.</p>
        </section>
      ) : (
        <HistorySection history={dashboard.history} />
      )}
      <DecisionsSection decisions={dashboard.recentDecisions} />
    </main>
  );
}
