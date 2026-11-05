/**
 * B6 dashboard tests: the publisher and advertiser read models, the
 * tenant-scoped dashboards route, and the two dashboard pages.
 *
 * Law under test (DESIGN.md component G, verification steps 4 and 6):
 * - Every displayed total equals the B2 ledger read API exactly on
 *   a seeded mixed-classification ledger, and the reconciliation
 *   stamp attests it: chain verified, raw-row recount matching,
 *   row counts visible.
 * - Truthful reporting: tamper with a ledger row and the chain
 *   fails; both dashboards then withhold ALL ledger totals (null)
 *   and carry the exact failure in the stamp.
 * - Tenant isolation at the route: no session 401, a tenant that is
 *   neither the loop publisher nor the loop advertiser 403, and the
 *   publisher payload contains no advertiser-only fields (budget
 *   caps, budget scope refs).
 * - The flag gates everything: route 404 when off, pages 404 when
 *   off. Empty state renders zeros with a valid stamp.
 * - Read-only: the dashboards write nothing (store and ledger file
 *   bytes are identical before and after a build).
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { NextRequest } from "next/server";
import {
  createAdsDashboardGetHandler,
  type AdsDashboardRouteDeps,
} from "../dashboards-route";
import LoopDemoPublisherDashboardPage from "../../../app/sites/loop-demo/dashboard/page";
import PingFydAdvertiserDashboardPage from "../../../app/sites/ping-fyd/dashboard/page";
import {
  createSessionValue,
  SESSION_COOKIE_NAME,
} from "../../identity/session";
import type { FydObjectEventDraft } from "../../rank/object-events";
import {
  activateCampaign,
  createCampaign,
  type CampaignCreatedPayload,
} from "../campaign-store";
import {
  buildAdvertiserDashboard,
  buildPublisherDashboard,
  LOOP_ADVERTISER_TENANT_ID,
  LOOP_HOUSE_CAMPAIGN_ID,
} from "../dashboards";
import { writePlacementDecision } from "../decision-store";
import { DISCLOSURE_TEXT_VERSION } from "../disclosure";
import {
  createAdsEventLedger,
  type AdsEventLedger,
} from "../event-ledger";
import { declareSlot, grantConsent } from "../inventory-store";
import {
  BUDGET_WINDOW_MS,
  DAILY_CLICKS_CAP,
  DAILY_IMPRESSIONS_CAP,
  FREQUENCY_WINDOW_MS,
  LOOP_PUBLISHER_TENANT_ID,
  LOOP_SURFACE,
  budgetScopeRef,
  utcDayKey,
} from "../policy";

const PAYER = LOOP_ADVERTISER_TENANT_ID;
const PUBLISHER = LOOP_PUBLISHER_TENANT_ID;
const SURFACE = LOOP_SURFACE;
const OBJECT_ID = "ping-fyd-object";
const CAMPAIGN_ID = LOOP_HOUSE_CAMPAIGN_ID;
const SLOT_ID = "loop-demo-portal";
const PLACEMENT_ID = "placement:ping-house-001:loop-demo";
const CONSENT_ID = "consent-loop-demo-001";
const AT = "2026-11-04T19:00:00.000Z";
const T0 = Date.UTC(2026, 10, 4, 19, 0, 0);
const DAY = "20261104";
const GOOD_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";
const BOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const SECRET = "b6-test-session-secret-0123456789abcdef";
const PUBLISHER_IDENTITY = "11111111-2222-4333-8444-555555555555";
const ADVERTISER_IDENTITY = "22222222-3333-4444-8555-666666666666";
const OTHER_IDENTITY = "99999999-8888-4777-8666-555555555555";
const FLAG_ON = { FYD_ADS_LOOP_ENABLED: "1" } as const;
/** 7 batch rows + 65 flood rows (60 counted, 5 rate-limited). */
const TOTAL_ROWS = 72;

let dir = "";
let ledger: AdsEventLedger;
let renderSeq = 0;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fyd-ads-b6-test-"));
  process.env.FYD_ADS_DIR = dir;
  renderSeq = 0;
  ledger = createAdsEventLedger({ now: () => T0 });
});

afterEach(() => {
  delete process.env.FYD_ADS_DIR;
  delete process.env.FYD_ADS_LOOP_ENABLED;
});

function nextRender(): string {
  renderSeq += 1;
  return "render-" + renderSeq;
}

/* ------------------------------- seeds ------------------------------- */

function pingHouseCampaign(): CampaignCreatedPayload {
  return {
    campaignId: CAMPAIGN_ID,
    payerId: PAYER,
    sponsorDisplayName: "PING",
    objectId: OBJECT_ID,
    disclosure: "Sponsored",
    reason: "Shown because this page opted in to PING placements.",
    targeting: { kind: "surface", sourceRef: SURFACE },
    surfaces: [SURFACE],
    startsAt: Date.UTC(2026, 10, 4),
    endsAt: Date.UTC(2026, 11, 4),
    docRef: "CAMPAIGN-PING-HOUSE-001.md",
    budgetScope: {
      impressionsCap: DAILY_IMPRESSIONS_CAP,
      clicksCap: DAILY_CLICKS_CAP,
      windowMs: BUDGET_WINDOW_MS,
    },
  };
}

function seedLoop() {
  createCampaign({ actorTenantId: PAYER, campaign: pingHouseCampaign(), at: AT });
  activateCampaign({ actorTenantId: PAYER, campaignId: CAMPAIGN_ID, at: AT });
  declareSlot({
    actorTenantId: PUBLISHER,
    slot: {
      slotId: SLOT_ID,
      publisherTenantId: PUBLISHER,
      surface: SURFACE,
      slotKind: "portal-object",
      compositionCapacity: 8,
    },
    at: AT,
  });
  grantConsent({
    actorTenantId: PUBLISHER,
    slotId: SLOT_ID,
    consent: {
      consentId: CONSENT_ID,
      actorIdentityRef: "demo-owner:loop-demo",
      scope: { surfaces: [SURFACE], slotKinds: ["portal-object"] },
      disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
      grantedAt: AT,
    },
    at: AT,
  });
}

function seedCoveringDecision() {
  writePlacementDecision({
    decisionId: "decision-cover-001",
    evaluatedAt: T0,
    surface: SURFACE,
    slotId: SLOT_ID,
    campaignId: CAMPAIGN_ID,
    publisherTenantId: PUBLISHER,
    payerId: PAYER,
    authoritySnapshot: {
      placementId: PLACEMENT_ID,
      campaignId: CAMPAIGN_ID,
      payerId: PAYER,
      surface: SURFACE,
      grant: "ad.buy",
      decision: "allowed",
      decisionRef: "decision-cover-001",
      budgetScopeRef: budgetScopeRef(CAMPAIGN_ID, T0),
      budget: "within-scope",
      checkedAt: T0,
      validUntil: T0 + FREQUENCY_WINDOW_MS,
    },
    exposureWindow: {
      objectId: OBJECT_ID,
      surface: SURFACE,
      viewerScopeRef: "viewer-session-1",
      windowStartedAt: T0 - FREQUENCY_WINDOW_MS,
      observedAt: T0,
      impressions: 0,
    },
    inputsDigest: "b6-test-inputs-digest",
    evaluation: { eligible: true, projectionDigest: "b6-test-projection" },
    composition: { included: true },
  });
}

function seedRejectionDecision() {
  writePlacementDecision({
    decisionId: "decision-reject-001",
    evaluatedAt: T0 + 60_000,
    surface: SURFACE,
    slotId: SLOT_ID,
    campaignId: CAMPAIGN_ID,
    publisherTenantId: PUBLISHER,
    payerId: PAYER,
    authoritySnapshot: {
      placementId: PLACEMENT_ID,
      campaignId: CAMPAIGN_ID,
      payerId: PAYER,
      surface: SURFACE,
      grant: "ad.buy",
      decision: "allowed",
      decisionRef: "decision-reject-001",
      budgetScopeRef: budgetScopeRef(CAMPAIGN_ID, T0),
      budget: "exhausted",
      checkedAt: T0 + 60_000,
      validUntil: T0 + 60_000 + FREQUENCY_WINDOW_MS,
    },
    exposureWindow: {
      objectId: OBJECT_ID,
      surface: SURFACE,
      viewerScopeRef: "viewer-session-1",
      windowStartedAt: T0 + 60_000 - FREQUENCY_WINDOW_MS,
      observedAt: T0 + 60_000,
      impressions: 3,
    },
    inputsDigest: "b6-test-inputs-digest-reject",
    evaluation: { eligible: false, reason: "outside-budget" },
    composition: { included: false, reason: "outside-budget" },
  });
}

/* ---------------------------- draft builders ---------------------------- */

function impressionKey(draft: FydObjectEventDraft): string {
  return JSON.stringify([
    "fyd-object-impression",
    draft.objectId,
    draft.surface,
    draft.renderInstanceId,
    draft.sponsorship?.placementId ?? null,
  ]);
}

function sponsoredImpression(
  overrides: Partial<FydObjectEventDraft> = {},
): FydObjectEventDraft {
  const draft: FydObjectEventDraft = {
    type: "FYD_SPONSORED_IMPRESSION",
    objectId: OBJECT_ID,
    surface: SURFACE,
    correlationId: "corr-1",
    renderInstanceId: "",
    occurredAt: T0,
    actor: { sessionId: "viewer-session-1" },
    sponsorship: {
      placementId: PLACEMENT_ID,
      campaignId: CAMPAIGN_ID,
      payerId: PAYER,
    },
    dedupeKey: "",
    ...overrides,
  };
  if (!("renderInstanceId" in overrides)) draft.renderInstanceId = nextRender();
  if (!overrides.dedupeKey) draft.dedupeKey = impressionKey(draft);
  return draft;
}

function sponsoredAction(
  overrides: Partial<FydObjectEventDraft> = {},
): FydObjectEventDraft {
  const draft: FydObjectEventDraft = {
    type: "FYD_OBJECT_OPENED",
    action: "OBJECT_OPEN",
    objectId: OBJECT_ID,
    surface: SURFACE,
    correlationId: "corr-1",
    renderInstanceId: "",
    occurredAt: T0,
    actor: { sessionId: "viewer-session-1" },
    sponsorship: {
      placementId: PLACEMENT_ID,
      campaignId: CAMPAIGN_ID,
      payerId: PAYER,
    },
    dedupeKey: "",
    ...overrides,
  };
  if (!("renderInstanceId" in overrides)) draft.renderInstanceId = nextRender();
  if (!overrides.dedupeKey) {
    draft.dedupeKey = JSON.stringify([
      "fyd-object-action",
      draft.objectId,
      draft.surface,
      draft.renderInstanceId,
      draft.action,
      "interaction-" + draft.renderInstanceId,
    ]);
  }
  return draft;
}

function floodAction(i: number): FydObjectEventDraft {
  const renderInstanceId = "flood-render-" + i;
  return {
    type: "FYD_OBJECT_OPENED",
    action: "OBJECT_OPEN",
    objectId: "obj-flood",
    surface: "flood-surface",
    correlationId: "corr-flood",
    renderInstanceId,
    occurredAt: T0,
    actor: { sessionId: "viewer-flood" },
    dedupeKey: JSON.stringify([
      "fyd-object-action",
      "obj-flood",
      "flood-surface",
      renderInstanceId,
      "OBJECT_OPEN",
      "interaction-" + i,
    ]),
  };
}

/**
 * The mixed batch: 2 COUNTED impressions, 1 COUNTED click, 1 SELF,
 * 1 BOT, 1 DUPLICATE (same key, different payload), 1 INVALID
 * (occurredAt beyond decision coverage), then a 65-draft flood on a
 * slotless surface from one viewer scope: 60 COUNTED there, 5
 * RATE_LIMITED, none attributed to the loop tenants.
 */
async function seedMixedBatch() {
  seedLoop();
  seedCoveringDecision();
  seedRejectionDecision();
  const first = sponsoredImpression();
  await ledger.publish(first, { userAgent: GOOD_UA });
  await ledger.publish(sponsoredImpression(), { userAgent: GOOD_UA });
  await ledger.publish(sponsoredAction(), { userAgent: GOOD_UA });
  await ledger.publish(sponsoredImpression(), {
    userAgent: GOOD_UA,
    actorTenantId: PAYER,
  });
  await ledger.publish(sponsoredImpression(), { userAgent: BOT_UA });
  await ledger.publish(
    sponsoredImpression({
      dedupeKey: first.dedupeKey,
      correlationId: "corr-tampered",
    }),
    { userAgent: GOOD_UA },
  );
  await ledger.publish(
    sponsoredImpression({ occurredAt: T0 + 2 * 60 * 60 * 1000 }),
    { userAgent: GOOD_UA },
  );
  for (let i = 0; i < 65; i++) {
    await ledger.publish(floodAction(i), { userAgent: GOOD_UA });
  }
}

const EXPECTED_BY_CLASSIFICATION = {
  COUNTED: 3,
  SELF: 1,
  BOT: 1,
  DUPLICATE: 1,
  RATE_LIMITED: 0,
  INVALID: 1,
};

/* ------------------------- publisher read model ------------------------- */

describe("publisher dashboard read model", () => {
  it("reconciles exactly with the ledger read API on a mixed-classification ledger", async () => {
    await seedMixedBatch();
    const dash = buildPublisherDashboard({ ledger, now: () => T0 });

    expect(dash.view).toBe("publisher");
    expect(dash.stamp.trustworthy).toBe(true);
    expect(dash.stamp.chainOk).toBe(true);
    expect(dash.stamp.recountMatch).toBe(true);
    expect(dash.stamp.failure).toBeNull();
    expect(dash.stamp.rowsScanned).toBe(TOTAL_ROWS);
    expect(dash.stamp.rows).toBe(7);
    expect(dash.stamp.countedRows).toBe(3);
    const chain = ledger.verifyChain();
    expect(chain.ok).toBe(true);
    expect(dash.stamp.lastRowHashShort).toBe(
      chain.days[chain.days.length - 1].lastHash?.slice(0, 12),
    );

    expect(dash.slots).toHaveLength(1);
    const slot = dash.slots[0];
    expect(slot.slotId).toBe(SLOT_ID);
    expect(slot.consentStatus).toBe("active");
    expect(slot.consentActive).toBe(true);
    expect(slot.disclosureTextVersion).toBe(DISCLOSURE_TEXT_VERSION);
    expect(slot.counted).toEqual(ledger.countedTotalsBySlot(SLOT_ID));
    expect(slot.counted).toEqual({ impressions: 2, clicks: 1 });
    expect(slot.byClassification).toEqual(
      ledger.summarize({ slotId: SLOT_ID }).byClassification,
    );
    expect(slot.byClassification).toEqual(EXPECTED_BY_CLASSIFICATION);
    expect(slot.rateLimited).toBe(false);

    const apiTotals = ledger.summarize({ tenantId: PUBLISHER });
    expect(dash.totals).toEqual({
      rows: apiTotals.rows,
      impressions: apiTotals.impressions,
      clicks: apiTotals.clicks,
      byClassification: apiTotals.byClassification,
    });
    expect(dash.totals?.rows).toBe(7);
    expect(dash.surfaceTotals).toHaveLength(1);
    expect(dash.surfaceTotals?.[0].surface).toBe(SURFACE);
    expect(dash.surfaceTotals?.[0].totals.byClassification).toEqual(
      EXPECTED_BY_CLASSIFICATION,
    );

    expect(dash.recentDecisions).toHaveLength(2);
    expect(dash.recentDecisions[0].eligible).toBe(false);
    expect(dash.recentDecisions[0].reason).toBe("outside-budget");
    expect(dash.recentDecisions[1].eligible).toBe(true);
    expect(dash.recentDecisions[1].reason).toBeNull();
  });

  it("empty state: no slots, zero totals, a valid stamp", () => {
    const dash = buildPublisherDashboard({ ledger, now: () => T0 });
    expect(dash.slots).toEqual([]);
    expect(dash.totals).toEqual({
      rows: 0,
      impressions: 0,
      clicks: 0,
      byClassification: {
        COUNTED: 0,
        SELF: 0,
        BOT: 0,
        DUPLICATE: 0,
        RATE_LIMITED: 0,
        INVALID: 0,
      },
    });
    expect(dash.surfaceTotals).toEqual([]);
    expect(dash.recentDecisions).toEqual([]);
    expect(dash.stamp.trustworthy).toBe(true);
    expect(dash.stamp.rowsScanned).toBe(0);
    expect(dash.stamp.lastRowHashShort).toBeNull();
  });
});

/* ------------------------- advertiser read model ------------------------ */

describe("advertiser dashboard read model", () => {
  it("reconciles exactly: campaign state, today's caps delivery, per-day history", async () => {
    await seedMixedBatch();
    const dash = buildAdvertiserDashboard({ ledger, now: () => T0 });

    expect(dash.view).toBe("advertiser");
    expect(dash.stamp.trustworthy).toBe(true);
    expect(dash.stamp.rowsScanned).toBe(TOTAL_ROWS);
    expect(dash.stamp.rows).toBe(7);
    expect(dash.stamp.countedRows).toBe(3);

    const campaign = dash.campaign;
    expect(campaign).not.toBeNull();
    expect(campaign?.campaignId).toBe(CAMPAIGN_ID);
    expect(campaign?.status).toBe("active");
    expect(campaign?.caps).toEqual({
      impressionsCap: DAILY_IMPRESSIONS_CAP,
      clicksCap: DAILY_CLICKS_CAP,
    });
    expect(campaign?.budgetScopeRef).toBe(budgetScopeRef(CAMPAIGN_ID, T0));
    expect(campaign?.today).toEqual({
      day: DAY,
      ...ledger.countedTotalsByCampaign(CAMPAIGN_ID, DAY),
    });
    expect(campaign?.today).toEqual({ day: DAY, impressions: 2, clicks: 1 });

    expect(dash.history).toHaveLength(1);
    const dayRow = dash.history?.[0];
    expect(dayRow?.day).toBe(DAY);
    expect(dayRow?.rows).toBe(7);
    expect(dayRow?.impressions).toBe(2);
    expect(dayRow?.clicks).toBe(1);
    expect(dayRow?.byClassification).toEqual(EXPECTED_BY_CLASSIFICATION);
    expect(dayRow?.byClassification).toEqual(
      ledger.summarize({ campaignId: CAMPAIGN_ID, day: DAY })
        .byClassification,
    );

    expect(dash.recentDecisions).toHaveLength(2);
    expect(dash.recentDecisions[0].reason).toBe("outside-budget");
  });

  it("empty state: no campaign, empty history, a valid stamp", () => {
    const dash = buildAdvertiserDashboard({ ledger, now: () => T0 });
    expect(dash.campaign).toBeNull();
    expect(dash.history).toEqual([]);
    expect(dash.recentDecisions).toEqual([]);
    expect(dash.stamp.trustworthy).toBe(true);
    expect(dash.stamp.rowsScanned).toBe(0);
  });
});

/* ------------------------------ tamper case ----------------------------- */

describe("tamper case: chain failure withholds every total", () => {
  it("a rewritten ledger row fails the chain and both dashboards serve no totals as truth", async () => {
    seedLoop();
    seedCoveringDecision();
    await ledger.publish(sponsoredImpression(), { userAgent: GOOD_UA });
    expect(ledger.verifyChain().ok).toBe(true);

    const dayPath = join(dir, "ledger", DAY + ".jsonl");
    const raw = readFileSync(dayPath, "utf8");
    const tampered = raw.replace(
      '"occurredAt":' + T0,
      '"occurredAt":' + (T0 + 7),
    );
    expect(tampered).not.toBe(raw);
    writeFileSync(dayPath, tampered, "utf8");
    expect(ledger.verifyChain().ok).toBe(false);

    const pub = buildPublisherDashboard({ ledger, now: () => T0 });
    expect(pub.stamp.chainOk).toBe(false);
    expect(pub.stamp.trustworthy).toBe(false);
    expect(pub.stamp.failure?.day).toBe(DAY);
    expect(pub.stamp.lastRowHashShort).toBeNull();
    expect(pub.totals).toBeNull();
    expect(pub.surfaceTotals).toBeNull();
    expect(pub.slots).toHaveLength(1);
    expect(pub.slots[0].counted).toBeNull();
    expect(pub.slots[0].byClassification).toBeNull();
    expect(pub.slots[0].rateLimited).toBeNull();
    // Store-projected state is not ledger data and is still shown.
    expect(pub.slots[0].consentStatus).toBe("active");

    const adv = buildAdvertiserDashboard({ ledger, now: () => T0 });
    expect(adv.stamp.trustworthy).toBe(false);
    expect(adv.stamp.failure?.day).toBe(DAY);
    expect(adv.campaign?.status).toBe("active");
    expect(adv.campaign?.today).toBeNull();
    expect(adv.history).toBeNull();
  });
});

/* ------------------------------ route gating ---------------------------- */

const routeDeps: AdsDashboardRouteDeps = {
  env: { ...FLAG_ON, FYD_SESSION_SECRET: SECRET },
  resolveTenantIdForIdentity: (identityId) =>
    identityId === PUBLISHER_IDENTITY
      ? PUBLISHER
      : identityId === ADVERTISER_IDENTITY
        ? PAYER
        : identityId === OTHER_IDENTITY
          ? "other-tenant"
          : null,
  now: () => T0,
};

function cookieFor(identityId: string): string {
  return SESSION_COOKIE_NAME + "=" + createSessionValue(identityId, SECRET);
}

function getRequest(cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new NextRequest("http://localhost:3000/api/fyd/ads/dashboards", {
    method: "GET",
    headers,
  });
}

describe("dashboards route", () => {
  it("flag off is a 404, even with a valid publisher session", async () => {
    const GET = createAdsDashboardGetHandler({
      ...routeDeps,
      env: { FYD_SESSION_SECRET: SECRET },
    });
    const res = await GET(getRequest(cookieFor(PUBLISHER_IDENTITY)));
    expect(res.status).toBe(404);
  });

  it("no session is a 401", async () => {
    const GET = createAdsDashboardGetHandler({ ...routeDeps, ledger });
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
  });

  it("a tenant that is neither loop publisher nor advertiser is a 403", async () => {
    const GET = createAdsDashboardGetHandler({ ...routeDeps, ledger });
    const res = await GET(getRequest(cookieFor(OTHER_IDENTITY)));
    expect(res.status).toBe(403);
  });

  it("publisher session gets the publisher view, with no advertiser-only fields", async () => {
    await seedMixedBatch();
    const GET = createAdsDashboardGetHandler({ ...routeDeps, ledger });
    const res = await GET(getRequest(cookieFor(PUBLISHER_IDENTITY)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.view).toBe("publisher");
    expect(body.dashboard.slots[0].counted).toEqual({
      impressions: 2,
      clicks: 1,
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain("impressionsCap");
    expect(text).not.toContain("clicksCap");
    expect(text).not.toContain("budgetScopeRef");
  });

  it("advertiser session gets the advertiser view with today's counted delivery", async () => {
    await seedMixedBatch();
    const GET = createAdsDashboardGetHandler({ ...routeDeps, ledger });
    const res = await GET(getRequest(cookieFor(ADVERTISER_IDENTITY)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.view).toBe("advertiser");
    expect(body.dashboard.campaign.campaignId).toBe(CAMPAIGN_ID);
    expect(body.dashboard.campaign.today).toEqual({
      day: DAY,
      impressions: 2,
      clicks: 1,
    });
  });
});

/* ------------------------------- pages ---------------------------------- */

describe("dashboard pages", () => {
  /** React SSR splits interpolated text with comment markers. */
  function textOf(html: string): string {
    return html.replace(/<!-- -->/g, "");
  }

  it("publisher page renders slots, counts, and the verified stamp", async () => {
    await seedMixedBatch();
    process.env.FYD_ADS_LOOP_ENABLED = "1";
    const html = textOf(
      renderToString(React.createElement(LoopDemoPublisherDashboardPage)),
    );
    expect(html).toContain("Publisher dashboard for " + PUBLISHER);
    expect(html).toContain(SLOT_ID);
    expect(html).toContain("chain verified to row hash");
    expect(html).toContain("Counted impressions");
  });

  it("advertiser page renders the campaign against its caps", async () => {
    await seedMixedBatch();
    process.env.FYD_ADS_LOOP_ENABLED = "1";
    const html = textOf(
      renderToString(React.createElement(PingFydAdvertiserDashboardPage)),
    );
    expect(html).toContain("Advertiser dashboard for " + PAYER);
    expect(html).toContain("Campaign " + CAMPAIGN_ID);
    expect(html).toContain("chain verified to row hash");
  });

  it("pages 404 when the flag is off", () => {
    delete process.env.FYD_ADS_LOOP_ENABLED;
    for (const page of [
      LoopDemoPublisherDashboardPage,
      PingFydAdvertiserDashboardPage,
    ]) {
      let caught: unknown = null;
      try {
        renderToString(React.createElement(page));
      } catch (err) {
        caught = err;
      }
      expect(caught).not.toBeNull();
      // notFound() throws the framework's 404 error: the digest is
      // NEXT_NOT_FOUND, or NEXT_HTTP_ERROR_FALLBACK;404 on newer
      // Next versions. Both are the genuine not-found signal.
      const digest = String(
        (caught as { digest?: string })?.digest ?? caught,
      );
      expect(digest).toMatch(/NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404/);
    }
  });
});

/* ------------------------------ read-only ------------------------------- */

describe("read-only law", () => {
  it("building both dashboards changes no bytes in any store", async () => {
    await seedMixedBatch();
    const snapshot = new Map<string, string>();
    const walk = (sub: string) => {
      const base = join(dir, sub);
      if (!existsSync(base)) return;
      for (const name of readdirSync(base)) {
        snapshot.set(sub + "/" + name, readFileSync(join(base, name), "utf8"));
      }
    };
    for (const sub of ["campaigns", "slots", "decisions", "ledger"]) walk(sub);
    expect(snapshot.size).toBeGreaterThan(0);
    buildPublisherDashboard({ ledger, now: () => T0 });
    buildAdvertiserDashboard({ ledger, now: () => T0 });
    for (const [name, bytes] of snapshot) {
      expect(readFileSync(join(dir, name), "utf8")).toBe(bytes);
    }
  });
});
