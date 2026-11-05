/**
 * Publisher opt-in flow logic for the FYD objects economic loop
 * (lane B5; DESIGN.md component F).
 *
 * This module is the server-side heart of the opt-in flow. The page
 * (src/app/sites/loop-demo/opt-in) renders state projected from here,
 * and the API route (src/app/api/fyd/ads/opt-in) executes commands
 * through here. Neither the page nor the route touches the inventory
 * store directly, and neither trusts client state: every read is a
 * fresh projection of the slot logs, and every write goes through
 * the B1 store command paths (declareSlot, grantConsent,
 * revokeConsent), which enforce the consent law fail-closed.
 *
 * Identity law (DESIGN.md security section): the acting publisher
 * tenant and the actor identity ref arrive here already resolved
 * server-side from the authenticated session (the route's resolver);
 * nothing in this module reads identity from request payload fields.
 * The slot's publisherTenantId is always the resolved actor tenant,
 * never a body field: a publisher can only declare and consent for
 * itself.
 *
 * Grant law: the disclosure text version the publisher accepted is
 * checked against the pinned current version BEFORE any write, so a
 * grant naming other words leaves the store untouched (the store
 * re-checks the same pin when it appends consent.granted). The
 * consent scope the route grants is the minimal covering scope: the
 * declared slot's own surface and kind.
 */

import { DISCLOSURE_TEXT_VERSION } from "./disclosure";
import { AdsStoreError } from "./event-log";
import {
  declareSlot,
  grantConsent,
  listSlots,
  readSlot,
  revokeConsent,
  type SlotKind,
  type SlotState,
} from "./inventory-store";

export type { SlotKind };

/* ------------------------------------------------------------------ */
/* Readback: current state, projected from the store only              */
/* ------------------------------------------------------------------ */

export type ConsentStatus = "active" | "revoked" | "never-granted";

/** One slot's opt-in state, as shown on the publisher opt-in page. */
export interface OptInSlotReadback {
  slotId: string;
  surface: string;
  slotKind: SlotKind;
  compositionCapacity: number;
  retired: boolean;
  consentStatus: ConsentStatus;
  /** The current consent's id; null when consent was never granted. */
  consentId: string | null;
  /**
   * The disclosure text version the current consent pins; null when
   * consent was never granted. This is what the publisher accepted,
   * read from the consent record, not assumed.
   */
  disclosureTextVersion: string | null;
  grantedAt: string | null;
  revokedAt: string | null;
}

/** The whole opt-in readback for one publisher tenant. */
export interface OptInReadback {
  publisherTenantId: string;
  /** The pinned disclosure version currently offered for consent. */
  disclosureTextVersion: string;
  slots: OptInSlotReadback[];
}

/** Project one slot's store state into its readback shape. */
export function slotReadback(state: SlotState): OptInSlotReadback {
  const consent = state.consent;
  return {
    slotId: state.slotId,
    surface: state.surface,
    slotKind: state.slotKind,
    compositionCapacity: state.compositionCapacity,
    retired: state.retired,
    consentStatus:
      consent === null
        ? "never-granted"
        : consent.revokedAt !== null
          ? "revoked"
          : "active",
    consentId: consent?.consentId ?? null,
    disclosureTextVersion: consent?.disclosureTextVersion ?? null,
    grantedAt: consent?.grantedAt ?? null,
    revokedAt: consent?.revokedAt ?? null,
  };
}

/**
 * The current opt-in state for one publisher, projected from the
 * store at call time. The page and the route's GET both render from
 * this and nothing else; there is no client-side copy to drift.
 */
export function readOptInState(publisherTenantId: string): OptInReadback {
  return {
    publisherTenantId,
    disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
    slots: listSlots(publisherTenantId).map(slotReadback),
  };
}

/* ------------------------------------------------------------------ */
/* Commands: grant and revoke, through the store command paths         */
/* ------------------------------------------------------------------ */

export interface GrantOptInCommand {
  /** Publisher tenant, resolved server-side from the session. */
  actorTenantId: string;
  /** Acting owner identity ref, resolved server-side. */
  actorIdentityRef: string;
  slotId: string;
  surface: string;
  slotKind: SlotKind;
  compositionCapacity: number;
  /** The disclosure version the publisher accepted on the page. */
  disclosureTextVersion: string;
  /** Server-minted when omitted. */
  consentId?: string;
  /** Command instant (ISO); default now. */
  at?: string;
}

/**
 * Grant placement consent: declare the slot first when it is new,
 * then grant consent for it, in the design's one flow. Fails closed
 * before any write when the accepted disclosure version is not the
 * pinned current version, and when an existing slot under this id
 * was declared with a different surface or kind (a declaration is
 * not silently re-purposed). A slot owned by another tenant surfaces
 * as the store's typed scope error.
 */
export function grantOptIn(cmd: GrantOptInCommand): SlotState {
  if (cmd.disclosureTextVersion !== DISCLOSURE_TEXT_VERSION) {
    throw new AdsStoreError(
      "Consent pins disclosure text version " +
        JSON.stringify(cmd.disclosureTextVersion) +
        "; the pinned current version is " +
        JSON.stringify(DISCLOSURE_TEXT_VERSION) +
        ".",
    );
  }
  const at = cmd.at ?? new Date().toISOString();
  let state = readSlot(cmd.slotId, cmd.actorTenantId);
  if (state === null) {
    state = declareSlot({
      actorTenantId: cmd.actorTenantId,
      slot: {
        slotId: cmd.slotId,
        publisherTenantId: cmd.actorTenantId,
        surface: cmd.surface,
        slotKind: cmd.slotKind,
        compositionCapacity: cmd.compositionCapacity,
      },
      at,
    });
  } else if (state.surface !== cmd.surface || state.slotKind !== cmd.slotKind) {
    throw new AdsStoreError(
      "Slot " +
        cmd.slotId +
        " is already declared with surface " +
        JSON.stringify(state.surface) +
        " and slotKind " +
        JSON.stringify(state.slotKind) +
        "; it cannot be re-declared as " +
        JSON.stringify(cmd.surface) +
        " / " +
        JSON.stringify(cmd.slotKind) +
        ".",
    );
  }
  const consentId =
    cmd.consentId ?? "consent-" + cmd.slotId + "-" + Date.parse(at).toString(36);
  return grantConsent({
    actorTenantId: cmd.actorTenantId,
    slotId: cmd.slotId,
    consent: {
      consentId,
      actorIdentityRef: cmd.actorIdentityRef,
      scope: { surfaces: [state.surface], slotKinds: [state.slotKind] },
      disclosureTextVersion: cmd.disclosureTextVersion,
      grantedAt: at,
    },
    at,
  });
}

export interface RevokeOptInCommand {
  /** Publisher tenant, resolved server-side from the session. */
  actorTenantId: string;
  /** Acting owner identity ref, resolved server-side. */
  actorIdentityRef: string;
  slotId: string;
  /** The current consent to revoke (from the readback). */
  consentId: string;
  /** Command instant (ISO); default now. */
  at?: string;
}

/**
 * Revoke the slot's current consent through the store. Takes effect
 * on the next composition because the matching provider reads
 * projections per request; no placement is delivered for the slot
 * from the revoke onward.
 */
export function revokeOptIn(cmd: RevokeOptInCommand): SlotState {
  const at = cmd.at ?? new Date().toISOString();
  return revokeConsent({
    actorTenantId: cmd.actorTenantId,
    slotId: cmd.slotId,
    consentId: cmd.consentId,
    actorIdentityRef: cmd.actorIdentityRef,
    revokedAt: at,
    at,
  });
}
