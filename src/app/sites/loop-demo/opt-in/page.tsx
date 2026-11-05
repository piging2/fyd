export const dynamic = "force-dynamic";

/**
 * FYD objects economic loop: the loop-demo publisher opt-in page
 * (lane B5; DESIGN.md component F).
 *
 * This is the controlled publisher's owner surface for placement
 * consent. The publisher tenant of record is loop-demo (policy.ts
 * LOOP_PUBLISHER_TENANT_ID): a demo tenant PING operates end to
 * end, NOT a real business and NOT Coppersmith (receive-only,
 * untouched).
 *
 * Page law:
 * - The whole sponsored path sits behind the loop enable flag; with
 *   the flag OFF (the default) this page renders only the disabled
 *   notice and reads nothing from the store.
 * - With the flag ON, the page shows the pinned disclosure copy
 *   VERBATIM with its version (disclosure.ts; the consent record
 *   pins this version, and the store fails closed on any other),
 *   and the publisher's current state projected from the inventory
 *   store at render time by readOptInState: slots declared or not,
 *   consent active / revoked / never granted, the disclosure
 *   version the current consent pins. Nothing shown comes from
 *   client state.
 * - Actions (declare + grant, revoke) are executed by the controls
 *   through POST /api/fyd/ads/opt-in, which resolves the publisher
 *   identity server-side from the session and writes only through
 *   the store command paths; after a successful command the page
 *   reloads and re-projects from the store.
 */

import { DISCLOSURE_TEXT, DISCLOSURE_TEXT_VERSION } from "@/fyd/ads/disclosure";
import { readOptInState, type OptInSlotReadback } from "@/fyd/ads/opt-in";
import { OptInControls } from "@/fyd/ads/opt-in-client";
import {
  isAdsLoopEnabled,
  LOOP_PUBLISHER_TENANT_ID,
  LOOP_SURFACE,
} from "@/fyd/ads/policy";

const DEFAULT_SLOT_ID = "slot-loop-demo-main";

function SlotStateSection({ slot }: { slot: OptInSlotReadback }) {
  return (
    <section>
      <h3>Slot {slot.slotId}</h3>
      <dl>
        <dt>Surface</dt>
        <dd>{slot.surface}</dd>
        <dt>Slot kind</dt>
        <dd>{slot.slotKind}</dd>
        <dt>Composition capacity</dt>
        <dd>{slot.compositionCapacity}</dd>
        <dt>Retired</dt>
        <dd>{slot.retired ? "yes" : "no"}</dd>
        <dt>Consent status</dt>
        <dd>{slot.consentStatus}</dd>
        <dt>Consent id</dt>
        <dd>{slot.consentId ?? "none"}</dd>
        <dt>Disclosure version consented to</dt>
        <dd>{slot.disclosureTextVersion ?? "none"}</dd>
        <dt>Granted at</dt>
        <dd>{slot.grantedAt ?? "never"}</dd>
        <dt>Revoked at</dt>
        <dd>{slot.revokedAt ?? "not revoked"}</dd>
      </dl>
    </section>
  );
}

export default function LoopDemoOptInPage() {
  if (!isAdsLoopEnabled()) {
    return (
      <main>
        <h1>Placement opt-in</h1>
        <p>The FYD placements loop is not enabled.</p>
      </main>
    );
  }
  const state = readOptInState(LOOP_PUBLISHER_TENANT_ID);
  return (
    <main>
      <h1>Placement opt-in for {LOOP_PUBLISHER_TENANT_ID}</h1>
      <section>
        <h2>What you are consenting to</h2>
        <blockquote>{DISCLOSURE_TEXT}</blockquote>
        <p>Disclosure version: {DISCLOSURE_TEXT_VERSION}</p>
        <p>
          Sponsored placements are advertising. Every placement is
          labeled Sponsored, impressions and clicks are recorded in
          the FYD event ledger, and revoking consent stops delivery
          immediately.
        </p>
      </section>
      <section>
        <h2>Current state (from the placement store)</h2>
        {state.slots.length === 0 ? (
          <p>No placement slot has been declared yet.</p>
        ) : (
          state.slots.map((slot) => (
            <SlotStateSection key={slot.slotId} slot={slot} />
          ))
        )}
      </section>
      <OptInControls
        disclosureTextVersion={DISCLOSURE_TEXT_VERSION}
        defaultSurface={LOOP_SURFACE}
        defaultSlotId={DEFAULT_SLOT_ID}
        slots={state.slots}
      />
    </main>
  );
}
