/**
 * Inventory + consent store for the FYD objects economic loop (lane B1;
 * DESIGN.md, BOOTSTRAP-SURGE-OBJECTS-LOOP-DESIGN-20261104).
 *
 * One append-only log per slot at data/fyd-ads/slots/<slotId>.json on
 * the shared ads event-log machinery (the owner-store pattern). The log
 * carries two event families: the slot's own lifecycle (slot.declared,
 * slot.retired) and its consent record (consent.granted,
 * consent.revoked). A slot exists only because its publisher declared
 * it; the registry read model is a pure projection over all slot logs.
 *
 * Consent law (design): consent is ACTIVE iff it is granted, not
 * revoked, and the slot is not retired. A grant pins the disclosure
 * text version it accepted (disclosure.ts); a grant naming any other
 * version, or a scope that does not cover the slot's surface and kind,
 * fails closed. Commands and reads are tenant-scoped from the caller's
 * resolved identity, never from payload fields; cross-tenant access is
 * a typed error.
 */

import { DISCLOSURE_TEXT_VERSION } from "./disclosure";
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

export const SLOT_ENTITY_KIND = "slot";
const SLOTS_SUBDIR = "slots";

export type SlotKind = "portal-object" | "object-context";

export interface SlotDeclaredPayload {
  slotId: string;
  publisherTenantId: string;
  surface: string;
  slotKind: SlotKind;
  compositionCapacity: number;
}

export interface ConsentScope {
  surfaces: string[];
  slotKinds: SlotKind[];
}

export interface ConsentGrantedPayload {
  consentId: string;
  slotId: string;
  publisherTenantId: string;
  actorIdentityRef: string;
  scope: ConsentScope;
  disclosureTextVersion: string;
  grantedAt: string;
}

export interface ConsentRevokedPayload {
  consentId: string;
  revokedAt: string;
  actorIdentityRef: string;
}

export interface ConsentState extends ConsentGrantedPayload {
  revokedAt: string | null;
  revokeActorIdentityRef: string | null;
}

export interface SlotState extends SlotDeclaredPayload {
  retired: boolean;
  consent: ConsentState | null;
  /**
   * Derived, never stored: granted and not revoked and the slot is not
   * retired (the design's consent law). Computed by the projection.
   */
  consentActive: boolean;
}

const SLOT_KINDS: readonly string[] = ["portal-object", "object-context"];

function validateDeclaredPayload(p: SlotDeclaredPayload): void {
  assertAdsEntityId("slot", p.slotId);
  requireText("publisherTenantId", p.publisherTenantId);
  requireText("surface", p.surface);
  if (!SLOT_KINDS.includes(p.slotKind)) {
    throw new AdsStoreError("Invalid slotKind: " + JSON.stringify(p.slotKind));
  }
  if (!Number.isInteger(p.compositionCapacity) || p.compositionCapacity <= 0) {
    throw new AdsStoreError("compositionCapacity must be a positive integer.");
  }
}

function deriveConsentActive(slot: Omit<SlotState, "consentActive">): boolean {
  return slot.consent !== null && slot.consent.revokedAt === null && !slot.retired;
}

/**
 * Pure projection: fold a slot log (slot + consent events) into current
 * state. The same log always produces the same state. Unknown event
 * types fail closed (throw).
 */
export function projectSlot(events: readonly AdsEvent[]): SlotState | null {
  let base: Omit<SlotState, "consentActive"> | null = null;
  for (const event of events) {
    switch (event.type) {
      case "slot.declared": {
        if (base !== null) {
          throw new AdsStoreError("Slot log contains a second slot.declared event.");
        }
        const p = event.payload as unknown as SlotDeclaredPayload;
        validateDeclaredPayload(p);
        base = { ...p, retired: false, consent: null };
        break;
      }
      // The non-null state is captured into consts after each
      // guard: spreading the loop-carried `base` directly trips a
      // TS control-flow limitation (TS2698) once this module is
      // typechecked in the app program. Semantics are unchanged.
      case "slot.retired": {
        if (base === null) throw new AdsStoreError("slot.retired before slot.declared.");
        const current: Omit<SlotState, "consentActive"> = base;
        base = { ...current, retired: true };
        break;
      }
      case "consent.granted": {
        if (base === null) throw new AdsStoreError("consent.granted before slot.declared.");
        const p = event.payload as unknown as ConsentGrantedPayload;
        const current: Omit<SlotState, "consentActive"> = base;
        base = {
          ...current,
          consent: { ...p, revokedAt: null, revokeActorIdentityRef: null },
        };
        break;
      }
      case "consent.revoked": {
        if (base === null) throw new AdsStoreError("consent.revoked before slot.declared.");
        const p = event.payload as unknown as ConsentRevokedPayload;
        const current: Omit<SlotState, "consentActive"> = base;
        const consent = current.consent;
        if (consent === null || consent.consentId !== p.consentId) {
          throw new AdsStoreError("consent.revoked names a consent that is not current.");
        }
        base = {
          ...current,
          consent: {
            ...consent,
            revokedAt: p.revokedAt,
            revokeActorIdentityRef: p.actorIdentityRef,
          },
        };
        break;
      }
      default:
        throw new AdsStoreError("Unknown slot event type: " + event.type);
    }
  }
  if (base === null) return null;
  return { ...base, consentActive: deriveConsentActive(base) };
}

function readSlotState(slotId: string): SlotState | null {
  return projectSlot(readAdsEvents(SLOTS_SUBDIR, SLOT_ENTITY_KIND, slotId));
}

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

function requirePublisherActor(state: SlotState, actorTenantId: string): void {
  if (actorTenantId !== state.publisherTenantId) {
    throw new AdsTenantScopeError(SLOT_ENTITY_KIND, state.slotId, actorTenantId);
  }
}

export interface DeclareSlotCommand {
  actorTenantId: string;
  slot: SlotDeclaredPayload;
  at?: string;
}

/** Declare a slot. The actor must be the slot's publisher tenant. */
export function declareSlot(cmd: DeclareSlotCommand): SlotState {
  validateDeclaredPayload(cmd.slot);
  if (cmd.actorTenantId !== cmd.slot.publisherTenantId) {
    throw new AdsTenantScopeError(SLOT_ENTITY_KIND, cmd.slot.slotId, cmd.actorTenantId);
  }
  if (readSlotState(cmd.slot.slotId) !== null) {
    throw new AdsStoreError("Slot already exists: " + cmd.slot.slotId);
  }
  appendAdsEvent(SLOTS_SUBDIR, SLOT_ENTITY_KIND, cmd.slot.slotId, {
    at: nowIso(cmd.at),
    type: "slot.declared",
    payload: { ...cmd.slot } as unknown as Record<string, unknown>,
  });
  const state = readSlotState(cmd.slot.slotId);
  if (state === null) throw new AdsStoreError("Slot vanished after declare.");
  return state;
}

export interface SlotLifecycleCommand {
  actorTenantId: string;
  slotId: string;
  at?: string;
}

/** Retire a slot. Retirement also ends any active consent (derived). */
export function retireSlot(cmd: SlotLifecycleCommand): SlotState {
  const state = readSlotState(cmd.slotId);
  if (state === null) throw new AdsStoreError("Unknown slot: " + cmd.slotId);
  requirePublisherActor(state, cmd.actorTenantId);
  if (state.retired) throw new AdsStoreError("Slot is already retired: " + cmd.slotId);
  appendAdsEvent(SLOTS_SUBDIR, SLOT_ENTITY_KIND, cmd.slotId, {
    at: nowIso(cmd.at),
    type: "slot.retired",
    payload: { slotId: cmd.slotId },
  });
  const next = readSlotState(cmd.slotId);
  if (next === null) throw new AdsStoreError("Slot vanished after retire.");
  return next;
}

export interface GrantConsentCommand {
  actorTenantId: string;
  slotId: string;
  consent: Omit<ConsentGrantedPayload, "slotId" | "publisherTenantId">;
  at?: string;
}

/**
 * Grant placement consent for a slot. Fails closed unless: the slot
 * exists and is not retired; the actor is the slot's publisher; the
 * disclosure text version is the pinned current version; the scope
 * covers the slot's surface and kind; and no consent is currently
 * active for the slot (revoke first, then re-grant under a new
 * consentId).
 */
export function grantConsent(cmd: GrantConsentCommand): SlotState {
  const state = readSlotState(cmd.slotId);
  if (state === null) throw new AdsStoreError("Unknown slot: " + cmd.slotId);
  requirePublisherActor(state, cmd.actorTenantId);
  if (state.retired) throw new AdsStoreError("Cannot grant consent on a retired slot.");
  if (state.consentActive) {
    throw new AdsStoreError("Slot already has an active consent; revoke it before re-granting.");
  }
  const p = cmd.consent;
  assertAdsEntityId("consent", p.consentId);
  requireText("actorIdentityRef", p.actorIdentityRef);
  if (p.disclosureTextVersion !== DISCLOSURE_TEXT_VERSION) {
    throw new AdsStoreError(
      "Consent pins disclosure text version " + JSON.stringify(p.disclosureTextVersion) +
        "; the pinned current version is " + JSON.stringify(DISCLOSURE_TEXT_VERSION) + ".",
    );
  }
  if (
    !p.scope ||
    !Array.isArray(p.scope.surfaces) ||
    !Array.isArray(p.scope.slotKinds) ||
    !p.scope.surfaces.includes(state.surface) ||
    !p.scope.slotKinds.includes(state.slotKind)
  ) {
    throw new AdsStoreError("Consent scope must cover the slot's surface and slotKind.");
  }
  if (Number.isNaN(Date.parse(p.grantedAt))) {
    throw new AdsStoreError("Invalid grantedAt timestamp.");
  }
  const payload: ConsentGrantedPayload = {
    ...p,
    slotId: cmd.slotId,
    publisherTenantId: state.publisherTenantId,
  };
  appendAdsEvent(SLOTS_SUBDIR, SLOT_ENTITY_KIND, cmd.slotId, {
    at: nowIso(cmd.at),
    type: "consent.granted",
    payload: payload as unknown as Record<string, unknown>,
  });
  const next = readSlotState(cmd.slotId);
  if (next === null) throw new AdsStoreError("Slot vanished after consent grant.");
  return next;
}

export interface RevokeConsentCommand {
  actorTenantId: string;
  slotId: string;
  consentId: string;
  actorIdentityRef: string;
  revokedAt: string;
  at?: string;
}

/**
 * Revoke the slot's current consent. Takes effect on the next
 * composition because providers read projections per request.
 */
export function revokeConsent(cmd: RevokeConsentCommand): SlotState {
  const state = readSlotState(cmd.slotId);
  if (state === null) throw new AdsStoreError("Unknown slot: " + cmd.slotId);
  requirePublisherActor(state, cmd.actorTenantId);
  if (state.consent === null || state.consent.consentId !== cmd.consentId) {
    throw new AdsStoreError("No current consent with id " + cmd.consentId + " on slot " + cmd.slotId + ".");
  }
  if (state.consent.revokedAt !== null) {
    throw new AdsStoreError("Consent is already revoked: " + cmd.consentId);
  }
  requireText("actorIdentityRef", cmd.actorIdentityRef);
  if (Number.isNaN(Date.parse(cmd.revokedAt))) {
    throw new AdsStoreError("Invalid revokedAt timestamp.");
  }
  const payload: ConsentRevokedPayload = {
    consentId: cmd.consentId,
    revokedAt: cmd.revokedAt,
    actorIdentityRef: cmd.actorIdentityRef,
  };
  appendAdsEvent(SLOTS_SUBDIR, SLOT_ENTITY_KIND, cmd.slotId, {
    at: nowIso(cmd.at),
    type: "consent.revoked",
    payload: payload as unknown as Record<string, unknown>,
  });
  const next = readSlotState(cmd.slotId);
  if (next === null) throw new AdsStoreError("Slot vanished after consent revoke.");
  return next;
}

/**
 * Read one slot scoped to a tenant. Unknown id yields null; a slot
 * owned by another tenant is a typed scope error.
 */
export function readSlot(slotId: string, tenantScope: string): SlotState | null {
  const state = readSlotState(slotId);
  if (state === null) return null;
  if (state.publisherTenantId !== tenantScope) {
    throw new AdsTenantScopeError(SLOT_ENTITY_KIND, slotId, tenantScope);
  }
  return state;
}

/**
 * The inventory registry read model for one publisher: a projection
 * over all slot logs, scoped to the tenant, sorted by slotId.
 */
export function listSlots(tenantScope: string): SlotState[] {
  const out: SlotState[] = [];
  for (const id of listAdsEntityIds(SLOTS_SUBDIR)) {
    const state = readSlotState(id);
    if (state !== null && state.publisherTenantId === tenantScope) out.push(state);
  }
  return out.sort((a, b) => (a.slotId < b.slotId ? -1 : 1));
}
