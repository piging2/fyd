import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createObjectImpressionTracker,
  type FydObjectEventDraft,
} from "../../rank/object-events";
import { DISCLOSURE_TEXT_VERSION } from "../disclosure";
import {
  activateCampaign,
  createCampaign,
  endCampaign,
  type CampaignCreatedPayload,
} from "../campaign-store";
import {
  declareSlot,
  grantConsent,
  revokeConsent,
} from "../inventory-store";
import {
  BUDGET_WINDOW_MS,
  DAILY_CLICKS_CAP,
  DAILY_IMPRESSIONS_CAP,
  FREQUENCY_WINDOW_MS,
  utcDayKey,
} from "../policy";
import {
  AdsEventLedger,
  LedgerCorruptError,
  LedgerValidationError,
  createAdsEventLedger,
} from "../event-ledger";

const PAYER = "ping-fyd";
const PUBLISHER = "loop-demo";
const SURFACE = "loop-demo";
const OBJECT_ID = "ping-fyd-object";
const CAMPAIGN_ID = "ping-house-001";
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

let dir = "";
let nowMs = T0;
let renderSeq = 0;
let ledger: AdsEventLedger;

function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), "fyd-ads-ledger-test-"));
  process.env.FYD_ADS_DIR = d;
  return d;
}

beforeEach(() => {
  dir = freshDir();
  nowMs = T0;
  renderSeq = 0;
  ledger = createAdsEventLedger({ now: () => nowMs });
});

afterEach(() => {
  delete process.env.FYD_ADS_DIR;
});

function nextRender(): string {
  renderSeq += 1;
  return "render-" + renderSeq;
}

/* ------------------------- seeds (B1 command paths) ------------------------- */

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

function seedActiveCampaign() {
  createCampaign({ actorTenantId: PAYER, campaign: pingHouseCampaign(), at: AT });
  return activateCampaign({ actorTenantId: PAYER, campaignId: CAMPAIGN_ID, at: AT });
}

function declareDemoSlot() {
  return declareSlot({
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
}

function grantDemoConsent() {
  return grantConsent({
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

function seedLoop() {
  seedActiveCampaign();
  declareDemoSlot();
  grantDemoConsent();
}

/** A B3-shaped placement-decision record, per the design data model. */
function seedDecision(
  overrides: Partial<{
    decisionId: string;
    evaluatedAt: number;
    surface: string;
    slotId: string;
    campaignId: string;
  }> = {},
) {
  const decisionsDir = join(dir, "decisions");
  mkdirSync(decisionsDir, { recursive: true });
  const rec = {
    decisionId: overrides.decisionId ?? "decision-001",
    evaluatedAt: overrides.evaluatedAt ?? T0,
    surface: overrides.surface ?? SURFACE,
    slotId: overrides.slotId ?? SLOT_ID,
    campaignId: overrides.campaignId ?? CAMPAIGN_ID,
    authoritySnapshot: { decision: "allowed", grant: "ad.buy" },
    exposureWindow: { impressions: 0 },
    evaluation: { eligible: true, digest: "test-digest" },
  };
  writeFileSync(
    join(decisionsDir, rec.decisionId + ".json"),
    JSON.stringify(rec, null, 2) + "\n",
    "utf8",
  );
}

/* ------------------------------ draft builders ------------------------------ */

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
  if (!("occurredAt" in overrides)) draft.occurredAt = nowMs;
  if (!overrides.dedupeKey) draft.dedupeKey = impressionKey(draft);
  return draft;
}

function organicImpression(
  overrides: Partial<FydObjectEventDraft> = {},
): FydObjectEventDraft {
  const draft: FydObjectEventDraft = {
    type: "FYD_OBJECT_IMPRESSION",
    objectId: "obj-organic",
    surface: SURFACE,
    correlationId: "corr-1",
    renderInstanceId: "",
    occurredAt: T0,
    actor: { sessionId: "viewer-session-1" },
    dedupeKey: "",
    ...overrides,
  };
  if (!("renderInstanceId" in overrides)) draft.renderInstanceId = nextRender();
  if (!("occurredAt" in overrides)) draft.occurredAt = nowMs;
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
  if (!("occurredAt" in overrides)) draft.occurredAt = nowMs;
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

function floodAction(i: number, sessionId: string): FydObjectEventDraft {
  const renderInstanceId = "flood-render-" + i;
  return {
    type: "FYD_OBJECT_OPENED",
    action: "OBJECT_OPEN",
    objectId: "obj-flood",
    surface: SURFACE,
    correlationId: "corr-flood",
    renderInstanceId,
    occurredAt: T0,
    actor: { sessionId },
    dedupeKey: JSON.stringify([
      "fyd-object-action",
      "obj-flood",
      SURFACE,
      renderInstanceId,
      "OBJECT_OPEN",
      "interaction-" + i,
    ]),
  };
}

function dayFileText(day: string = DAY): string {
  return readFileSync(join(dir, "ledger", day + ".jsonl"), "utf8");
}

/* --------------------------------- adapter --------------------------------- */

describe("adapter contract", () => {
  it("binds the rank adapter as canonical and records a sponsored impression with full server attribution", async () => {
    seedLoop();
    seedDecision();
    expect(ledger.authority).toBe("canonical");
    const result = await ledger.publish(sponsoredImpression(), {
      userAgent: GOOD_UA,
    });
    expect(result).toEqual({
      status: "recorded",
      receiptRef: "ads-receipt:" + DAY + ":0",
    });
    const rows = ledger.readRows();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.classification).toBe("COUNTED");
    expect(row.classificationReason).toBe("counted");
    expect(row.slotId).toBe(SLOT_ID);
    expect(row.publisherTenantId).toBe(PUBLISHER);
    expect(row.viewerScopeRef).toBe("viewer-session-1");
    expect(row.receivedAt).toBe(T0);
    expect(row.prevHash).toBe("");
    expect(row.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("counts an impression minted by the real rank tracker (50% / 1s rule)", async () => {
    seedLoop();
    const tracker = createObjectImpressionTracker({
      objectId: "obj-tracker",
      surface: SURFACE,
      correlationId: "corr-tracker",
      renderInstanceId: "render-tracker-1",
    });
    expect(
      tracker.observe({
        at: T0,
        rendered: true,
        visibleFraction: 0.4,
        documentVisible: true,
      }),
    ).toBeNull();
    expect(
      tracker.observe({
        at: T0 + 500,
        rendered: true,
        visibleFraction: 0.6,
        documentVisible: true,
      }),
    ).toBeNull();
    const draft = tracker.observe({
      at: T0 + 1500,
      rendered: true,
      visibleFraction: 0.6,
      documentVisible: true,
    });
    if (draft === null) throw new Error("tracker should have emitted a draft");
    expect(draft.type).toBe("FYD_OBJECT_IMPRESSION");
    expect(draft.dedupeKey).toBe(
      JSON.stringify([
        "fyd-object-impression",
        "obj-tracker",
        SURFACE,
        "render-tracker-1",
        null,
      ]),
    );
    nowMs = T0 + 1500;
    const result = await ledger.publish(draft, { userAgent: GOOD_UA });
    expect(result.status).toBe("recorded");
    expect(ledger.readRows()[0].classification).toBe("COUNTED");
  });
});

/* -------------------------------- hash chain -------------------------------- */

describe("hash chain", () => {
  it("verifies an intact chain and reports an empty ledger as ok", async () => {
    expect(ledger.verifyChain()).toEqual({ ok: true, days: [] });
    seedLoop();
    seedDecision();
    await ledger.publish(sponsoredImpression(), { userAgent: GOOD_UA });
    await ledger.publish(organicImpression(), { userAgent: GOOD_UA });
    await ledger.publish(sponsoredAction(), { userAgent: GOOD_UA });
    const report = ledger.verifyChain();
    expect(report.ok).toBe(true);
    expect(report.days).toHaveLength(1);
    expect(report.days[0].day).toBe(DAY);
    expect(report.days[0].rows).toBe(3);
    expect(report.days[0].lastHash).toBe(ledger.readRows()[2].rowHash);
  });

  it("detects a tampered middle row at that row, and reads fail closed", async () => {
    seedLoop();
    seedDecision();
    await ledger.publish(sponsoredImpression(), { userAgent: GOOD_UA });
    await ledger.publish(organicImpression(), { userAgent: GOOD_UA });
    await ledger.publish(sponsoredAction(), { userAgent: GOOD_UA });
    const lines = dayFileText().split("\n").filter((l) => l.trim().length > 0);
    const tampered = JSON.parse(lines[1]) as Record<string, unknown>;
    tampered.occurredAt = (tampered.occurredAt as number) + 1;
    lines[1] = JSON.stringify(tampered);
    writeFileSync(
      join(dir, "ledger", DAY + ".jsonl"),
      lines.join("\n") + "\n",
      "utf8",
    );
    const report = ledger.verifyChain();
    expect(report.ok).toBe(false);
    expect(report.failure).toEqual({
      day: DAY,
      atRow: 1,
      reason: "row-hash-mismatch",
    });
    expect(() => ledger.summarize()).toThrow(LedgerCorruptError);
    const recount = ledger.recount();
    expect(recount.chainOk).toBe(false);
    expect(recount.match).toBe(false);
  });

  it("is append-only: earlier bytes never change and no mutation API exists", async () => {
    seedLoop();
    seedDecision();
    await ledger.publish(sponsoredImpression(), { userAgent: GOOD_UA });
    await ledger.publish(organicImpression(), { userAgent: GOOD_UA });
    const before = dayFileText();
    await ledger.publish(sponsoredAction(), { userAgent: GOOD_UA });
    const after = dayFileText();
    expect(after.startsWith(before)).toBe(true);
    const surface = Object.getOwnPropertyNames(AdsEventLedger.prototype).sort();
    expect(surface).toEqual(
      [
        "appendRow",
        "constructor",
        "countedTotalsByCampaign",
        "countedTotalsBySlot",
        "countedTotalsBySurface",
        "exposureWindow",
        "loadAllRows",
        "publish",
        "readRows",
        "recount",
        "summarize",
        "totalsByClassification",
        "validityFailure",
        "verifyChain",
      ].sort(),
    );
    expect(
      surface.some((n) => /delete|remove|update|edit|clear|truncate/i.test(n)),
    ).toBe(false);
  });
});

/* ---------------------------------- dedupe ---------------------------------- */

describe("dedupe (abuse check 1 and 2)", () => {
  it("returns the original receipt for an identical re-publish and appends nothing", async () => {
    seedLoop();
    seedDecision();
    const draft = sponsoredImpression();
    const first = await ledger.publish(draft, { userAgent: GOOD_UA });
    const second = await ledger.publish(draft, { userAgent: GOOD_UA });
    expect(second).toEqual(first);
    expect(ledger.readRows()).toHaveLength(1);
  });

  it("retains a DUPLICATE row when the payload differs under the same dedupeKey", async () => {
    seedLoop();
    seedDecision();
    const draft = sponsoredImpression();
    await ledger.publish(draft, { userAgent: GOOD_UA });
    const tampered = { ...draft, occurredAt: draft.occurredAt + 5000 };
    const result = await ledger.publish(tampered, { userAgent: GOOD_UA });
    expect(result.receiptRef).toBe("ads-receipt:" + DAY + ":1");
    const rows = ledger.readRows();
    expect(rows).toHaveLength(2);
    expect(rows[1].classification).toBe("DUPLICATE");
    expect(rows[1].classificationReason).toBe("dedupe-key-payload-mismatch");
    expect(ledger.countedTotalsByCampaign(CAMPAIGN_ID, DAY)).toEqual({
      impressions: 1,
      clicks: 0,
    });
  });

  it("classifies a second impression for the same render instance as DUPLICATE", async () => {
    seedLoop();
    const first = organicImpression({ renderInstanceId: "render-shared" });
    await ledger.publish(first, { userAgent: GOOD_UA });
    const replay = organicImpression({
      renderInstanceId: "render-shared",
      objectId: "obj-other",
    });
    await ledger.publish(replay, { userAgent: GOOD_UA });
    const rows = ledger.readRows();
    expect(rows).toHaveLength(2);
    expect(rows[1].classification).toBe("DUPLICATE");
    expect(rows[1].classificationReason).toBe("render-instance-replay");
  });
});

/* ------------------------------- classification ------------------------------ */

describe("classification (abuse checks 3 to 6)", () => {
  it("SELF: the campaign payer acting on its own placement never counts", async () => {
    seedLoop();
    seedDecision();
    await ledger.publish(sponsoredImpression(), {
      userAgent: GOOD_UA,
      actorTenantId: PAYER,
    });
    const row = ledger.readRows()[0];
    expect(row.classification).toBe("SELF");
    expect(row.classificationReason).toBe("self-actor-payer");
    expect(ledger.countedTotalsByCampaign(CAMPAIGN_ID, DAY)).toEqual({
      impressions: 0,
      clicks: 0,
    });
  });

  it("SELF: the slot publisher acting on its own surface never counts", async () => {
    seedLoop();
    await ledger.publish(organicImpression(), {
      userAgent: GOOD_UA,
      actorTenantId: PUBLISHER,
    });
    const row = ledger.readRows()[0];
    expect(row.classification).toBe("SELF");
    expect(row.classificationReason).toBe("self-actor-publisher");
  });

  it("BOT: a missing user agent never counts", async () => {
    seedLoop();
    await ledger.publish(organicImpression(), {});
    const row = ledger.readRows()[0];
    expect(row.classification).toBe("BOT");
    expect(row.classificationReason).toBe("user-agent-missing");
  });

  it("BOT: a known-bot user agent never counts", async () => {
    seedLoop();
    await ledger.publish(organicImpression(), { userAgent: BOT_UA });
    const row = ledger.readRows()[0];
    expect(row.classification).toBe("BOT");
    expect(row.classificationReason).toBe("user-agent-known-bot");
  });

  it("BOT: an empty render instance (no collector-minted instance) never counts", async () => {
    seedLoop();
    await ledger.publish(organicImpression({ renderInstanceId: "" }), {
      userAgent: GOOD_UA,
    });
    const row = ledger.readRows()[0];
    expect(row.classification).toBe("BOT");
    expect(row.classificationReason).toBe("render-instance-missing");
  });

  it(
    "RATE_LIMITED: the 61st draft from one viewer in a minute is excess; the window slides",
    async () => {
      seedLoop();
      for (let i = 1; i <= 60; i++) {
        await ledger.publish(floodAction(i, "viewer-flood"), {
          userAgent: GOOD_UA,
        });
      }
      expect(ledger.totalsByClassification().COUNTED).toBe(60);
      await ledger.publish(floodAction(61, "viewer-flood"), {
        userAgent: GOOD_UA,
      });
      const limited = ledger
        .readRows()
        .find((r) => r.classification === "RATE_LIMITED");
      expect(limited?.classificationReason).toBe("rate-limit-viewer");
      nowMs = T0 + 61 * 1000;
      await ledger.publish(floodAction(62, "viewer-flood"), {
        userAgent: GOOD_UA,
      });
      expect(ledger.totalsByClassification().COUNTED).toBe(61);
    },
    30000,
  );

  it(
    "RATE_LIMITED: drafts past 300 per slot in a minute are excess even from fresh viewers",
    async () => {
      seedLoop();
      for (let i = 1; i <= 300; i++) {
        await ledger.publish(floodAction(i, "slot-flood-viewer-" + i), {});
      }
      expect(ledger.totalsByClassification().BOT).toBe(300);
      await ledger.publish(floodAction(301, "slot-flood-fresh"), {
        userAgent: GOOD_UA,
      });
      const limited = ledger
        .readRows()
        .find((r) => r.classification === "RATE_LIMITED");
      expect(limited?.classificationReason).toBe("rate-limit-slot");
    },
    120000,
  );

  it("INVALID: a sponsorship triple naming an unknown campaign", async () => {
    seedLoop();
    const draft = sponsoredImpression({
      sponsorship: {
        placementId: "placement:unknown-campaign:loop-demo",
        campaignId: "unknown-campaign",
        payerId: PAYER,
      },
    });
    await ledger.publish(draft, { userAgent: GOOD_UA });
    const row = ledger.readRows()[0];
    expect(row.classification).toBe("INVALID");
    expect(row.classificationReason).toBe("campaign-unknown");
  });

  it("INVALID: a payer mismatch between the triple and the campaign", async () => {
    seedLoop();
    seedDecision();
    const draft = sponsoredImpression({
      sponsorship: {
        placementId: PLACEMENT_ID,
        campaignId: CAMPAIGN_ID,
        payerId: "other-payer",
      },
    });
    await ledger.publish(draft, { userAgent: GOOD_UA });
    const row = ledger.readRows()[0];
    expect(row.classification).toBe("INVALID");
    expect(row.classificationReason).toBe("payer-mismatch");
  });

  it("INVALID: an ended campaign", async () => {
    seedLoop();
    seedDecision();
    endCampaign({ actorTenantId: PAYER, campaignId: CAMPAIGN_ID, at: AT });
    await ledger.publish(sponsoredImpression(), { userAgent: GOOD_UA });
    const row = ledger.readRows()[0];
    expect(row.classification).toBe("INVALID");
    expect(row.classificationReason).toBe("campaign-ended");
  });

  it("INVALID: a slot whose consent was revoked", async () => {
    seedLoop();
    seedDecision();
    revokeConsent({
      actorTenantId: PUBLISHER,
      slotId: SLOT_ID,
      consentId: CONSENT_ID,
      actorIdentityRef: "demo-owner:loop-demo",
      revokedAt: AT,
      at: AT,
    });
    await ledger.publish(sponsoredImpression(), { userAgent: GOOD_UA });
    const row = ledger.readRows()[0];
    expect(row.classification).toBe("INVALID");
    expect(row.classificationReason).toBe("consent-revoked");
  });

  it("INVALID: no eligible placement decision covers the event", async () => {
    seedLoop();
    await ledger.publish(sponsoredImpression(), { userAgent: GOOD_UA });
    const row = ledger.readRows()[0];
    expect(row.classification).toBe("INVALID");
    expect(row.classificationReason).toBe("decision-not-covering");
  });

  it("INVALID: an expired placement decision does not cover a late event", async () => {
    seedLoop();
    seedDecision({ evaluatedAt: T0 - 31 * 60 * 1000 });
    await ledger.publish(sponsoredImpression(), { userAgent: GOOD_UA });
    const row = ledger.readRows()[0];
    expect(row.classification).toBe("INVALID");
    expect(row.classificationReason).toBe("decision-not-covering");
  });

  it("INVALID: an impression without collector-minted evidence (hand-made dedupeKey)", async () => {
    seedLoop();
    const draft = organicImpression({ dedupeKey: "hand-made-key" });
    await ledger.publish(draft, { userAgent: GOOD_UA });
    const row = ledger.readRows()[0];
    expect(row.classification).toBe("INVALID");
    expect(row.classificationReason).toBe("impression-evidence-missing");
  });
});

/* --------------------------------- read API --------------------------------- */

describe("read API", () => {
  async function mixedBatch() {
    seedLoop();
    seedDecision();
    await ledger.publish(sponsoredImpression(), { userAgent: GOOD_UA });
    await ledger.publish(sponsoredAction(), { userAgent: GOOD_UA });
    await ledger.publish(sponsoredImpression(), {});
    await ledger.publish(sponsoredImpression(), {
      userAgent: GOOD_UA,
      actorTenantId: PAYER,
    });
    await ledger.publish(organicImpression(), { userAgent: GOOD_UA });
    await ledger.publish(organicImpression({ dedupeKey: "hand-made" }), {
      userAgent: GOOD_UA,
    });
  }

  it("counts only COUNTED rows, by campaign, slot, surface, and classification", async () => {
    await mixedBatch();
    expect(ledger.countedTotalsByCampaign(CAMPAIGN_ID, DAY)).toEqual({
      impressions: 1,
      clicks: 1,
    });
    expect(ledger.countedTotalsBySlot(SLOT_ID)).toEqual({
      impressions: 2,
      clicks: 1,
    });
    expect(ledger.countedTotalsBySurface(SURFACE)).toEqual({
      impressions: 2,
      clicks: 1,
    });
    expect(ledger.totalsByClassification(DAY)).toEqual({
      COUNTED: 3,
      SELF: 1,
      BOT: 1,
      DUPLICATE: 0,
      RATE_LIMITED: 0,
      INVALID: 1,
    });
    const summary = ledger.summarize();
    expect(summary.rows).toBe(6);
    expect(summary.impressions).toBe(2);
    expect(summary.clicks).toBe(1);
  });

  it("reconciliation recount re-derives the same totals from raw rows", async () => {
    await mixedBatch();
    const recount = ledger.recount();
    expect(recount.chainOk).toBe(true);
    expect(recount.match).toBe(true);
    expect(recount.rowsScanned).toBe(6);
    expect(recount.recounted).toEqual(recount.summary);
    expect(recount.recounted.impressions).toBe(2);
    const campaignRecount = ledger.recount({ campaignId: CAMPAIGN_ID });
    expect(campaignRecount.match).toBe(true);
    expect(campaignRecount.recounted.impressions).toBe(1);
    expect(campaignRecount.recounted.clicks).toBe(1);
  });

  it("tenant isolation: publisher and advertiser reads never see another tenant's rows", async () => {
    seedLoop();
    seedDecision();
    declareSlot({
      actorTenantId: "tenant-b",
      slot: {
        slotId: "tenant-b-portal",
        publisherTenantId: "tenant-b",
        surface: "surface-b",
        slotKind: "portal-object",
        compositionCapacity: 4,
      },
      at: AT,
    });
    grantConsent({
      actorTenantId: "tenant-b",
      slotId: "tenant-b-portal",
      consent: {
        consentId: "consent-tenant-b-001",
        actorIdentityRef: "demo-owner:tenant-b",
        scope: { surfaces: ["surface-b"], slotKinds: ["portal-object"] },
        disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
        grantedAt: AT,
      },
      at: AT,
    });
    await ledger.publish(sponsoredImpression(), { userAgent: GOOD_UA });
    await ledger.publish(organicImpression(), { userAgent: GOOD_UA });
    await ledger.publish(
      organicImpression({ surface: "surface-b", objectId: "obj-b" }),
      { userAgent: GOOD_UA },
    );
    await ledger.publish(
      organicImpression({ surface: "surface-b", objectId: "obj-b" }),
      { userAgent: GOOD_UA },
    );
    const publisherView = ledger.summarize({ tenantId: PUBLISHER });
    expect(publisherView.rows).toBe(2);
    const tenantBView = ledger.summarize({ tenantId: "tenant-b" });
    expect(tenantBView.rows).toBe(2);
    expect(tenantBView.impressions).toBe(2);
    const advertiserView = ledger.summarize({ tenantId: PAYER });
    expect(advertiserView.rows).toBe(1);
    expect(advertiserView.impressions).toBe(1);
    expect(
      ledger.readRows({ tenantId: "tenant-b" }).every(
        (r) => r.surface === "surface-b",
      ),
    ).toBe(true);
  });

  it("exposure window counts only COUNTED impressions inside the trailing window", async () => {
    seedLoop();
    const input = {
      objectId: "obj-exp",
      surface: SURFACE,
      viewerScopeRef: "viewer-exp",
    };
    const draft = () =>
      organicImpression({
        objectId: "obj-exp",
        actor: { sessionId: "viewer-exp" },
      });
    nowMs = T0;
    await ledger.publish(draft(), { userAgent: GOOD_UA });
    nowMs = T0 + 3600 * 1000;
    await ledger.publish(draft(), { userAgent: GOOD_UA });
    nowMs = T0 + 2 * 3600 * 1000;
    await ledger.publish(draft(), {
      userAgent: GOOD_UA,
      actorTenantId: PUBLISHER,
    });
    const atOneHour = ledger.exposureWindow({
      ...input,
      observedAt: T0 + 3600 * 1000,
    });
    expect(atOneHour.impressions).toBe(2);
    expect(atOneHour.windowStartedAt).toBe(T0 + 3600 * 1000 - FREQUENCY_WINDOW_MS);
    expect(atOneHour.observedAt).toBe(T0 + 3600 * 1000);
    expect(atOneHour.viewerScopeRef).toBe("viewer-exp");
    nowMs = T0 + 25 * 3600 * 1000;
    await ledger.publish(draft(), { userAgent: GOOD_UA });
    const at25Hours = ledger.exposureWindow({
      ...input,
      observedAt: T0 + 25 * 3600 * 1000,
    });
    // In window: only the newest COUNTED row. The SELF row inside the
    // window never counts, and the boundary row at exactly
    // windowStartedAt is outside (strictly-after semantics).
    expect(at25Hours.impressions).toBe(1);
    expect(utcDayKey(nowMs)).toBe("20261105");
  });
});

/* ------------------------------- shape failures ------------------------------ */

describe("shape failures", () => {
  it("rejects malformed drafts with a typed error and appends nothing", async () => {
    seedLoop();
    await expect(
      ledger.publish({ ...organicImpression(), dedupeKey: "" }),
    ).rejects.toThrow(LedgerValidationError);
    await expect(
      ledger.publish({
        ...organicImpression(),
        type: "FYD_NOPE",
      } as unknown as FydObjectEventDraft),
    ).rejects.toThrow(LedgerValidationError);
    await expect(
      ledger.publish({
        ...organicImpression(),
        occurredAt: Number.NaN,
      }),
    ).rejects.toThrow(LedgerValidationError);
    expect(existsSync(join(dir, "ledger"))).toBe(false);
  });
});

/* -------------------------------- determinism -------------------------------- */

describe("determinism", () => {
  async function runScript(targetDir: string): Promise<string> {
    process.env.FYD_ADS_DIR = targetDir;
    let clock = T0;
    const scriptLedger = createAdsEventLedger({ now: () => clock });
    seedActiveCampaign();
    declareDemoSlot();
    grantDemoConsent();
    const decisionsDir = join(targetDir, "decisions");
    mkdirSync(decisionsDir, { recursive: true });
    writeFileSync(
      join(decisionsDir, "decision-001.json"),
      JSON.stringify(
        {
          decisionId: "decision-001",
          evaluatedAt: T0,
          surface: SURFACE,
          slotId: SLOT_ID,
          campaignId: CAMPAIGN_ID,
          authoritySnapshot: { decision: "allowed", grant: "ad.buy" },
          exposureWindow: { impressions: 0 },
          evaluation: { eligible: true, digest: "test-digest" },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    const first = sponsoredImpression({
      renderInstanceId: "det-1",
      occurredAt: T0,
    });
    await scriptLedger.publish(first, { userAgent: GOOD_UA });
    clock = T0 + 1000;
    await scriptLedger.publish(
      organicImpression({
        renderInstanceId: "det-2",
        objectId: "obj-det",
        occurredAt: T0 + 1000,
      }),
      { userAgent: GOOD_UA },
    );
    clock = T0 + 2000;
    await scriptLedger.publish(
      sponsoredAction({ renderInstanceId: "det-1", occurredAt: T0 + 2000 }),
      { userAgent: GOOD_UA },
    );
    clock = T0 + 3000;
    await scriptLedger.publish(
      organicImpression({
        renderInstanceId: "det-3",
        objectId: "obj-det",
        occurredAt: T0 + 3000,
      }),
      {},
    );
    clock = T0 + 4000;
    const again = await scriptLedger.publish(first, { userAgent: GOOD_UA });
    expect(again.receiptRef).toBe("ads-receipt:" + DAY + ":0");
    const report = scriptLedger.verifyChain();
    expect(report.ok).toBe(true);
    return readFileSync(join(targetDir, "ledger", DAY + ".jsonl"), "utf8");
  }

  it("produces byte-identical day files for an identical ingest sequence in a fresh directory", async () => {
    const dirA = mkdtempSync(join(tmpdir(), "fyd-ads-det-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "fyd-ads-det-b-"));
    const textA = await runScript(dirA);
    const textB = await runScript(dirB);
    expect(textA).toBe(textB);
    const lastHashA = JSON.parse(
      textA.trim().split("\n").slice(-1)[0],
    ).rowHash as string;
    const lastHashB = JSON.parse(
      textB.trim().split("\n").slice(-1)[0],
    ).rowHash as string;
    expect(lastHashA).toBe(lastHashB);
    expect(lastHashA).toMatch(/^[a-f0-9]{64}$/);
  });
});
