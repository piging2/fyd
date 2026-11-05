/**
 * Dashboards read models for the FYD objects economic loop
 * (DESIGN.md component G; lane B6).
 *
 * Two read-only views over the loop's stores:
 * - the publisher dashboard (the controlled loop-demo publisher):
 *   its slots with consent state, counted impressions and clicks per
 *   slot, and the excluded counts by classification, so the
 *   publisher can see the abuse filtering working;
 * - the advertiser dashboard (PING, tenant ping-fyd): the house
 *   campaign's state, today's counted delivery against its count
 *   caps, per-day delivery history, and recent decision outcomes.
 *
 * Truth law (DESIGN.md verification step 4 and the B6 brief):
 * - The B2 ledger read API is the ONLY source of numbers here. No
 *   total is computed from anything else, and nothing in this module
 *   writes to any store.
 * - Every view carries a reconciliation stamp built from the
 *   ledger's own recount (an independent re-aggregation over the raw
 *   day files) plus its chain verification. A view is trustworthy
 *   only when the chain verifies AND the recount matches the read
 *   API exactly.
 * - When a view is not trustworthy, its ledger-derived totals are
 *   WITHHELD (null), never served as truth: the stamp carries the
 *   exact chain failure so the surface can show it prominently.
 *   Store-projected state (slots, consent, campaign, decisions) is
 *   not ledger data and is still shown; each store fails closed on
 *   its own corruption.
 */

import {
  readCampaign,
  type CampaignState,
  type CampaignStatus,
} from "./campaign-store";
import {
  listPlacementDecisionIds,
  readPlacementDecision,
  type PlacementDecisionRecord,
} from "./decision-store";
import {
  createAdsEventLedger,
  type AdsEventLedger,
  type LedgerClassification,
  type LedgerReadFilter,
  type LedgerSummary,
} from "./event-ledger";
import { listSlots, type SlotState } from "./inventory-store";
import { slotReadback, type ConsentStatus } from "./opt-in";
import {
  budgetScopeRef,
  DAILY_CLICKS_CAP,
  DAILY_IMPRESSIONS_CAP,
  LOOP_PUBLISHER_TENANT_ID,
  utcDayKey,
} from "./policy";

/** The loop's one advertiser tenant in v1: PING itself (DESIGN.md actors). */
export const LOOP_ADVERTISER_TENANT_ID = "ping-fyd" as const;

/** The loop's one campaign in v1 (DESIGN.md, the one campaign object). */
export const LOOP_HOUSE_CAMPAIGN_ID = "ping-house-001" as const;

/** How many recent decision outcomes each dashboard lists. */
export const DASHBOARD_RECENT_DECISIONS = 10;

/* ------------------------------------------------------------------ */
/* Reconciliation stamp                                                */
/* ------------------------------------------------------------------ */

/**
 * The stamp both dashboards render. It attests, for one view scope:
 * the hash chain verifies, and totals independently recounted from
 * the raw ledger rows equal the read API's aggregates.
 */
export interface ReconciliationStamp {
  /** ISO timestamp of the read that produced this stamp. */
  generatedAt: string;
  /** True only when the chain verifies AND the recount matches. */
  trustworthy: boolean;
  /** The ledger hash chain verifies over every day file. */
  chainOk: boolean;
  /** The raw-row recount equals the read API's aggregates. */
  recountMatch: boolean;
  /** All ledger rows scanned by the recount, every day, unfiltered. */
  rowsScanned: number;
  /** Rows inside this view's scope, as recounted from raw rows. */
  rows: number;
  /** COUNTED rows inside this view's scope, as recounted. */
  countedRows: number;
  /**
   * First 12 hex chars of the newest day's last row hash; null when
   * the ledger is empty or the chain does not verify.
   */
  lastRowHashShort: string | null;
  /** The exact chain failure; null when the chain verifies. */
  failure: { day: string; atRow: number; reason: string } | null;
}

/**
 * Build the stamp for one view scope. The recount is the ledger's
 * own independent aggregation path; verifyChain supplies the precise
 * failure coordinates. Neither path shares the totals code under
 * attestation.
 */
export function buildReconciliationStamp(
  ledger: AdsEventLedger,
  filter: LedgerReadFilter,
  nowMs: number,
): ReconciliationStamp {
  const recount = ledger.recount(filter);
  const chain = ledger.verifyChain();
  const chainOk = recount.chainOk && chain.ok;
  const failure =
    chain.failure ??
    (recount.failure
      ? {
          day: recount.failure.day,
          atRow: recount.failure.atRow,
          reason: recount.failure.reason,
        }
      : null);
  const trustworthy =
    chainOk && recount.match && recount.summary !== null;
  let lastRowHashShort: string | null = null;
  if (chainOk) {
    for (const day of chain.days) {
      if (day.lastHash !== null) {
        lastRowHashShort = day.lastHash.slice(0, 12);
      }
    }
  }
  return {
    generatedAt: new Date(nowMs).toISOString(),
    trustworthy,
    chainOk,
    recountMatch: recount.match,
    rowsScanned: recount.rowsScanned,
    rows: recount.recounted.rows,
    countedRows: recount.recounted.byClassification.COUNTED,
    lastRowHashShort,
    failure: chainOk ? null : failure,
  };
}

/* ------------------------------------------------------------------ */
/* Decision outcomes (the B3 audit trail, read-only)                   */
/* ------------------------------------------------------------------ */

/** One placement-decision outcome, as the dashboards list it. */
export interface DecisionOutcome {
  decisionId: string;
  /** ISO timestamp of the evaluation. */
  evaluatedAt: string;
  surface: string;
  slotId: string | null;
  campaignId: string | null;
  eligible: boolean;
  /** The named rejection or gate when not eligible; null when eligible. */
  reason: string | null;
  /** Whether the placement reached the composition, when recorded. */
  includedInComposition: boolean | null;
}

function toDecisionOutcome(record: PlacementDecisionRecord): DecisionOutcome {
  return {
    decisionId: record.decisionId,
    evaluatedAt: new Date(record.evaluatedAt).toISOString(),
    surface: record.surface,
    slotId: record.slotId,
    campaignId: record.campaignId,
    eligible: record.evaluation.eligible,
    reason: record.evaluation.eligible ? null : record.evaluation.reason,
    includedInComposition: record.composition
      ? record.composition.included
      : null,
  };
}

/**
 * The newest decision outcomes matching a scope predicate, newest
 * first (decisionId breaks ties, so the order is deterministic).
 * A corrupt decision record fails closed (the store throws), like
 * every other loop read.
 */
export function recentDecisionOutcomes(
  predicate: (record: PlacementDecisionRecord) => boolean,
  limit: number = DASHBOARD_RECENT_DECISIONS,
): DecisionOutcome[] {
  const records: PlacementDecisionRecord[] = [];
  for (const id of listPlacementDecisionIds()) {
    const record = readPlacementDecision(id);
    if (record !== null && predicate(record)) records.push(record);
  }
  records.sort((a, b) => {
    if (b.evaluatedAt !== a.evaluatedAt) return b.evaluatedAt - a.evaluatedAt;
    return a.decisionId < b.decisionId ? 1 : -1;
  });
  return records.slice(0, limit).map(toDecisionOutcome);
}

/* ------------------------------------------------------------------ */
/* Shared build options                                                */
/* ------------------------------------------------------------------ */

export interface DashboardBuildOptions {
  /** Ledger override (tests); default a fresh canonical ledger. */
  ledger?: AdsEventLedger;
  /** Clock override (tests); default Date.now. */
  now?: () => number;
}

function resolveBuild(options: DashboardBuildOptions): {
  ledger: AdsEventLedger;
  nowMs: number;
} {
  return {
    ledger: options.ledger ?? createAdsEventLedger(),
    nowMs: (options.now ?? (() => Date.now()))(),
  };
}

/* ------------------------------------------------------------------ */
/* Publisher dashboard                                                 */
/* ------------------------------------------------------------------ */

/** One slot row: store-projected consent state plus ledger counts. */
export interface PublisherSlotRow {
  slotId: string;
  surface: string;
  slotKind: SlotState["slotKind"];
  compositionCapacity: number;
  retired: boolean;
  consentStatus: ConsentStatus;
  consentActive: boolean;
  consentId: string | null;
  disclosureTextVersion: string | null;
  grantedAt: string | null;
  revokedAt: string | null;
  /** Counted impressions/clicks for this slot; null when withheld. */
  counted: { impressions: number; clicks: number } | null;
  /** Every row for this slot by classification; null when withheld. */
  byClassification: Record<LedgerClassification, number> | null;
  /**
   * True when any draft for this slot was rate-limited (DESIGN.md
   * abuse control 5: the slot is flagged in the publisher
   * dashboard); null when withheld.
   */
  rateLimited: boolean | null;
}

/** Counted totals plus the full classification split for one scope. */
export interface DashboardTotals {
  rows: number;
  impressions: number;
  clicks: number;
  byClassification: Record<LedgerClassification, number>;
}

export interface PublisherDashboard {
  view: "publisher";
  publisherTenantId: string;
  /** ISO timestamp of this read (the stamp's generatedAt). */
  generatedAt: string;
  slots: PublisherSlotRow[];
  /** The publisher's surfaces, in slot order. */
  surfaces: string[];
  /**
   * Rollup over every row attributed to the publisher's slots;
   * null when the stamp is not trustworthy (totals withheld).
   */
  totals: DashboardTotals | null;
  /** Per-surface classification totals; null when withheld. */
  surfaceTotals: { surface: string; totals: DashboardTotals }[] | null;
  recentDecisions: DecisionOutcome[];
  stamp: ReconciliationStamp;
}

function toTotals(summary: LedgerSummary): DashboardTotals {
  return {
    rows: summary.rows,
    impressions: summary.impressions,
    clicks: summary.clicks,
    byClassification: summary.byClassification,
  };
}

export function buildPublisherDashboard(
  options: DashboardBuildOptions = {},
): PublisherDashboard {
  const { ledger, nowMs } = resolveBuild(options);
  const publisherTenantId: string = LOOP_PUBLISHER_TENANT_ID;
  const stamp = buildReconciliationStamp(
    ledger,
    { tenantId: publisherTenantId },
    nowMs,
  );
  const slots = listSlots(publisherTenantId);
  const surfaces: string[] = [];
  for (const slot of slots) {
    if (!surfaces.includes(slot.surface)) surfaces.push(slot.surface);
  }
  const slotRows: PublisherSlotRow[] = slots.map((slot) => {
    const readback = slotReadback(slot);
    let counted: PublisherSlotRow["counted"] = null;
    let byClassification: PublisherSlotRow["byClassification"] = null;
    let rateLimited: PublisherSlotRow["rateLimited"] = null;
    if (stamp.trustworthy) {
      const summary = ledger.summarize({ slotId: slot.slotId });
      counted = {
        impressions: summary.impressions,
        clicks: summary.clicks,
      };
      byClassification = summary.byClassification;
      rateLimited = summary.byClassification.RATE_LIMITED > 0;
    }
    return {
      slotId: slot.slotId,
      surface: slot.surface,
      slotKind: slot.slotKind,
      compositionCapacity: slot.compositionCapacity,
      retired: slot.retired,
      consentStatus: readback.consentStatus,
      consentActive: slot.consentActive,
      consentId: readback.consentId,
      disclosureTextVersion: readback.disclosureTextVersion,
      grantedAt: readback.grantedAt,
      revokedAt: readback.revokedAt,
      counted,
      byClassification,
      rateLimited,
    };
  });
  let totals: PublisherDashboard["totals"] = null;
  let surfaceTotals: PublisherDashboard["surfaceTotals"] = null;
  if (stamp.trustworthy) {
    totals = toTotals(ledger.summarize({ tenantId: publisherTenantId }));
    surfaceTotals = surfaces.map((surface) => ({
      surface,
      totals: toTotals(
        ledger.summarize({ tenantId: publisherTenantId, surface }),
      ),
    }));
  }
  return {
    view: "publisher",
    publisherTenantId,
    generatedAt: stamp.generatedAt,
    slots: slotRows,
    surfaces,
    totals,
    surfaceTotals,
    recentDecisions: recentDecisionOutcomes(
      (record) => record.publisherTenantId === publisherTenantId,
    ),
    stamp,
  };
}

/* ------------------------------------------------------------------ */
/* Advertiser dashboard                                                */
/* ------------------------------------------------------------------ */

/** The house campaign's state plus today's counted delivery. */
export interface AdvertiserCampaignView {
  campaignId: string;
  payerId: string;
  sponsorDisplayName: string;
  objectId: string;
  status: CampaignStatus;
  reason: string;
  docRef: string;
  surfaces: string[];
  /** ISO window bounds from the campaign record. */
  startsAt: string;
  endsAt: string;
  /** Count caps from the campaign record (counts, never money). */
  caps: { impressionsCap: number; clicksCap: number };
  /** Today's budget scope ref, in the policy's format. */
  budgetScopeRef: string;
  /** Today's counted delivery against the caps; null when withheld. */
  today: { day: string; impressions: number; clicks: number } | null;
}

/** One UTC day of delivery for the campaign, from ledger rows. */
export interface CampaignDayTotals extends DashboardTotals {
  /** UTC day key (yyyymmdd) of server receipt. */
  day: string;
}

export interface AdvertiserDashboard {
  view: "advertiser";
  advertiserTenantId: string;
  /** ISO timestamp of this read (the stamp's generatedAt). */
  generatedAt: string;
  /** The house campaign's view; null until the campaign exists. */
  campaign: AdvertiserCampaignView | null;
  /** Per-day delivery history, oldest first; null when withheld. */
  history: CampaignDayTotals[] | null;
  recentDecisions: DecisionOutcome[];
  stamp: ReconciliationStamp;
}

export function buildAdvertiserDashboard(
  options: DashboardBuildOptions = {},
): AdvertiserDashboard {
  const { ledger, nowMs } = resolveBuild(options);
  const advertiserTenantId: string = LOOP_ADVERTISER_TENANT_ID;
  const campaignId: string = LOOP_HOUSE_CAMPAIGN_ID;
  const stamp = buildReconciliationStamp(ledger, { campaignId }, nowMs);
  const state: CampaignState | null = readCampaign(
    campaignId,
    advertiserTenantId,
  );
  const todayKey = utcDayKey(nowMs);
  let campaign: AdvertiserCampaignView | null = null;
  if (state !== null) {
    let today: AdvertiserCampaignView["today"] = null;
    if (stamp.trustworthy) {
      const totals = ledger.countedTotalsByCampaign(campaignId, todayKey);
      today = {
        day: todayKey,
        impressions: totals.impressions,
        clicks: totals.clicks,
      };
    }
    campaign = {
      campaignId: state.campaignId,
      payerId: state.payerId,
      sponsorDisplayName: state.sponsorDisplayName,
      objectId: state.objectId,
      status: state.status,
      reason: state.reason,
      docRef: state.docRef,
      surfaces: [...state.surfaces],
      startsAt: new Date(state.startsAt).toISOString(),
      endsAt: new Date(state.endsAt).toISOString(),
      caps: {
        impressionsCap: state.budgetScope.impressionsCap,
        clicksCap: state.budgetScope.clicksCap,
      },
      budgetScopeRef: budgetScopeRef(state.campaignId, nowMs),
      today,
    };
  }
  let history: AdvertiserDashboard["history"] = null;
  if (stamp.trustworthy) {
    // The days present come from the ledger's rows; every number
    // still comes from the read API's summarize for that day, so the
    // history can never diverge from the totals source of record.
    const days = new Set<string>();
    for (const row of ledger.readRows({ campaignId })) {
      days.add(utcDayKey(row.receivedAt));
    }
    history = [...days]
      .sort()
      .map((day) => ({
        day,
        ...toTotals(ledger.summarize({ campaignId, day })),
      }));
  }
  return {
    view: "advertiser",
    advertiserTenantId,
    generatedAt: stamp.generatedAt,
    campaign,
    history,
    recentDecisions: recentDecisionOutcomes(
      (record) => record.payerId === advertiserTenantId,
    ),
    stamp,
  };
}

/**
 * The policy's fallback caps, named here so the advertiser page can
 * label the v1 defaults even before the house campaign exists.
 * (When the campaign exists, its own record is the authority.)
 */
export const POLICY_DEFAULT_CAPS = {
  impressionsCap: DAILY_IMPRESSIONS_CAP,
  clicksCap: DAILY_CLICKS_CAP,
} as const;
