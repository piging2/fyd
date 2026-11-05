import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  explainCandidateRank,
  type RankedCandidate,
} from "../../rank/object-ranker";
import {
  createObjectImpressionTracker,
  type FydObjectEventDraft,
} from "../../rank/object-events";
import type { EligibleSponsoredPlacement } from "../../rank/sponsored-placement";
import {
  activateCampaign,
  createCampaign,
  endCampaign,
  pauseCampaign,
  type CampaignCreatedPayload,
} from "../campaign-store";
import {
  listPlacementDecisionIds,
  readPlacementDecision,
  type PlacementDecisionRecord,
} from "../decision-store";
import { DISCLOSURE_TEXT_VERSION } from "../disclosure";
import { AdsEventLedger } from "../event-ledger";
import {
  declareSlot,
  grantConsent,
  revokeConsent,
} from "../inventory-store";
import {
  BUDGET_WINDOW_MS,
  DAILY_CLICKS_CAP,
  DAILY_IMPRESSIONS_CAP,
  utcDayKey,
} from "../policy";
import { evaluateComposition } from "../provider";

const PAYER = "ping-fyd";
const PUBLISHER = "loop-demo";
const SURFACE = "loop-demo";
const OBJECT_ID = "ping-fyd-object";
const SLOT_ID = "slot-loop-demo-main";
const CAMPAIGN_ID = "ping-house-001";
const AT = "2026-11-04T19:00:00.000Z";
const NOW = Date.UTC(2026, 10, 4, 19, 0, 0);
const VIEWER = "viewer-scope-1";
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";

let adsRoot = "";

function freshDir(): string {
  adsRoot = mkdtempSync(join(tmpdir(), "fyd-ads-b3-test-"));
  process.env.FYD_ADS_DIR = adsRoot;
  return adsRoot;
}

beforeEach(() => {
  freshDir();
});

afterEach(() => {
  delete process.env.FYD_ADS_DIR;
});

function campaignPayload(
  overrides: Partial<CampaignCreatedPayload> = {},
): CampaignCreatedPayload {
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
    ...overrides,
  };
}

function seedActiveCampaign(
  overrides: Partial<CampaignCreatedPayload> = {},
): void {
  const payload = campaignPayload(overrides);
  createCampaign({ actorTenantId: PAYER, campaign: payload });
  activateCampaign({ actorTenantId: PAYER, campaignId: payload.campaignId });
}

function seedSlot(withConsent: boolean): void {
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
  if (withConsent) {
    grantConsent({
      actorTenantId: PUBLISHER,
      slotId: SLOT_ID,
      consent: {
        consentId: "consent-1",
        actorIdentityRef: "demo-owner",
        scope: { surfaces: [SURFACE], slotKinds: ["portal-object"] },
        disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
        grantedAt: AT,
      },
    });
  }
}

function candidate(objectId: string, proximity = 0.9): RankedCandidate {
  return explainCandidateRank(
    {
      objectId,
      semanticProximity: proximity,
      semanticTargetPresent: true,
      followed: false,
      liked: false,
      capabilityCount: 3,
      recentInteractionAt: null,
      slotStability: 1,
      slotCollisionRisk: 0,
    },
    NOW,
  );
}

/** Three organics ahead of the promoted object: room for spacing + share. */
function standardCandidates(): RankedCandidate[] {
  return [
    candidate("org-1"),
    candidate("org-2"),
    candidate("org-3"),
    candidate(OBJECT_ID),
  ];
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    publisherTenantId: PUBLISHER,
    surface: SURFACE,
    viewerScopeRef: VIEWER,
    candidates: standardCandidates(),
    limit: 10,
    now: NOW,
    ...overrides,
  };
}

/** Mint a sponsored impression draft through the rank contract's own tracker. */
function mintSponsoredImpression(
  placement: EligibleSponsoredPlacement,
  at: number,
  renderInstanceId: string,
  correlationId: string,
): FydObjectEventDraft {
  const tracker = createObjectImpressionTracker({
    objectId: OBJECT_ID,
    surface: SURFACE,
    correlationId,
    renderInstanceId,
    sponsorship: placement,
  });
  const first = tracker.observe({
    at,
    rendered: true,
    visibleFraction: 1,
    documentVisible: true,
  });
  if (first !== null) throw new Error("tracker emitted before the dwell rule");
  const draft = tracker.observe({
    at: at + 1000,
    rendered: true,
    visibleFraction: 1,
    documentVisible: true,
  });
  if (draft === null) throw new Error("tracker did not emit after the dwell rule");
  return draft;
}

function onlyDecision(): PlacementDecisionRecord {
  const ids = listPlacementDecisionIds();
  if (ids.length !== 1) {
    throw new Error("expected exactly one decision record, got " + ids.length);
  }
  const record = readPlacementDecision(ids[0]);
  if (record === null) throw new Error("decision record unreadable");
  return record;
}

describe("eligible path", () => {
  it("composes the sponsored placement, persists the decision before returning, and the ledger counts a real impression against it", async () => {
    seedSlot(true);
    seedActiveCampaign();

    const result = evaluateComposition(request());

    if (result.sponsored === null) {
      throw new Error("expected an eligible sponsored placement");
    }
    expect(result.sponsored.placement.campaignId).toBe(CAMPAIGN_ID);
    expect(result.sponsored.placement.disclosure).toBe("Sponsored");
    const composed = result.placements.filter((p) => p.sponsorship !== null);
    expect(composed).toHaveLength(1);
    expect(composed[0].candidate.objectId).toBe(OBJECT_ID);
    expect(result.placements).toHaveLength(4);

    // The decision record is already durable at return time, in the
    // exact canonical shape the ledger's coverage reader consumes.
    const decisionId = result.sponsored.decisionId;
    const raw = JSON.parse(
      readFileSync(join(adsRoot, "decisions", decisionId + ".json"), "utf8"),
    ) as Record<string, unknown>;
    expect(raw.decisionId).toBe(decisionId);
    expect(raw.evaluatedAt).toBe(NOW);
    expect(raw.surface).toBe(SURFACE);
    expect(raw.slotId).toBe(SLOT_ID);
    expect(raw.campaignId).toBe(CAMPAIGN_ID);
    expect((raw.evaluation as { eligible: unknown }).eligible).toBe(true);
    const record = readPlacementDecision(decisionId);
    if (record === null) throw new Error("decision record missing");
    expect(record.authoritySnapshot?.decision).toBe("allowed");
    expect(record.authoritySnapshot?.budget).toBe("within-scope");
    expect(record.authoritySnapshot?.decisionRef).toBe(decisionId);
    expect(record.composition).toEqual({ included: true });
    expect(result.evaluations).toHaveLength(1);
    expect(result.evaluations[0]).toMatchObject({
      decisionId,
      eligible: true,
      includedInComposition: true,
    });

    // End to end: a tracker-minted sponsored impression against this
    // decision is classified COUNTED by the real B2 ledger.
    const draft = mintSponsoredImpression(
      result.sponsored.placement,
      NOW,
      "render-e2e-1",
      "corr-e2e-1",
    );
    const ledger = new AdsEventLedger({ now: () => NOW + 1000 });
    const receipt = await ledger.publish(draft, { userAgent: BROWSER_UA });
    expect(receipt.status).toBe("recorded");
    const rows = ledger.readRows({ campaignId: CAMPAIGN_ID });
    expect(rows).toHaveLength(1);
    expect(rows[0].classification).toBe("COUNTED");
    expect(
      ledger.countedTotalsByCampaign(CAMPAIGN_ID, utcDayKey(NOW)),
    ).toEqual({ impressions: 1, clicks: 0 });
  });
});

describe("consent gate (the loop's own law, before the rank contract)", () => {
  it("records consent-missing and offers no placement when consent was never granted", () => {
    seedSlot(false);
    seedActiveCampaign();

    const result = evaluateComposition(request());

    expect(result.sponsored).toBeNull();
    expect(result.placements.every((p) => p.sponsorship === null)).toBe(true);
    const record = onlyDecision();
    expect(record.evaluation).toMatchObject({
      eligible: false,
      reason: "consent-missing",
    });
    expect(record.authoritySnapshot?.decision).toBe("denied");
    expect(result.evaluations[0].reason).toBe("consent-missing");
  });

  it("records consent-revoked and offers no placement after revocation", () => {
    seedSlot(true);
    seedActiveCampaign();
    revokeConsent({
      actorTenantId: PUBLISHER,
      slotId: SLOT_ID,
      consentId: "consent-1",
      actorIdentityRef: "demo-owner",
      revokedAt: "2026-11-04T19:05:00.000Z",
    });

    const result = evaluateComposition(request());

    expect(result.sponsored).toBeNull();
    const record = onlyDecision();
    expect(record.evaluation).toMatchObject({
      eligible: false,
      reason: "consent-revoked",
    });
  });
});

describe("evaluator rejections, recorded by name", () => {
  it("records inactive-campaign for a paused campaign", () => {
    seedSlot(true);
    seedActiveCampaign();
    pauseCampaign({ actorTenantId: PAYER, campaignId: CAMPAIGN_ID });

    const result = evaluateComposition(request());

    expect(result.sponsored).toBeNull();
    expect(onlyDecision().evaluation).toMatchObject({
      eligible: false,
      reason: "inactive-campaign",
    });
  });

  it("records inactive-campaign for an ended campaign", () => {
    seedSlot(true);
    seedActiveCampaign();
    endCampaign({ actorTenantId: PAYER, campaignId: CAMPAIGN_ID });

    const result = evaluateComposition(request());

    expect(result.sponsored).toBeNull();
    expect(onlyDecision().evaluation).toMatchObject({
      eligible: false,
      reason: "inactive-campaign",
    });
  });

  it("records outside-budget once counted ledger rows reach the campaign cap", async () => {
    seedSlot(true);
    seedActiveCampaign({
      campaignId: "ping-house-mini",
      budgetScope: {
        impressionsCap: 2,
        clicksCap: DAILY_CLICKS_CAP,
        windowMs: BUDGET_WINDOW_MS,
      },
    });

    // Drive two real deliveries through the provider + ledger loop.
    for (let i = 0; i < 2; i++) {
      const at = NOW + i * 2000;
      const res = evaluateComposition(request({ now: at }));
      if (res.sponsored === null) {
        throw new Error("expected eligibility before the cap, round " + i);
      }
      const draft = mintSponsoredImpression(
        res.sponsored.placement,
        at,
        "render-budget-" + i,
        "corr-budget-" + i,
      );
      const ledger = new AdsEventLedger({ now: () => at + 1000 });
      await ledger.publish(draft, { userAgent: BROWSER_UA });
    }
    const check = new AdsEventLedger();
    expect(
      check.countedTotalsByCampaign("ping-house-mini", utcDayKey(NOW)),
    ).toEqual({ impressions: 2, clicks: 0 });

    const result = evaluateComposition(request({ now: NOW + 4000 }));

    expect(result.sponsored).toBeNull();
    const exhausted = listPlacementDecisionIds()
      .map((id) => readPlacementDecision(id))
      .filter(
        (r) =>
          r !== null &&
          !r.evaluation.eligible &&
          r.evaluation.reason === "outside-budget",
      );
    expect(exhausted).toHaveLength(1);
    expect(exhausted[0]?.authoritySnapshot?.budget).toBe("exhausted");
    expect(exhausted[0]?.authoritySnapshot?.decision).toBe("allowed");
  });

  it("records frequency-capped once the exposure window reaches the cap", async () => {
    seedSlot(true);
    seedActiveCampaign();

    // Seed three COUNTED organic impressions of the promoted object
    // for this viewer scope; the frequency window counts them.
    const ledger = new AdsEventLedger({ now: () => NOW });
    for (let i = 0; i < 3; i++) {
      const renderInstanceId = "render-freq-" + i;
      await ledger.publish(
        {
          type: "FYD_OBJECT_IMPRESSION",
          objectId: OBJECT_ID,
          surface: SURFACE,
          correlationId: "corr-freq-" + i,
          renderInstanceId,
          occurredAt: NOW,
          actor: { sessionId: VIEWER },
          dedupeKey: JSON.stringify([
            "fyd-object-impression",
            OBJECT_ID,
            SURFACE,
            renderInstanceId,
            null,
          ]),
        },
        { userAgent: BROWSER_UA },
      );
    }
    expect(ledger.summarize({}).impressions).toBe(3);

    const result = evaluateComposition(request());

    expect(result.sponsored).toBeNull();
    const record = onlyDecision();
    expect(record.evaluation).toMatchObject({
      eligible: false,
      reason: "frequency-capped",
    });
    expect(record.exposureWindow?.impressions).toBe(3);
  });

  it("keeps an eligible evaluation eligible in the record when the share cap excludes it from composition", () => {
    seedSlot(true);
    seedActiveCampaign();

    // Capacity 2: floor(2 * 0.25) = 0 sponsored allowed by compose.
    const result = evaluateComposition(
      request({ candidates: [candidate(OBJECT_ID), candidate("org-1")], limit: 2 }),
    );

    expect(result.sponsored).toBeNull();
    expect(result.placements.every((p) => p.sponsorship === null)).toBe(true);
    const record = onlyDecision();
    expect(record.evaluation.eligible).toBe(true);
    expect(record.composition).toEqual({
      included: false,
      reason: "share-cap",
    });
    expect(result.evaluations[0]).toMatchObject({
      eligible: true,
      includedInComposition: false,
    });
  });
});

describe("failure handling and isolation", () => {
  it("never throws on a corrupt ledger; returns no placement and records provider-error with the failure class", async () => {
    seedSlot(true);
    seedActiveCampaign();
    const ledger = new AdsEventLedger({ now: () => NOW });
    await ledger.publish(
      {
        type: "FYD_OBJECT_IMPRESSION",
        objectId: OBJECT_ID,
        surface: SURFACE,
        correlationId: "corr-corrupt-0",
        renderInstanceId: "render-corrupt-0",
        occurredAt: NOW,
        dedupeKey: JSON.stringify([
          "fyd-object-impression",
          OBJECT_ID,
          SURFACE,
          "render-corrupt-0",
          null,
        ]),
      },
      { userAgent: BROWSER_UA },
    );
    writeFileSync(
      join(adsRoot, "ledger", utcDayKey(NOW) + ".jsonl"),
      "this is not a ledger row\n",
      "utf8",
    );

    let result: ReturnType<typeof evaluateComposition> | null = null;
    expect(() => {
      result = evaluateComposition(request());
    }).not.toThrow();
    if (result === null) throw new Error("provider returned nothing");
    const settled: ReturnType<typeof evaluateComposition> = result;
    expect(settled.sponsored).toBeNull();
    expect(settled.placements.every((p) => p.sponsorship === null)).toBe(true);
    const record = onlyDecision();
    expect(record.evaluation).toMatchObject({
      eligible: false,
      reason: "provider-error",
      failureClass: "LedgerCorruptError",
    });
  });

  it("never offers one tenant's campaigns on another tenant's surfaces", () => {
    seedSlot(true);
    seedActiveCampaign();
    // A second publisher with its own consented slot on its own surface.
    declareSlot({
      actorTenantId: "tenant-b",
      slot: {
        slotId: "slot-tenant-b-main",
        publisherTenantId: "tenant-b",
        surface: "tenant-b-home",
        slotKind: "portal-object",
        compositionCapacity: 12,
      },
    });
    grantConsent({
      actorTenantId: "tenant-b",
      slotId: "slot-tenant-b-main",
      consent: {
        consentId: "consent-b-1",
        actorIdentityRef: "demo-owner-b",
        scope: { surfaces: ["tenant-b-home"], slotKinds: ["portal-object"] },
        disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
        grantedAt: AT,
      },
    });

    // Tenant B asking on loop-demo's surface sees no slots, no offers.
    const foreign = evaluateComposition(
      request({ publisherTenantId: "tenant-b" }),
    );
    expect(foreign.sponsored).toBeNull();
    expect(foreign.evaluations).toHaveLength(0);

    // Tenant B on its own surface: the campaign names only loop-demo.
    const own = evaluateComposition(
      request({ publisherTenantId: "tenant-b", surface: "tenant-b-home" }),
    );
    expect(own.sponsored).toBeNull();
    expect(own.evaluations).toHaveLength(0);
    expect(own.placements.every((p) => p.sponsorship === null)).toBe(true);
    expect(listPlacementDecisionIds()).toHaveLength(0);
  });

  it("is deterministic: identical state at the same instant yields the identical composition and decision bytes", () => {
    seedSlot(true);
    seedActiveCampaign();

    const first = evaluateComposition(request());
    const decisionPath = join(
      adsRoot,
      "decisions",
      (first.sponsored?.decisionId ?? "") + ".json",
    );
    const bytesAfterFirst = readFileSync(decisionPath, "utf8");

    const second = evaluateComposition(request());

    expect(second).toEqual(first);
    expect(readFileSync(decisionPath, "utf8")).toBe(bytesAfterFirst);
    expect(listPlacementDecisionIds()).toHaveLength(1);
  });
});
