/**
 * B4 events-route tests plus the end-to-end integration proof.
 *
 * Route law under test (DESIGN.md component E and security section;
 * B2 decision 2):
 * - The flag gates the route: off -> 404, nothing recorded.
 * - A well-formed draft records and returns the ledger receipt.
 * - Ingest context is SERVER-side: the user agent from its header,
 *   the actor tenant from the authenticated session cookie through
 *   the binding resolver. Body-supplied actor tenancy is an unknown
 *   field (400), and the draft's own actor scope cannot drive the
 *   SELF classification: with a publisher-bound session the same
 *   draft classifies SELF; without a session it classifies COUNTED.
 * - Malformed bodies (bad JSON, wrong shape, unknown fields,
 *   client-supplied classification) are a typed 400 and write
 *   nothing; oversized bodies are a 413.
 * - A forged impression key (not tracker-minted) is recorded but
 *   classified INVALID by the ledger, never counted.
 *
 * Integration: seed consent + campaign through the B1 stores,
 * compose through the B4 render seam, mint the impression through
 * the B4 collector core, POST it through the real route handler,
 * and the real ledger shows COUNTED; a trusted collector click
 * follows the same path and counts as the campaign's first click.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import {
  createAdsEventsPostHandler,
  type AdsEventsRouteDeps,
} from "../events-route";
import {
  createSessionValue,
  SESSION_COOKIE_NAME,
} from "../../identity/session";
import {
  explainCandidateRank,
  type RankedCandidate,
} from "../../rank/object-ranker";
import {
  createObjectImpressionTracker,
  type FydObjectEventDraft,
  type ObjectEventContext,
} from "../../rank/object-events";
import {
  activateCampaign,
  createCampaign,
  type CampaignCreatedPayload,
} from "../campaign-store";
import { createAdsCollector } from "../collector";
import { DISCLOSURE_TEXT_VERSION } from "../disclosure";
import { AdsEventLedger } from "../event-ledger";
import { declareSlot, grantConsent } from "../inventory-store";
import {
  BUDGET_WINDOW_MS,
  DAILY_CLICKS_CAP,
  DAILY_IMPRESSIONS_CAP,
} from "../policy";
import { composeLoopSurfaceComposition } from "../render";

const PAYER = "ping-fyd";
const PUBLISHER = "loop-demo";
const SURFACE = "loop-demo";
const OBJECT_ID = "ping-fyd-business";
const SLOT_ID = "slot-loop-demo-main";
const CAMPAIGN_ID = "ping-house-001";
const VIEWER = "viewer-scope-1";
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";
const SECRET = "b4-test-session-secret-0123456789abcdef";
const FLAG_ON = { FYD_ADS_LOOP_ENABLED: "1" } as const;

let now = Date.now();

beforeEach(() => {
  now = Date.now();
  process.env.FYD_ADS_DIR = mkdtempSync(join(tmpdir(), "fyd-ads-b4-route-"));
});

afterEach(() => {
  delete process.env.FYD_ADS_DIR;
});

function seedSlotAndCampaign(): void {
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
      consentId: "consent-1",
      actorIdentityRef: "demo-owner",
      scope: { surfaces: [SURFACE], slotKinds: ["portal-object"] },
      disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
      grantedAt: new Date(now).toISOString(),
    },
  });
  const payload: CampaignCreatedPayload = {
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
  createCampaign({ actorTenantId: PAYER, campaign: payload });
  activateCampaign({ actorTenantId: PAYER, campaignId: CAMPAIGN_ID });
}

function candidate(objectId: string): RankedCandidate {
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
    now,
  );
}

/** Compose through the real seam and mint a sponsored impression via the collector. */
function composeAndMintImpression(): {
  context: ObjectEventContext;
  draft: FydObjectEventDraft;
} {
  const composition = composeLoopSurfaceComposition({
    publisherTenantId: PUBLISHER,
    surface: SURFACE,
    viewerScopeRef: VIEWER,
    candidates: [
      candidate("ping-fyd-svc-calls"),
      candidate("ping-fyd-svc-followup"),
      candidate("ping-fyd-svc-scheduling"),
      candidate(OBJECT_ID),
    ],
    limit: 12,
    now,
    env: FLAG_ON,
  });
  if (!composition.sponsored) throw new Error("expected an eligible placement");
  const item = composition.items.find((i) => i.sponsorship !== null);
  if (!item?.eventContext) throw new Error("expected a collector context");
  const drafts: FydObjectEventDraft[] = [];
  const collector = createAdsCollector({
    context: item.eventContext,
    post: (draft) => drafts.push(draft),
  });
  const at = Date.now();
  collector.observe({ at, rendered: true, visibleFraction: 1, documentVisible: true });
  collector.observe({
    at: at + 1000,
    rendered: true,
    visibleFraction: 1,
    documentVisible: true,
  });
  if (drafts.length !== 1) throw new Error("expected one impression draft");
  return { context: item.eventContext, draft: drafts[0] };
}

/** Mint an organic impression draft through the contract tracker. */
function organicImpression(renderInstanceId: string): FydObjectEventDraft {
  const tracker = createObjectImpressionTracker({
    objectId: "ping-fyd-svc-calls",
    surface: SURFACE,
    correlationId: "corr-route",
    renderInstanceId,
  });
  tracker.observe({ at: now, rendered: true, visibleFraction: 1, documentVisible: true });
  const draft = tracker.observe({
    at: now + 1000,
    rendered: true,
    visibleFraction: 1,
    documentVisible: true,
  });
  if (!draft) throw new Error("tracker did not emit");
  return draft;
}

function requestFor(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost:3000/api/fyd/ads/events", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": BROWSER_UA, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function handler(deps: AdsEventsRouteDeps = {}) {
  return createAdsEventsPostHandler({ env: FLAG_ON, ...deps });
}

describe("flag gate", () => {
  it("answers 404 and records nothing when the loop is disabled", async () => {
    const post = createAdsEventsPostHandler({ env: {} });
    const res = await post(requestFor(organicImpression("render-off")));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe("ads-loop-disabled");
    expect(new AdsEventLedger().summarize().rows).toBe(0);
  });
});

describe("recording", () => {
  it("records a well-formed draft and returns the receipt", async () => {
    seedSlotAndCampaign();
    const res = await handler()(requestFor(organicImpression("render-a")));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe("recorded");
    expect(json.receiptRef).toMatch(/^ads-receipt:/);
    const summary = new AdsEventLedger().summarize();
    expect(summary.rows).toBe(1);
    expect(summary.impressions).toBe(1);
    expect(summary.byClassification.COUNTED).toBe(1);
  });

  it("records a forged impression key as INVALID, never counted", async () => {
    seedSlotAndCampaign();
    const forged = {
      ...organicImpression("render-forged"),
      dedupeKey: "hand-built-key",
    };
    const res = await handler()(requestFor(forged));
    expect(res.status).toBe(201);
    const summary = new AdsEventLedger().summarize();
    expect(summary.rows).toBe(1);
    expect(summary.byClassification.INVALID).toBe(1);
    expect(summary.impressions).toBe(0);
  });
});

describe("server-side ingest context", () => {
  const PUBLISHER_IDENTITY = "11111111-2222-4333-8444-555555555555";
  const deps: AdsEventsRouteDeps = {
    env: { ...FLAG_ON, FYD_SESSION_SECRET: SECRET },
    resolveTenantIdForIdentity: (identityId) =>
      identityId === PUBLISHER_IDENTITY ? PUBLISHER : null,
  };

  it("classifies by the session-resolved actor tenant (SELF), not the body", async () => {
    seedSlotAndCampaign();
    const { draft } = composeAndMintImpression();
    const cookie =
      SESSION_COOKIE_NAME + "=" + createSessionValue(PUBLISHER_IDENTITY, SECRET);
    const res = await handler(deps)(requestFor(draft, { cookie }));
    expect(res.status).toBe(201);
    const rows = new AdsEventLedger().readRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].classification).toBe("SELF");
    expect(new AdsEventLedger().summarize().impressions).toBe(0);
  });

  it("without a session the same path counts the event: body actor claims do not drive SELF", async () => {
    seedSlotAndCampaign();
    const { draft } = composeAndMintImpression();
    const res = await handler(deps)(requestFor(draft));
    expect(res.status).toBe(201);
    const rows = new AdsEventLedger().readRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].classification).toBe("COUNTED");
  });

  it("rejects a body that tries to assert its own actor tenancy", async () => {
    seedSlotAndCampaign();
    const { draft } = composeAndMintImpression();
    const spoofed = { ...draft, actorTenantId: PUBLISHER };
    const res = await handler(deps)(requestFor(spoofed));
    expect(res.status).toBe(400);
    expect(new AdsEventLedger().summarize().rows).toBe(0);
  });
});

describe("malformed bodies write nothing", () => {
  it("rejects non-JSON, arrays, missing keys, unknown fields, and client classifications", async () => {
    seedSlotAndCampaign();
    const post = handler();
    const good = organicImpression("render-m");
    const cases: unknown[] = [
      "this is not json",
      [good],
      { ...good, dedupeKey: undefined },
      { ...good, classification: "COUNTED" },
      { ...good, receiptRef: "ads-receipt:forged" },
      { ...good, userAgent: "spoofed-agent" },
      { ...good, type: "FYD_NOPE" },
      { ...good, occurredAt: "yesterday" },
    ];
    for (const body of cases) {
      const res = await post(requestFor(body));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("invalid-event-draft");
    }
    expect(new AdsEventLedger().summarize().rows).toBe(0);
  });

  it("rejects an oversized body with 413", async () => {
    const post = handler();
    const big = {
      ...organicImpression("render-big"),
      dedupeKey: "x".repeat(20 * 1024),
    };
    const res = await post(requestFor(big));
    expect(res.status).toBe(413);
    expect(new AdsEventLedger().summarize().rows).toBe(0);
  });
});

describe("integration: the full B4 stack", () => {
  it("seed -> compose -> collect -> route -> ledger COUNTED, then a counted click", async () => {
    seedSlotAndCampaign();
    const { context, draft } = composeAndMintImpression();
    const post = handler();
    const res = await post(requestFor(draft));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe("recorded");
    expect(json.receiptRef).toMatch(/^ads-receipt:/);

    const ledger = new AdsEventLedger();
    const day = draft.occurredAt;
    const utcDay =
      new Date(day).getUTCFullYear().toString() +
      (new Date(day).getUTCMonth() + 1).toString().padStart(2, "0") +
      new Date(day).getUTCDate().toString().padStart(2, "0");
    expect(ledger.countedTotalsByCampaign(CAMPAIGN_ID, utcDay)).toEqual({
      impressions: 1,
      clicks: 0,
    });
    expect(ledger.summarize().byClassification.COUNTED).toBe(1);

    // The click path: a trusted activation on the same placement,
    // minted by the collector through the contract's action builder.
    const clicks: FydObjectEventDraft[] = [];
    const collector = createAdsCollector({
      context,
      post: (d) => clicks.push(d),
    });
    collector.click({
      isTrusted: true,
      kind: "pointer",
      at: Date.now(),
      interactionId: "ix-integration-1",
    });
    expect(clicks).toHaveLength(1);
    const clickRes = await post(requestFor(clicks[0]));
    expect(clickRes.status).toBe(201);
    expect(ledger.countedTotalsByCampaign(CAMPAIGN_ID, utcDay)).toEqual({
      impressions: 1,
      clicks: 1,
    });
  });
});
