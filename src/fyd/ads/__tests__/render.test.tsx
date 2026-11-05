/**
 * B4 render-wiring tests: the loop render seam and the composition
 * render through the existing ObjectCard presentation path.
 *
 * - Flag OFF: the provider is never invoked (no decision records),
 *   and the rendered HTML is byte-identical to the unwired render
 *   (bare ObjectCards, no display context).
 * - Flag ON + eligible: the sponsored card renders WITH the
 *   existing disclosure chip and mounts the collector.
 * - Flag ON + no consent: organic-only, byte-identical to flag OFF.
 * - Flag ON + another tenant: the provider is never invoked.
 *
 * Seeds go through the B1 stores' own command paths; projections
 * come from the real ping-fyd verified public projection through
 * the canonical view loaders, exactly as the surface page builds
 * them.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { getVerifiedPublicProjectionSync } from "../../data/ping-object-source";
import { loadObjectViewById } from "../../object/by-id";
import {
  objectViewToProjection,
  type ObjectProjection,
} from "../../object/object-projection";
import { ObjectCard } from "../../object/card";
import {
  explainCandidateRank,
  type RankedCandidate,
} from "../../rank/object-ranker";
import {
  activateCampaign,
  createCampaign,
  type CampaignCreatedPayload,
} from "../campaign-store";
import { listPlacementDecisionIds } from "../decision-store";
import { DISCLOSURE_TEXT_VERSION } from "../disclosure";
import { declareSlot, grantConsent } from "../inventory-store";
import { LoopComposition, type LoopCompositionEntry } from "../loop-composition";
import {
  BUDGET_WINDOW_MS,
  DAILY_CLICKS_CAP,
  DAILY_IMPRESSIONS_CAP,
} from "../policy";
import {
  composeLoopSurfaceComposition,
  type LoopSurfaceComposition,
} from "../render";

const PAYER = "ping-fyd";
const PUBLISHER = "loop-demo";
const SURFACE = "loop-demo";
const OBJECT_ID = "ping-fyd-business";
const ORGANIC_IDS = [
  "ping-fyd-svc-calls",
  "ping-fyd-svc-followup",
  "ping-fyd-svc-scheduling",
];
const SLOT_ID = "slot-loop-demo-main";
const CAMPAIGN_ID = "ping-house-001";
const VIEWER = "viewer-scope-1";
const FLAG_ON = { FYD_ADS_LOOP_ENABLED: "1" } as const;
const FLAG_OFF = {} as const;

let now = Date.now();

beforeEach(() => {
  now = Date.now();
  process.env.FYD_ADS_DIR = mkdtempSync(join(tmpdir(), "fyd-ads-b4-render-"));
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-owner-b4-"));
});

afterEach(() => {
  delete process.env.FYD_ADS_DIR;
  delete process.env.FYD_OWNER_DIR;
});

function campaignPayload(): CampaignCreatedPayload {
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
        grantedAt: new Date(now).toISOString(),
      },
    });
  }
}

function seedActiveCampaign(): void {
  createCampaign({ actorTenantId: PAYER, campaign: campaignPayload() });
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

function standardCandidates(): RankedCandidate[] {
  return [...ORGANIC_IDS.map(candidate), candidate(OBJECT_ID)];
}

let idCounter = 0;
function mintId(): string {
  idCounter += 1;
  return "test-id-" + idCounter;
}

function compose(
  env: Readonly<Record<string, string | undefined>>,
  overrides: Record<string, unknown> = {},
): LoopSurfaceComposition {
  idCounter = 0;
  return composeLoopSurfaceComposition({
    publisherTenantId: PUBLISHER,
    surface: SURFACE,
    viewerScopeRef: VIEWER,
    candidates: standardCandidates(),
    limit: 12,
    now,
    env,
    mintId,
    ...overrides,
  });
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

function entriesFor(composition: LoopSurfaceComposition): LoopCompositionEntry[] {
  return composition.items.map((item) => ({
    item,
    projection: projectionFor(item.objectId),
  }));
}

/** The unwired render: bare cards in composition order, no context. */
function unwiredHtml(composition: LoopSurfaceComposition): string {
  return renderToString(
    <>
      {composition.items.map((item) => (
        <ObjectCard key={item.objectId} projection={projectionFor(item.objectId)} />
      ))}
    </>,
  );
}

describe("flag off", () => {
  it("never invokes the provider and renders byte-identical to the unwired render", () => {
    seedSlot(true);
    seedActiveCampaign();
    const composition = compose(FLAG_OFF);
    expect(composition.providerInvoked).toBe(false);
    expect(composition.sponsored).toBeNull();
    expect(composition.items.every((i) => i.sponsorship === null)).toBe(true);
    expect(composition.items.every((i) => i.eventContext === null)).toBe(true);
    expect(composition.items.every((i) => i.displayContext === null)).toBe(true);
    // The provider writes a decision record per evaluation; none exist.
    expect(listPlacementDecisionIds()).toEqual([]);
    const html = renderToString(<LoopComposition entries={entriesFor(composition)} />);
    expect(html).toBe(unwiredHtml(composition));
    expect(html).not.toContain("Sponsored");
    expect(html).not.toContain("data-fyd-ads-collector");
  });
});

describe("flag on", () => {
  it("renders the eligible placement through the card with the disclosure chip and the collector", () => {
    seedSlot(true);
    seedActiveCampaign();
    const composition = compose(FLAG_ON);
    expect(composition.providerInvoked).toBe(true);
    expect(composition.sponsored).not.toBeNull();
    expect(composition.sponsored?.placement.objectId).toBe(OBJECT_ID);
    expect(composition.sponsored?.decisionId).toBeTruthy();
    expect(listPlacementDecisionIds().length).toBeGreaterThan(0);
    const sponsoredItem = composition.items.find((i) => i.sponsorship !== null);
    expect(sponsoredItem?.decisionId).toBe(composition.sponsored?.decisionId);
    expect(sponsoredItem?.eventContext?.sponsorship?.placementId).toBe(
      composition.sponsored?.placement.placementId,
    );
    expect(sponsoredItem?.eventContext?.renderInstanceId).toBeTruthy();
    const html = renderToString(<LoopComposition entries={entriesFor(composition)} />);
    expect(html).toContain("data-fyd-sponsored");
    expect(html).toContain("Sponsored");
    expect(html).toContain("data-fyd-ads-collector");
  });

  it("without consent renders organic-only, byte-identical to the flag-off render", () => {
    seedSlot(false);
    seedActiveCampaign();
    const onComposition = compose(FLAG_ON);
    expect(onComposition.providerInvoked).toBe(true);
    expect(onComposition.sponsored).toBeNull();
    const onHtml = renderToString(
      <LoopComposition entries={entriesFor(onComposition)} />,
    );
    const offComposition = compose(FLAG_OFF);
    const offHtml = renderToString(
      <LoopComposition entries={entriesFor(offComposition)} />,
    );
    expect(onHtml).toBe(offHtml);
    expect(onHtml).toBe(unwiredHtml(onComposition));
    expect(onHtml).not.toContain("data-fyd-ads-collector");
  });

  it("never invokes the provider for another tenant or surface", () => {
    seedSlot(true);
    seedActiveCampaign();
    const otherTenant = compose(FLAG_ON, { publisherTenantId: "happy-place" });
    expect(otherTenant.providerInvoked).toBe(false);
    expect(otherTenant.sponsored).toBeNull();
    const otherSurface = compose(FLAG_ON, { surface: "happy-place" });
    expect(otherSurface.providerInvoked).toBe(false);
    expect(otherSurface.sponsored).toBeNull();
    expect(listPlacementDecisionIds()).toEqual([]);
  });
});
