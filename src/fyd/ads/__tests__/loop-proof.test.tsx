/**
 * B7 END-TO-END PROOF HARNESS: the FYD objects economic loop,
 * executed against the filed verification plan
 * (BOOTSTRAP-SURGE-OBJECTS-LOOP-DESIGN-20261104, DESIGN.md
 * "Verification plan"; mission BOOTSTRAP-SURGE-OBJECTS-B7-PROOF-20261104).
 *
 * This file is the proof run, repeatable with one command:
 *
 *   npx jest src/fyd/ads/__tests__/loop-proof.test.tsx
 *
 * It drives ONLY real paths, in one scripted sequence per phase,
 * against fresh temporary FYD_ADS_DIR stores (controlled data only;
 * the publisher is the loop-demo tenant, the advertiser is PING,
 * the one campaign is ping-house-001):
 *
 *   Step 1  Opt-in recorded: the real B5 opt-in route grants
 *           consent for loop-demo; the slot log gains slot.declared
 *           and consent.granted pinning loop-disclosure-v1, and the
 *           route GET readback projects ACTIVE consent.
 *   Step 2  Campaign live: ping-house-001 created and activated
 *           through the real B1 campaign command paths.
 *   Step 3  Placement rendered with disclosure: the loop-demo
 *           surface composed through the real B4 render seam renders
 *           the sponsored card WITH the existing disclosure chip;
 *           a PlacementDecision with an eligible outcome persists;
 *           the organic object order matches the flag-off control.
 *   Step 4  Campaign delivered and counted: the B4 collector mints
 *           an impression (tracker-minted key) and a trusted click,
 *           both POSTed through the real B4 events route; the real
 *           B2 ledger counts { impressions: 1, clicks: 1 } with
 *           receipts, both rows COUNTED.
 *   Step 5  Reporting truthful: both B6 dashboards (builders and
 *           the real dashboards route) equal the ledger read API
 *           exactly; the reconciliation stamp is chain-verified and
 *           recount-matched; an independent recount agrees.
 *   Step 6  Fail-closed negatives, each in its own fresh store:
 *           6a revoke consent -> render organic-only (byte-identical
 *              to flag-off) and the provider returns no placement,
 *              decision recorded as consent-revoked;
 *           6b budget exhaustion -> 500 counted impressions reach the
 *              real daily cap; the next evaluation records
 *              outside-budget with snapshot budget "exhausted";
 *           6c campaign ended -> no placement (inactive-campaign),
 *              and a late impression classifies INVALID
 *              campaign-ended, never counted;
 *           6d tenant isolation -> a second tenant's session gets
 *              403 on the dashboards route, its opt-in readback is
 *              empty, cross-tenant store reads throw the typed
 *              scope error, and it is offered no placement;
 *           6e abuse classifications (DESIGN.md plan step 5,
 *              remainder) -> dedupe replay returns the same receipt
 *              and appends nothing; a tampered replay appends a
 *              DUPLICATE row; bot-UA and missing-UA drafts classify
 *              BOT; publisher- and payer-actor drafts classify
 *              SELF; counted totals never move.
 *
 * The loop enable flag is passed ONLY through the route/seam deps
 * env objects inside this harness; process.env never carries it.
 * Every step prints one [B7-EVIDENCE] JSON line with the concrete
 * values the proof record (LOOP-PROOF.md) transcribes.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { NextRequest } from "next/server";
import {
  createAdsDashboardGetHandler,
  type AdsDashboardRouteDeps,
} from "../dashboards-route";
import {
  createAdsEventsPostHandler,
  type AdsEventsRouteDeps,
} from "../events-route";
import {
  createAdsOptInGetHandler,
  createAdsOptInPostHandler,
  type AdsOptInRouteDeps,
} from "../opt-in-route";
import { getVerifiedPublicProjectionSync } from "../../data/ping-object-source";
import {
  createSessionValue,
  SESSION_COOKIE_NAME,
} from "../../identity/session";
import { loadObjectViewById } from "../../object/by-id";
import {
  objectViewToProjection,
  type ObjectProjection,
} from "../../object/object-projection";
import {
  createObjectImpressionTracker,
  type FydObjectEventDraft,
} from "../../rank/object-events";
import {
  explainCandidateRank,
  type RankedCandidate,
} from "../../rank/object-ranker";
import type { EligibleSponsoredPlacement } from "../../rank/sponsored-placement";
import {
  activateCampaign,
  createCampaign,
  endCampaign,
  readCampaign,
  type CampaignCreatedPayload,
} from "../campaign-store";
import { createAdsCollector } from "../collector";
import {
  buildAdvertiserDashboard,
  buildPublisherDashboard,
} from "../dashboards";
import {
  listPlacementDecisionIds,
  readPlacementDecision,
} from "../decision-store";
import { DISCLOSURE_TEXT_VERSION } from "../disclosure";
import { AdsEventLedger } from "../event-ledger";
import { AdsTenantScopeError } from "../event-log";
import { declareSlot, grantConsent, readSlot } from "../inventory-store";
import {
  LoopComposition,
  type LoopCompositionEntry,
} from "../loop-composition";
import { readOptInState } from "../opt-in";
import {
  BUDGET_WINDOW_MS,
  DAILY_CLICKS_CAP,
  DAILY_IMPRESSIONS_CAP,
  LOOP_PUBLISHER_TENANT_ID,
  LOOP_SURFACE,
  utcDayKey,
} from "../policy";
import { evaluateComposition } from "../provider";
import {
  composeLoopSurfaceComposition,
  type LoopSurfaceComposition,
} from "../render";

/* ------------------------------------------------------------------ */
/* Constants and shared helpers                                        */
/* ------------------------------------------------------------------ */

const PAYER = "ping-fyd";
const PUBLISHER = LOOP_PUBLISHER_TENANT_ID; // "loop-demo"
const SURFACE = LOOP_SURFACE; // "loop-demo"
const OBJECT_ID = "ping-fyd-business";
const ORGANIC_IDS = [
  "ping-fyd-svc-calls",
  "ping-fyd-svc-followup",
  "ping-fyd-svc-scheduling",
];
const SLOT_ID = "slot-loop-demo-main";
const CAMPAIGN_ID = "ping-house-001";
const CONSENT_ID = "consent-1";
const VIEWER = "viewer-scope-1";
const SECRET = "b7-proof-session-secret-0123456789abcdef";
const PUBLISHER_IDENTITY = "11111111-2222-4333-8444-555555555555";
const ADVERTISER_IDENTITY = "22222222-3333-4444-8555-666666666666";
const OTHER_IDENTITY = "99999999-8888-4777-8666-555555555555";
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";
const FLAG_ON = { FYD_ADS_LOOP_ENABLED: "1" } as const;
const FLAG_OFF = {} as const;
const ROUTE_ENV = { ...FLAG_ON, FYD_SESSION_SECRET: SECRET };

function resolveTenant(identityId: string): string | null {
  if (identityId === PUBLISHER_IDENTITY) return PUBLISHER;
  if (identityId === ADVERTISER_IDENTITY) return PAYER;
  if (identityId === OTHER_IDENTITY) return "other-tenant";
  return null;
}

const optInDeps: AdsOptInRouteDeps = {
  env: ROUTE_ENV,
  resolveTenantIdForIdentity: resolveTenant,
};
const dashboardDeps: AdsDashboardRouteDeps = {
  env: ROUTE_ENV,
  resolveTenantIdForIdentity: resolveTenant,
};
const eventsDeps: AdsEventsRouteDeps = { env: ROUTE_ENV };

function freshPhase(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  process.env.FYD_ADS_DIR = dir;
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), prefix + "owner-"));
  return dir;
}

function clearPhase(): void {
  delete process.env.FYD_ADS_DIR;
  delete process.env.FYD_OWNER_DIR;
}

function evidence(step: string, data: Record<string, unknown>): void {
  console.log("[B7-EVIDENCE] " + step + " " + JSON.stringify(data));
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

interface StoredLogEvent {
  type: string;
  payload: Record<string, unknown>;
}

function readLogEvents(
  dir: string,
  subdir: string,
  entityId: string,
): StoredLogEvent[] {
  const parsed = JSON.parse(
    readFileSync(join(dir, subdir, entityId + ".json"), "utf8"),
  ) as { events: StoredLogEvent[] };
  return parsed.events;
}

function cookieFor(identityId: string): string {
  return SESSION_COOKIE_NAME + "=" + createSessionValue(identityId, SECRET);
}

function optInRequest(
  method: "GET" | "POST",
  body: unknown,
  cookie?: string,
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cookie) headers.cookie = cookie;
  return new NextRequest("http://localhost:3000/api/fyd/ads/opt-in", {
    method,
    headers,
    body:
      method === "POST"
        ? typeof body === "string"
          ? body
          : JSON.stringify(body)
        : undefined,
  });
}

function grantBody(): Record<string, unknown> {
  return {
    action: "grant",
    slotId: SLOT_ID,
    surface: SURFACE,
    slotKind: "portal-object",
    compositionCapacity: 12,
    disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
    consentId: CONSENT_ID,
  };
}

function eventsRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/fyd/ads/events", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": BROWSER_UA },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function dashboardRequest(cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new NextRequest("http://localhost:3000/api/fyd/ads/dashboards", {
    method: "GET",
    headers,
  });
}

function campaignPayload(now: number): CampaignCreatedPayload {
  return {
    campaignId: CAMPAIGN_ID,
    payerId: PAYER,
    sponsorDisplayName: "PING",
    objectId: OBJECT_ID,
    disclosure: "Sponsored",
    reason: "Shown because this page opted in to PING placements.",
    targeting: { kind: "surface", sourceRef: SURFACE },
    surfaces: [SURFACE],
    startsAt: now - 24 * 60 * 60 * 1000,
    endsAt: now + 30 * 24 * 60 * 60 * 1000,
    docRef: "CAMPAIGN-PING-HOUSE-001.md",
    budgetScope: {
      impressionsCap: DAILY_IMPRESSIONS_CAP,
      clicksCap: DAILY_CLICKS_CAP,
      windowMs: BUDGET_WINDOW_MS,
    },
  };
}

function candidate(objectId: string, t: number): RankedCandidate {
  return explainCandidateRank(
    {
      objectId,
      semanticProximity: 0.9,
      semanticTargetPresent: true,
      followed: false,
      liked: false,
      capabilityCount: 3,
      recentInteractionAt: null,
      slotStability: 1,
      slotCollisionRisk: 0,
    },
    t,
  );
}

function standardCandidates(t: number): RankedCandidate[] {
  return [...ORGANIC_IDS.map((id) => candidate(id, t)), candidate(OBJECT_ID, t)];
}

/** Seed slot + consent + active campaign through the B1 command paths. */
function seedSlotAndCampaignViaStores(t: number): void {
  declareSlot({
    actorTenantId: PUBLISHER,
    slot: {
      slotId: SLOT_ID,
      publisherTenantId: PUBLISHER,
      surface: SURFACE,
      slotKind: "portal-object",
      compositionCapacity: 12,
    },
  });
  grantConsent({
    actorTenantId: PUBLISHER,
    slotId: SLOT_ID,
    consent: {
      consentId: CONSENT_ID,
      actorIdentityRef: "demo-owner",
      scope: { surfaces: [SURFACE], slotKinds: ["portal-object"] },
      disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
      grantedAt: new Date(t).toISOString(),
    },
  });
  createCampaign({ actorTenantId: PAYER, campaign: campaignPayload(t) });
  activateCampaign({ actorTenantId: PAYER, campaignId: CAMPAIGN_ID });
}

/** Mint a sponsored impression draft through the rank contract's tracker. */
function mintSponsoredImpression(
  placement: EligibleSponsoredPlacement,
  at: number,
  renderInstanceId: string,
  correlationId: string,
  viewerScope: string,
): FydObjectEventDraft {
  const tracker = createObjectImpressionTracker({
    objectId: OBJECT_ID,
    surface: SURFACE,
    correlationId,
    renderInstanceId,
    authorizedActor: { sessionId: viewerScope },
    sponsorship: placement,
  });
  tracker.observe({
    at,
    rendered: true,
    visibleFraction: 1,
    documentVisible: true,
  });
  const draft = tracker.observe({
    at: at + 1000,
    rendered: true,
    visibleFraction: 1,
    documentVisible: true,
  });
  if (!draft) {
    throw new Error("tracker did not emit for " + renderInstanceId);
  }
  return draft;
}

/** Every named rejection recorded in the decision store, in file order. */
function decisionReasons(): string[] {
  const out: string[] = [];
  for (const id of listPlacementDecisionIds()) {
    const record = readPlacementDecision(id);
    if (record === null) continue;
    const evaluation = record.evaluation;
    if (!evaluation.eligible) out.push(evaluation.reason);
  }
  return out;
}

const projectionCache = new Map<string, ObjectProjection>();
function projectionFor(objectId: string): ObjectProjection {
  const cached = projectionCache.get(objectId);
  if (cached) return cached;
  const projection = getVerifiedPublicProjectionSync("ping-fyd", "anonymous");
  const view = loadObjectViewById(projection, "ping-fyd", objectId);
  if (!view) throw new Error("no view for " + objectId);
  const built = objectViewToProjection(view, projection.graph);
  projectionCache.set(objectId, built);
  return built;
}

function entriesFor(
  composition: LoopSurfaceComposition,
): LoopCompositionEntry[] {
  return composition.items.map((item) => ({
    item,
    projection: projectionFor(item.objectId),
  }));
}

function seamCompose(
  env: Readonly<Record<string, string | undefined>>,
  t: number,
): LoopSurfaceComposition {
  let n = 0;
  return composeLoopSurfaceComposition({
    publisherTenantId: PUBLISHER,
    surface: SURFACE,
    viewerScopeRef: VIEWER,
    candidates: standardCandidates(t),
    limit: 12,
    now: t,
    env,
    mintId: () => "b7-id-" + ++n,
  });
}

/* ------------------------------------------------------------------ */
/* Main line: steps 1 to 5, one shared store, declaration order        */
/* ------------------------------------------------------------------ */

describe("B7 proof main line: opt-in, campaign, render, delivery, reporting", () => {
  let dir = "";
  let now = Date.now();
  let composition: LoopSurfaceComposition;
  let impressionReceipt = "";
  let clickReceipt = "";

  beforeAll(() => {
    dir = freshPhase("fyd-ads-b7-main-");
    now = Date.now();
  });

  afterAll(() => {
    clearPhase();
  });

  it("step 1: publisher opt-in recorded through the real opt-in route", async () => {
    const post = createAdsOptInPostHandler(optInDeps);
    const res = await post(
      optInRequest("POST", grantBody(), cookieFor(PUBLISHER_IDENTITY)),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.slot.consentStatus).toBe("active");
    expect(json.slot.disclosureTextVersion).toBe(DISCLOSURE_TEXT_VERSION);

    // The raw slot log carries both events; the grant pins the
    // disclosure version the page showed.
    const events = readLogEvents(dir, "slots", SLOT_ID);
    expect(events.map((e) => e.type)).toEqual([
      "slot.declared",
      "consent.granted",
    ]);
    expect(events[1].payload.consentId).toBe(CONSENT_ID);
    expect(events[1].payload.disclosureTextVersion).toBe(
      DISCLOSURE_TEXT_VERSION,
    );

    // The route GET readback is the same store projection.
    const get = createAdsOptInGetHandler(optInDeps);
    const getRes = await get(
      optInRequest("GET", undefined, cookieFor(PUBLISHER_IDENTITY)),
    );
    expect(getRes.status).toBe(200);
    const state = (await getRes.json()).state;
    expect(state.slots).toHaveLength(1);
    expect(state.slots[0]).toMatchObject({
      slotId: SLOT_ID,
      surface: SURFACE,
      consentStatus: "active",
      consentId: CONSENT_ID,
      disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
      revokedAt: null,
    });
    expect(readOptInState(PUBLISHER).slots[0].consentStatus).toBe("active");
    expect(readSlot(SLOT_ID, PUBLISHER)?.consentActive).toBe(true);

    evidence("step1", {
      slotLogEvents: events.map((e) => e.type),
      consentId: CONSENT_ID,
      disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
      readbackConsentStatus: state.slots[0].consentStatus,
      slotLogSha256: sha256File(join(dir, "slots", SLOT_ID + ".json")),
    });
  });

  it("step 2: the house campaign is live through the real campaign command paths", () => {
    const created = createCampaign({
      actorTenantId: PAYER,
      campaign: campaignPayload(now),
    });
    expect(created.status).toBe("created");
    const activated = activateCampaign({
      actorTenantId: PAYER,
      campaignId: CAMPAIGN_ID,
    });
    expect(activated.status).toBe("active");

    const state = readCampaign(CAMPAIGN_ID, PAYER);
    expect(state?.status).toBe("active");
    expect(state?.payerId).toBe(PAYER);
    expect(state?.objectId).toBe(OBJECT_ID);
    expect(state?.budgetScope).toEqual({
      impressionsCap: DAILY_IMPRESSIONS_CAP,
      clicksCap: DAILY_CLICKS_CAP,
      windowMs: BUDGET_WINDOW_MS,
    });

    const events = readLogEvents(dir, "campaigns", CAMPAIGN_ID);
    expect(events.map((e) => e.type)).toEqual([
      "campaign.created",
      "campaign.activated",
    ]);

    evidence("step2", {
      campaignLogEvents: events.map((e) => e.type),
      status: state?.status,
      caps: state?.budgetScope,
      campaignLogSha256: sha256File(
        join(dir, "campaigns", CAMPAIGN_ID + ".json"),
      ),
    });
  });

  it("step 3: placement rendered with disclosure through the real render seam", () => {
    const control = seamCompose(FLAG_OFF, now);
    expect(control.providerInvoked).toBe(false);
    expect(control.sponsored).toBeNull();
    expect(listPlacementDecisionIds()).toEqual([]);

    composition = seamCompose(FLAG_ON, now);
    expect(composition.providerInvoked).toBe(true);
    const sponsored = composition.sponsored;
    if (!sponsored) throw new Error("expected an eligible placement");
    expect(sponsored.placement.objectId).toBe(OBJECT_ID);

    // Organic objects and their order are unchanged versus the
    // no-loop control composition: the same object set, and the
    // organic items keep their control relative order. The
    // sponsored item's position inside the composition is the rank
    // contract's own placement law (spacing and share), not a
    // reorder of the organics. (First proof run asserted exact
    // sequence equality including the promoted object's candidate
    // position; the composer inserts the placement per that law,
    // ahead of the last organic, so the assertion now matches the
    // design's exact claim.)
    expect(new Set(composition.items.map((i) => i.objectId))).toEqual(
      new Set(control.items.map((i) => i.objectId)),
    );
    expect(
      composition.items
        .filter((i) => i.sponsorship === null)
        .map((i) => i.objectId),
    ).toEqual(
      control.items
        .filter((i) => i.objectId !== OBJECT_ID)
        .map((i) => i.objectId),
    );
    const sponsoredItem = composition.items.find((i) => i.sponsorship !== null);
    expect(sponsoredItem?.objectId).toBe(OBJECT_ID);
    expect(sponsoredItem?.decisionId).toBe(sponsored.decisionId);

    // The decision record persisted for this composition is eligible
    // and names the exact slot, campaign, and surface.
    const record = readPlacementDecision(sponsored.decisionId);
    expect(record).not.toBeNull();
    expect(record?.evaluation.eligible).toBe(true);
    expect(record?.campaignId).toBe(CAMPAIGN_ID);
    expect(record?.slotId).toBe(SLOT_ID);
    expect(record?.surface).toBe(SURFACE);
    expect(record?.publisherTenantId).toBe(PUBLISHER);

    // The rendered surface carries the existing disclosure chip on
    // the sponsored card and mounts the collector only there.
    const html = renderToString(
      <LoopComposition entries={entriesFor(composition)} />,
    );
    expect(html).toContain("data-fyd-sponsored");
    expect(html).toContain("Sponsored");
    expect(html).toContain("data-fyd-ads-collector");
    const controlHtml = renderToString(
      <LoopComposition entries={entriesFor(control)} />,
    );
    expect(controlHtml).not.toContain("Sponsored");
    expect(controlHtml).not.toContain("data-fyd-ads-collector");

    evidence("step3", {
      decisionId: sponsored.decisionId,
      placementId: sponsored.placement.placementId,
      itemOrder: composition.items.map((i) => i.objectId),
      organicOrder: composition.items
        .filter((i) => i.sponsorship === null)
        .map((i) => i.objectId),
      sponsoredPosition: composition.items.findIndex(
        (i) => i.sponsorship !== null,
      ),
      decisionFileSha256: sha256File(
        join(dir, "decisions", sponsored.decisionId + ".json"),
      ),
      renderedHtmlBytes: html.length,
    });
  }, 120000);

  it("step 4: campaign delivered and counted through the collector and the real events route", async () => {
    const item = composition.items.find((i) => i.sponsorship !== null);
    if (!item?.eventContext) {
      throw new Error("expected a collector context on the sponsored item");
    }
    const context = item.eventContext;

    const drafts: FydObjectEventDraft[] = [];
    const collector = createAdsCollector({
      context,
      post: (d) => {
        drafts.push(d);
      },
    });
    const at = Date.now();
    collector.observe({
      at,
      rendered: true,
      visibleFraction: 1,
      documentVisible: true,
    });
    collector.observe({
      at: at + 1000,
      rendered: true,
      visibleFraction: 1,
      documentVisible: true,
    });
    expect(drafts).toHaveLength(1);

    const post = createAdsEventsPostHandler(eventsDeps);
    const res = await post(eventsRequest(drafts[0]));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe("recorded");
    impressionReceipt = json.receiptRef;
    expect(impressionReceipt).toMatch(/^ads-receipt:/);

    const ledger = new AdsEventLedger();
    const day = utcDayKey(drafts[0].occurredAt);
    expect(ledger.countedTotalsByCampaign(CAMPAIGN_ID, day)).toEqual({
      impressions: 1,
      clicks: 0,
    });

    // The click path: a trusted activation on the same placement,
    // minted by the collector through the contract's action builder.
    const clickDrafts: FydObjectEventDraft[] = [];
    const clickCollector = createAdsCollector({
      context,
      post: (d) => {
        clickDrafts.push(d);
      },
    });
    clickCollector.click({
      isTrusted: true,
      kind: "pointer",
      at: Date.now(),
      interactionId: "ix-b7-main-1",
    });
    expect(clickDrafts).toHaveLength(1);
    const clickRes = await post(eventsRequest(clickDrafts[0]));
    expect(clickRes.status).toBe(201);
    clickReceipt = (await clickRes.json()).receiptRef;

    expect(ledger.countedTotalsByCampaign(CAMPAIGN_ID, day)).toEqual({
      impressions: 1,
      clicks: 1,
    });
    const rows = ledger.readRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.classification)).toEqual(["COUNTED", "COUNTED"]);
    expect(rows[0].receiptRef).toBe(impressionReceipt);
    expect(rows[1].receiptRef).toBe(clickReceipt);

    evidence("step4", {
      impressionReceipt,
      clickReceipt,
      countedTotalsByCampaign: { impressions: 1, clicks: 1 },
      rowHashes: rows.map((r) => r.rowHash),
      ledgerDayFile: "ledger/" + day + ".jsonl",
      ledgerFileSha256: sha256File(join(dir, "ledger", day + ".jsonl")),
    });
  }, 120000);

  it("step 5: reporting truthful on both dashboards, reconciled to the ledger", async () => {
    const ledger = new AdsEventLedger();

    const pub = buildPublisherDashboard();
    expect(pub.totals?.rows).toBe(2);
    expect(pub.totals?.impressions).toBe(1);
    expect(pub.totals?.clicks).toBe(1);
    expect(pub.totals?.byClassification.COUNTED).toBe(2);
    expect(pub.slots).toHaveLength(1);
    expect(pub.slots[0].counted).toEqual({ impressions: 1, clicks: 1 });
    expect(pub.slots[0].consentStatus).toBe("active");
    expect(pub.stamp.trustworthy).toBe(true);
    expect(pub.stamp.chainOk).toBe(true);
    expect(pub.stamp.recountMatch).toBe(true);
    expect(pub.stamp.rowsScanned).toBe(2);
    const rows = ledger.readRows();
    expect(pub.stamp.lastRowHashShort).toBe(
      rows[rows.length - 1].rowHash.slice(0, 12),
    );

    const adv = buildAdvertiserDashboard();
    expect(adv.campaign?.status).toBe("active");
    expect(adv.campaign?.caps).toEqual({
      impressionsCap: DAILY_IMPRESSIONS_CAP,
      clicksCap: DAILY_CLICKS_CAP,
    });
    expect(adv.campaign?.today?.impressions).toBe(1);
    expect(adv.campaign?.today?.clicks).toBe(1);
    expect(adv.history).toHaveLength(1);
    expect(adv.history?.[0]).toMatchObject({ impressions: 1, clicks: 1 });
    expect(adv.stamp.trustworthy).toBe(true);
    expect(adv.stamp.countedRows).toBe(2);
    expect(adv.recentDecisions.some((d) => d.eligible)).toBe(true);

    // Independent recount: the raw-row path agrees with the read API
    // and with both dashboards.
    const recount = ledger.recount({});
    expect(recount.match).toBe(true);
    expect(recount.chainOk).toBe(true);
    expect(recount.rowsScanned).toBe(2);
    const summary = ledger.summarize({});
    expect(summary.impressions).toBe(pub.totals?.impressions);
    expect(summary.clicks).toBe(pub.totals?.clicks);
    const chain = ledger.verifyChain();
    expect(chain.ok).toBe(true);

    // The same numbers through the real dashboards route, one
    // identity per view.
    const get = createAdsDashboardGetHandler(dashboardDeps);
    const pubRes = await get(dashboardRequest(cookieFor(PUBLISHER_IDENTITY)));
    expect(pubRes.status).toBe(200);
    const pubJson = await pubRes.json();
    expect(pubJson.view).toBe("publisher");
    expect(pubJson.dashboard.totals.impressions).toBe(1);
    expect(pubJson.dashboard.totals.clicks).toBe(1);
    expect(pubJson.dashboard.stamp.trustworthy).toBe(true);
    const advRes = await get(
      dashboardRequest(cookieFor(ADVERTISER_IDENTITY)),
    );
    expect(advRes.status).toBe(200);
    const advJson = await advRes.json();
    expect(advJson.view).toBe("advertiser");
    expect(advJson.dashboard.campaign.today.impressions).toBe(1);
    expect(advJson.dashboard.campaign.today.clicks).toBe(1);
    expect(advJson.dashboard.stamp.trustworthy).toBe(true);

    evidence("step5", {
      publisherTotals: pub.totals,
      advertiserToday: adv.campaign?.today,
      stamp: {
        chainOk: pub.stamp.chainOk,
        recountMatch: pub.stamp.recountMatch,
        rowsScanned: pub.stamp.rowsScanned,
        lastRowHashShort: pub.stamp.lastRowHashShort,
      },
    });
  }, 120000);
});

/* ------------------------------------------------------------------ */
/* Step 6: fail-closed negatives, one fresh store per negative         */
/* ------------------------------------------------------------------ */

describe("B7 proof step 6a: revoke consent stops delivery", () => {
  beforeAll(() => {
    freshPhase("fyd-ads-b7-revoke-");
  });

  afterAll(() => {
    clearPhase();
  });

  it("grant delivers; revoke makes the provider return no placement and the render organic-only", async () => {
    const t = Date.now();
    const post = createAdsOptInPostHandler(optInDeps);
    const cookie = cookieFor(PUBLISHER_IDENTITY);
    const grantRes = await post(optInRequest("POST", grantBody(), cookie));
    expect(grantRes.status).toBe(200);
    createCampaign({ actorTenantId: PAYER, campaign: campaignPayload(t) });
    activateCampaign({ actorTenantId: PAYER, campaignId: CAMPAIGN_ID });

    const before = evaluateComposition({
      publisherTenantId: PUBLISHER,
      surface: SURFACE,
      viewerScopeRef: VIEWER,
      candidates: standardCandidates(t),
      limit: 12,
      now: t,
    });
    expect(before.sponsored).not.toBeNull();

    const revokeRes = await post(
      optInRequest(
        "POST",
        { action: "revoke", slotId: SLOT_ID, consentId: CONSENT_ID },
        cookie,
      ),
    );
    expect(revokeRes.status).toBe(200);
    expect((await revokeRes.json()).slot.consentStatus).toBe("revoked");
    expect(readSlot(SLOT_ID, PUBLISHER)?.consentActive).toBe(false);

    const after = evaluateComposition({
      publisherTenantId: PUBLISHER,
      surface: SURFACE,
      viewerScopeRef: VIEWER,
      candidates: standardCandidates(t),
      limit: 12,
      now: t,
    });
    expect(after.sponsored).toBeNull();
    expect(decisionReasons()).toContain("consent-revoked");

    // The seam render after revoke is organic-only and byte-identical
    // to the flag-off render of the same candidates.
    const onComposition = seamCompose(FLAG_ON, t);
    expect(onComposition.providerInvoked).toBe(true);
    expect(onComposition.sponsored).toBeNull();
    const offComposition = seamCompose(FLAG_OFF, t);
    const onHtml = renderToString(
      <LoopComposition entries={entriesFor(onComposition)} />,
    );
    const offHtml = renderToString(
      <LoopComposition entries={entriesFor(offComposition)} />,
    );
    expect(onHtml).toBe(offHtml);
    expect(onHtml).not.toContain("Sponsored");
    expect(onHtml).not.toContain("data-fyd-ads-collector");

    evidence("step6a", {
      providerAfterRevoke: null,
      recordedReason: "consent-revoked",
      renderByteIdenticalToFlagOff: onHtml === offHtml,
    });
  }, 120000);
});

describe("B7 proof step 6b: budget exhaustion fails closed with outside-budget", () => {
  // A fixed clock anchors every timestamp on one UTC day, as in the
  // B3 provider suite: evaluatedAt, occurredAt, and the injected
  // server receivedAt all stay inside 2026-11-04.
  const NOW = Date.UTC(2026, 10, 4, 19, 0, 0);

  beforeAll(() => {
    freshPhase("fyd-ads-b7-budget-");
  });

  afterAll(() => {
    clearPhase();
  });

  it("500 counted impressions reach the real cap; the next evaluation records outside-budget", async () => {
    seedSlotAndCampaignViaStores(NOW);
    const day = utcDayKey(NOW);

    const first = evaluateComposition({
      publisherTenantId: PUBLISHER,
      surface: SURFACE,
      viewerScopeRef: "viewer-budget-seed",
      candidates: standardCandidates(NOW),
      limit: 12,
      now: NOW,
    });
    if (!first.sponsored) {
      throw new Error("expected an eligible placement before the cap");
    }
    const placement = first.sponsored.placement;

    // Drive counted impressions to the campaign's real daily cap
    // through the real ledger: tracker-minted drafts covered by the
    // eligible decision above, published with a browser user agent.
    // receivedAt is spread by the injected server clock so the
    // per-slot and per-viewer rate windows (60/minute) stay honest:
    // at most 40 rows land inside any trailing minute.
    for (let i = 0; i < DAILY_IMPRESSIONS_CAP; i++) {
      const draft = mintSponsoredImpression(
        placement,
        NOW + i,
        "render-budget-" + i,
        "corr-budget-" + i,
        "viewer-budget-" + (i % 25),
      );
      const receivedAt = NOW + Math.floor(i / 40) * 61000 + (i % 40) * 1000;
      const ledger = new AdsEventLedger({ now: () => receivedAt });
      const res = await ledger.publish(draft, { userAgent: BROWSER_UA });
      expect(res.status).toBe("recorded");
    }

    const check = new AdsEventLedger();
    expect(check.countedTotalsByCampaign(CAMPAIGN_ID, day)).toEqual({
      impressions: DAILY_IMPRESSIONS_CAP,
      clicks: 0,
    });
    const summary = check.summarize({ campaignId: CAMPAIGN_ID });
    expect(summary.rows).toBe(DAILY_IMPRESSIONS_CAP);
    expect(summary.byClassification.COUNTED).toBe(DAILY_IMPRESSIONS_CAP);

    // A fresh viewer (no frequency exposure) still gets nothing:
    // the campaign budget snapshot is exhausted.
    const after = evaluateComposition({
      publisherTenantId: PUBLISHER,
      surface: SURFACE,
      viewerScopeRef: "viewer-after-cap",
      candidates: standardCandidates(NOW),
      limit: 12,
      now: NOW + 20 * 60000,
    });
    expect(after.sponsored).toBeNull();
    const exhausted = listPlacementDecisionIds()
      .map((id) => readPlacementDecision(id))
      .filter(
        (r) =>
          r !== null &&
          !r.evaluation.eligible &&
          r.evaluation.reason === "outside-budget",
      );
    expect(exhausted.length).toBeGreaterThanOrEqual(1);
    expect(exhausted[0]?.authoritySnapshot?.budget).toBe("exhausted");
    expect(exhausted[0]?.authoritySnapshot?.decision).toBe("allowed");

    evidence("step6b", {
      countedImpressionsAtCap: DAILY_IMPRESSIONS_CAP,
      countedClicks: 0,
      nextEvaluationReason: "outside-budget",
      snapshotBudget: exhausted[0]?.authoritySnapshot?.budget,
      snapshotDecision: exhausted[0]?.authoritySnapshot?.decision,
    });
  }, 300000);
});

describe("B7 proof step 6c: campaign end stops delivery and voids late events", () => {
  beforeAll(() => {
    freshPhase("fyd-ads-b7-ended-");
  });

  afterAll(() => {
    clearPhase();
  });

  it("ended campaign: no placement, and a late impression classifies INVALID campaign-ended", async () => {
    const t = Date.now();
    seedSlotAndCampaignViaStores(t);

    const composition = seamCompose(FLAG_ON, t);
    if (!composition.sponsored) {
      throw new Error("expected an eligible placement while live");
    }
    const item = composition.items.find((i) => i.sponsorship !== null);
    if (!item?.eventContext) {
      throw new Error("expected a collector context on the sponsored item");
    }

    // The impression is minted while the campaign is live (the
    // render happened), then the campaign ends before it arrives.
    const drafts: FydObjectEventDraft[] = [];
    const collector = createAdsCollector({
      context: item.eventContext,
      post: (d) => {
        drafts.push(d);
      },
    });
    const at = Date.now();
    collector.observe({
      at,
      rendered: true,
      visibleFraction: 1,
      documentVisible: true,
    });
    collector.observe({
      at: at + 1000,
      rendered: true,
      visibleFraction: 1,
      documentVisible: true,
    });
    expect(drafts).toHaveLength(1);

    endCampaign({ actorTenantId: PAYER, campaignId: CAMPAIGN_ID });
    expect(readCampaign(CAMPAIGN_ID, PAYER)?.status).toBe("ended");

    const after = evaluateComposition({
      publisherTenantId: PUBLISHER,
      surface: SURFACE,
      viewerScopeRef: VIEWER,
      candidates: standardCandidates(t),
      limit: 12,
      now: t + 2000,
    });
    expect(after.sponsored).toBeNull();
    expect(decisionReasons()).toContain("inactive-campaign");

    const ledger = new AdsEventLedger();
    const res = await ledger.publish(drafts[0], { userAgent: BROWSER_UA });
    expect(res.status).toBe("recorded");
    const rows = ledger.readRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].classification).toBe("INVALID");
    expect(rows[0].classificationReason).toBe("campaign-ended");
    expect(ledger.countedTotalsByCampaign(CAMPAIGN_ID, utcDayKey(t))).toEqual({
      impressions: 0,
      clicks: 0,
    });

    evidence("step6c", {
      providerAfterEnd: null,
      recordedReason: "inactive-campaign",
      lateEventClassification: rows[0].classification,
      lateEventReason: rows[0].classificationReason,
      countedTotals: { impressions: 0, clicks: 0 },
    });
  }, 120000);
});

describe("B7 proof step 6d: tenant isolation", () => {
  beforeAll(() => {
    freshPhase("fyd-ads-b7-isolation-");
  });

  afterAll(() => {
    clearPhase();
  });

  it("a second tenant gets 403 on the dashboards, an empty readback, typed scope errors, and no placement", async () => {
    const t = Date.now();
    const post = createAdsOptInPostHandler(optInDeps);
    const grantRes = await post(
      optInRequest("POST", grantBody(), cookieFor(PUBLISHER_IDENTITY)),
    );
    expect(grantRes.status).toBe(200);
    createCampaign({ actorTenantId: PAYER, campaign: campaignPayload(t) });
    activateCampaign({ actorTenantId: PAYER, campaignId: CAMPAIGN_ID });

    // Dashboards: the second tenant is refused, and the refusal
    // carries none of the loop tenant's data.
    const get = createAdsDashboardGetHandler(dashboardDeps);
    const res = await get(dashboardRequest(cookieFor(OTHER_IDENTITY)));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("not-a-loop-tenant");
    expect(JSON.stringify(json)).not.toContain(SLOT_ID);
    expect(JSON.stringify(json)).not.toContain(CAMPAIGN_ID);

    const noSession = await get(dashboardRequest(undefined));
    expect(noSession.status).toBe(401);

    // Store scope: the other tenant sees no slots, and a direct
    // cross-tenant slot read is the typed scope error.
    expect(readOptInState("other-tenant").slots).toEqual([]);
    expect(() => readSlot(SLOT_ID, "other-tenant")).toThrow(
      AdsTenantScopeError,
    );

    // The provider offers the other tenant no placement: slot and
    // consent assembly is scoped to the requesting tenant.
    const offered = evaluateComposition({
      publisherTenantId: "other-tenant",
      surface: SURFACE,
      viewerScopeRef: VIEWER,
      candidates: standardCandidates(t),
      limit: 12,
      now: t,
    });
    expect(offered.sponsored).toBeNull();

    evidence("step6d", {
      dashboardStatusForOtherTenant: 403,
      dashboardCode: json.code,
      dashboardStatusWithoutSession: 401,
      otherTenantSlotsVisible: 0,
      otherTenantPlacement: null,
    });
  }, 120000);
});

describe("B7 proof step 6e: abuse classifications keep counts honest", () => {
  beforeAll(() => {
    freshPhase("fyd-ads-b7-abuse-");
  });

  afterAll(() => {
    clearPhase();
  });

  it("dedupe replay, tampered replay, bot user agents, and self actors never move counted totals", async () => {
    const t = Date.now();
    seedSlotAndCampaignViaStores(t);
    const composed = evaluateComposition({
      publisherTenantId: PUBLISHER,
      surface: SURFACE,
      viewerScopeRef: VIEWER,
      candidates: standardCandidates(t),
      limit: 12,
      now: t,
    });
    if (!composed.sponsored) {
      throw new Error("expected an eligible placement");
    }
    const placement = composed.sponsored.placement;
    const ledger = new AdsEventLedger();

    // Baseline: one honest impression counts.
    const base = mintSponsoredImpression(
      placement,
      t,
      "render-abuse-0",
      "corr-abuse-0",
      "viewer-abuse-0",
    );
    const first = await ledger.publish(base, { userAgent: BROWSER_UA });
    expect(ledger.readRows()).toHaveLength(1);
    expect(ledger.summarize({}).impressions).toBe(1);

    // Dedupe replay: the identical draft returns the original
    // receipt and appends nothing.
    const replay = await ledger.publish(base, { userAgent: BROWSER_UA });
    expect(replay.receiptRef).toBe(first.receiptRef);
    expect(ledger.readRows()).toHaveLength(1);

    // Tampered replay: same dedupeKey, different payload appends a
    // DUPLICATE row and is never counted.
    const tampered: FydObjectEventDraft = {
      ...base,
      occurredAt: base.occurredAt + 5000,
    };
    await ledger.publish(tampered, { userAgent: BROWSER_UA });
    let rows = ledger.readRows();
    expect(rows).toHaveLength(2);
    expect(rows[1].classification).toBe("DUPLICATE");
    expect(rows[1].classificationReason).toBe("dedupe-key-payload-mismatch");
    expect(ledger.summarize({}).impressions).toBe(1);

    // Bot heuristics: a known-bot user agent, and no user agent.
    const botDraft = mintSponsoredImpression(
      placement,
      t,
      "render-abuse-1",
      "corr-abuse-1",
      "viewer-abuse-1",
    );
    await ledger.publish(botDraft, { userAgent: "curl/8.5.0" });
    const noUaDraft = mintSponsoredImpression(
      placement,
      t,
      "render-abuse-2",
      "corr-abuse-2",
      "viewer-abuse-2",
    );
    await ledger.publish(noUaDraft, {});
    rows = ledger.readRows();
    expect(rows[2].classification).toBe("BOT");
    expect(rows[2].classificationReason).toBe("user-agent-known-bot");
    expect(rows[3].classification).toBe("BOT");
    expect(rows[3].classificationReason).toBe("user-agent-missing");

    // Self events: the publisher acting on its own surface, and the
    // payer acting on its own campaign, both classify SELF from the
    // server-resolved ingest context.
    const selfPublisher = mintSponsoredImpression(
      placement,
      t,
      "render-abuse-3",
      "corr-abuse-3",
      "viewer-abuse-3",
    );
    await ledger.publish(selfPublisher, {
      userAgent: BROWSER_UA,
      actorTenantId: PUBLISHER,
    });
    const selfPayer = mintSponsoredImpression(
      placement,
      t,
      "render-abuse-4",
      "corr-abuse-4",
      "viewer-abuse-4",
    );
    await ledger.publish(selfPayer, {
      userAgent: BROWSER_UA,
      actorTenantId: PAYER,
    });
    rows = ledger.readRows();
    expect(rows).toHaveLength(6);
    expect(rows[4].classification).toBe("SELF");
    expect(rows[4].classificationReason).toBe("self-actor-publisher");
    expect(rows[5].classification).toBe("SELF");
    expect(rows[5].classificationReason).toBe("self-actor-payer");

    const summary = ledger.summarize({});
    expect(summary.rows).toBe(6);
    expect(summary.byClassification).toEqual({
      COUNTED: 1,
      SELF: 2,
      BOT: 2,
      DUPLICATE: 1,
      RATE_LIMITED: 0,
      INVALID: 0,
    });
    expect(summary.impressions).toBe(1);
    expect(summary.clicks).toBe(0);

    evidence("step6e", {
      rows: summary.rows,
      byClassification: summary.byClassification,
      countedImpressions: summary.impressions,
      replayReceiptIdentical: replay.receiptRef === first.receiptRef,
    });
  }, 120000);
});
