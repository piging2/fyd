/**
 * Campaign store for the FYD objects economic loop (lane B1;
 * DESIGN.md, BOOTSTRAP-SURGE-OBJECTS-LOOP-DESIGN-20261104).
 *
 * Append-only event log per campaign at data/fyd-ads/campaigns/
 * <campaignId>.json on the shared ads event-log machinery (the
 * owner-store pattern). State is a pure projection over the log.
 * Commands fail closed: unknown ids, malformed commands, illegal
 * lifecycle transitions, and actors other than the campaign's payer
 * are rejected with a typed error and nothing is written.
 *
 * The projection maps 1:1 onto SponsoredPlacement in
 * src/fyd/rank/sponsored-placement.ts; that contract is consumed
 * unchanged. One mapping note: SponsoredPlacement.campaignStatus has
 * no "created" value, so a created-but-never-activated campaign
 * projects to "paused" for placement purposes. The evaluator rejects
 * anything not "active" (inactive-campaign), so a created campaign
 * can never render before activation. This is deliberate fail-closed
 * behavior, not a lost state: CampaignState.status keeps "created".
 */

import type { SponsoredPlacement } from "../rank/sponsored-placement";
import {
  AdsStoreError,
  AdsTenantScopeError,
  appendAdsEvent,
  assertAdsEntityId,
  listAdsEntityIds,
  readAdsEvents,
  requireText,
  type AdsEvent,
} from "./event-log";

export const CAMPAIGN_ENTITY_KIND = "campaign";
const CAMPAIGNS_SUBDIR = "campaigns";

export type CampaignStatus = "created" | "active" | "paused" | "ended";

export interface CampaignBudgetScope {
  /** Counted-impression cap per window (a count, not money). */
  impressionsCap: number;
  /** Counted-click cap per window (a count, not money). */
  clicksCap: number;
  /** Accounting window in milliseconds. */
  windowMs: number;
}

export interface CampaignTargeting {
  kind: SponsoredPlacement["targeting"]["kind"];
  sourceRef: string;
}

export interface CampaignCreatedPayload {
  campaignId: string;
  payerId: string;
  sponsorDisplayName: string;
  objectId: string;
  disclosure: "Sponsored";
  reason: string;
  targeting: CampaignTargeting;
  surfaces: string[];
  /** Epoch ms; the SponsoredPlacement window fields are epoch ms. */
  startsAt: number;
  endsAt: number;
  docRef: string;
  budgetScope: CampaignBudgetScope;
}

export interface CampaignState extends CampaignCreatedPayload {
  status: CampaignStatus;
}

const TARGETING_KINDS: readonly string[] = [
  "category",
  "location",
  "query",
  "relationship",
  "surface",
];

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function validateCreatedPayload(p: CampaignCreatedPayload): void {
  assertAdsEntityId("campaign", p.campaignId);
  requireText("payerId", p.payerId);
  requireText("sponsorDisplayName", p.sponsorDisplayName);
  requireText("objectId", p.objectId);
  if (p.disclosure !== "Sponsored") {
    throw new AdsStoreError("Campaign disclosure must be the literal \"Sponsored\".");
  }
  requireText("reason", p.reason);
  if (!p.targeting || !TARGETING_KINDS.includes(p.targeting.kind)) {
    throw new AdsStoreError("Invalid campaign targeting kind.");
  }
  requireText("targeting.sourceRef", p.targeting.sourceRef);
  if (
    !Array.isArray(p.surfaces) ||
    p.surfaces.length === 0 ||
    !p.surfaces.every((s) => typeof s === "string" && s.trim().length > 0)
  ) {
    throw new AdsStoreError("Campaign surfaces must be a non-empty list of names.");
  }
  if (!Number.isFinite(p.startsAt) || !Number.isFinite(p.endsAt) || p.endsAt <= p.startsAt) {
    throw new AdsStoreError("Campaign window is invalid (endsAt must exceed startsAt).");
  }
  requireText("docRef", p.docRef);
  if (
    !p.budgetScope ||
    !isPositiveInt(p.budgetScope.impressionsCap) ||
    !isPositiveInt(p.budgetScope.clicksCap) ||
    !isPositiveInt(p.budgetScope.windowMs)
  ) {
    throw new AdsStoreError("Campaign budgetScope caps and window must be positive integers.");
  }
}

/**
 * Pure projection: fold a campaign log into current state. The same
 * log always produces the same state. Unknown event types fail closed
 * (throw) rather than being silently skipped.
 */
export function projectCampaign(events: readonly AdsEvent[]): CampaignState | null {
  let state: CampaignState | null = null;
  for (const event of events) {
    switch (event.type) {
      case "campaign.created": {
        if (state !== null) {
          throw new AdsStoreError("Campaign log contains a second campaign.created event.");
        }
        const p = event.payload as unknown as CampaignCreatedPayload;
        validateCreatedPayload(p);
        state = { ...p, status: "created" };
        break;
      }
      // The non-null state is captured into a const after each
      // guard: spreading the loop-carried `state` directly trips a
      // TS control-flow limitation (TS2698) once this module is
      // typechecked in the app program. Semantics are unchanged.
      case "campaign.activated": {
        if (state === null) throw new AdsStoreError("campaign.activated before campaign.created.");
        const current: CampaignState = state;
        state = { ...current, status: "active" };
        break;
      }
      case "campaign.paused": {
        if (state === null) throw new AdsStoreError("campaign.paused before campaign.created.");
        const current: CampaignState = state;
        state = { ...current, status: "paused" };
        break;
      }
      case "campaign.ended": {
        if (state === null) throw new AdsStoreError("campaign.ended before campaign.created.");
        const current: CampaignState = state;
        state = { ...current, status: "ended" };
        break;
      }
      default:
        throw new AdsStoreError("Unknown campaign event type: " + event.type);
    }
  }
  return state;
}

function readCampaignState(campaignId: string): CampaignState | null {
  return projectCampaign(readAdsEvents(CAMPAIGNS_SUBDIR, CAMPAIGN_ENTITY_KIND, campaignId));
}

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

function requirePayerActor(state: CampaignState, actorTenantId: string): void {
  if (actorTenantId !== state.payerId) {
    throw new AdsTenantScopeError(CAMPAIGN_ENTITY_KIND, state.campaignId, actorTenantId);
  }
}

export interface CreateCampaignCommand {
  /** Tenant scope resolved from the authenticated identity, never payload. */
  actorTenantId: string;
  campaign: CampaignCreatedPayload;
  at?: string;
}

/**
 * Create a campaign through the store's own append path. The actor
 * must be the campaign's payer. Returns the projected state.
 */
export function createCampaign(cmd: CreateCampaignCommand): CampaignState {
  validateCreatedPayload(cmd.campaign);
  if (cmd.actorTenantId !== cmd.campaign.payerId) {
    throw new AdsTenantScopeError(CAMPAIGN_ENTITY_KIND, cmd.campaign.campaignId, cmd.actorTenantId);
  }
  if (readCampaignState(cmd.campaign.campaignId) !== null) {
    throw new AdsStoreError("Campaign already exists: " + cmd.campaign.campaignId);
  }
  appendAdsEvent(CAMPAIGNS_SUBDIR, CAMPAIGN_ENTITY_KIND, cmd.campaign.campaignId, {
    at: nowIso(cmd.at),
    type: "campaign.created",
    payload: { ...cmd.campaign } as unknown as Record<string, unknown>,
  });
  const state = readCampaignState(cmd.campaign.campaignId);
  if (state === null) throw new AdsStoreError("Campaign vanished after create.");
  return state;
}

export interface CampaignLifecycleCommand {
  actorTenantId: string;
  campaignId: string;
  at?: string;
}

function transition(
  cmd: CampaignLifecycleCommand,
  type: "campaign.activated" | "campaign.paused" | "campaign.ended",
  from: readonly CampaignStatus[],
): CampaignState {
  const state = readCampaignState(cmd.campaignId);
  if (state === null) {
    throw new AdsStoreError("Unknown campaign: " + cmd.campaignId);
  }
  requirePayerActor(state, cmd.actorTenantId);
  if (!from.includes(state.status)) {
    throw new AdsStoreError(
      "Cannot apply " + type + " to a campaign in status " + state.status + ".",
    );
  }
  appendAdsEvent(CAMPAIGNS_SUBDIR, CAMPAIGN_ENTITY_KIND, cmd.campaignId, {
    at: nowIso(cmd.at),
    type,
    payload: { campaignId: cmd.campaignId },
  });
  const next = readCampaignState(cmd.campaignId);
  if (next === null) throw new AdsStoreError("Campaign vanished after " + type + ".");
  return next;
}

/** created or paused -> active. */
export function activateCampaign(cmd: CampaignLifecycleCommand): CampaignState {
  return transition(cmd, "campaign.activated", ["created", "paused"]);
}

/** active -> paused. */
export function pauseCampaign(cmd: CampaignLifecycleCommand): CampaignState {
  return transition(cmd, "campaign.paused", ["active"]);
}

/** created, active, or paused -> ended. Ended is terminal. */
export function endCampaign(cmd: CampaignLifecycleCommand): CampaignState {
  return transition(cmd, "campaign.ended", ["created", "active", "paused"]);
}

/**
 * Read one campaign scoped to a tenant. Unknown id yields null; a
 * campaign owned by another tenant is a typed scope error.
 */
export function readCampaign(campaignId: string, tenantScope: string): CampaignState | null {
  const state = readCampaignState(campaignId);
  if (state === null) return null;
  if (state.payerId !== tenantScope) {
    throw new AdsTenantScopeError(CAMPAIGN_ENTITY_KIND, campaignId, tenantScope);
  }
  return state;
}

/** All campaigns owned by the tenant scope, sorted by campaignId. */
export function listCampaigns(tenantScope: string): CampaignState[] {
  const out: CampaignState[] = [];
  for (const id of listAdsEntityIds(CAMPAIGNS_SUBDIR)) {
    const state = readCampaignState(id);
    if (state !== null && state.payerId === tenantScope) out.push(state);
  }
  return out.sort((a, b) => (a.campaignId < b.campaignId ? -1 : 1));
}

/**
 * Map a campaign projection onto the rank contract's SponsoredPlacement
 * for one declared surface. A surface the campaign does not name is a
 * fail-closed error. See the module header for the created -> "paused"
 * status mapping.
 */
export function toSponsoredPlacement(state: CampaignState, surface: string): SponsoredPlacement {
  if (!state.surfaces.includes(surface)) {
    throw new AdsStoreError(
      "Campaign " + state.campaignId + " does not name surface " + JSON.stringify(surface) + ".",
    );
  }
  return {
    placementId: "placement:" + state.campaignId + ":" + surface,
    objectId: state.objectId,
    campaignId: state.campaignId,
    payerId: state.payerId,
    sponsorDisplayName: state.sponsorDisplayName,
    disclosure: state.disclosure,
    reason: state.reason,
    targeting: state.targeting,
    surface,
    campaignStatus: state.status === "created" ? "paused" : state.status,
    startsAt: state.startsAt,
    endsAt: state.endsAt,
  };
}
