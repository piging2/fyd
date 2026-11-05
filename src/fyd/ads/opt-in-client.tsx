"use client";

/**
 * Publisher opt-in controls (lane B5; DESIGN.md component F).
 *
 * The interactive half of the opt-in page: the slot declaration and
 * consent grant form, and one revoke action per active consent.
 * This component holds NO state authority: it posts commands to
 * /api/fyd/ads/opt-in, where the publisher identity is resolved
 * server-side and the writes go through the store command paths,
 * and on success it reloads the page so the state shown is
 * re-projected from the store by the server component. The
 * disclosure version submitted with a grant is the pinned version
 * the page rendered verbatim above this form, so the consent record
 * pins exactly the words the publisher saw.
 */

import * as React from "react";
import type { OptInSlotReadback } from "./opt-in";

export interface OptInControlsProps {
  /** The pinned disclosure version rendered verbatim on the page. */
  disclosureTextVersion: string;
  /** The loop surface this publisher declares slots on. */
  defaultSurface: string;
  /** Suggested slot id for a first declaration. */
  defaultSlotId: string;
  /** Current slots, projected from the store by the server page. */
  slots: OptInSlotReadback[];
}

interface PostResult {
  ok: boolean;
  message: string;
}

async function postOptIn(body: Record<string, unknown>): Promise<PostResult> {
  try {
    const response = await fetch("/api/fyd/ads/opt-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as {
      ok?: boolean;
      code?: string;
      message?: string;
    } | null;
    if (response.ok && json?.ok) return { ok: true, message: "Recorded." };
    return {
      ok: false,
      message:
        json?.message ?? "The opt-in command was rejected (" + response.status + ").",
    };
  } catch {
    return { ok: false, message: "The opt-in command could not be sent." };
  }
}

export function OptInControls(props: OptInControlsProps) {
  const [slotId, setSlotId] = React.useState(props.defaultSlotId);
  const [surface, setSurface] = React.useState(props.defaultSurface);
  const [slotKind, setSlotKind] = React.useState("portal-object");
  const [capacity, setCapacity] = React.useState("12");
  const [status, setStatus] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function run(body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setStatus(null);
    const result = await postOptIn(body);
    if (result.ok) {
      // Reload so the state above is re-projected from the store.
      window.location.reload();
      return;
    }
    setBusy(false);
    setStatus(result.message);
  }

  function onGrant(event: React.FormEvent): void {
    event.preventDefault();
    void run({
      action: "grant",
      slotId,
      surface,
      slotKind,
      compositionCapacity: Number(capacity),
      disclosureTextVersion: props.disclosureTextVersion,
    });
  }

  function onRevoke(slot: OptInSlotReadback): void {
    if (slot.consentId === null) return;
    void run({ action: "revoke", slotId: slot.slotId, consentId: slot.consentId });
  }

  const activeSlots = props.slots.filter(
    (slot) => slot.consentStatus === "active",
  );

  return (
    <div>
      <form onSubmit={onGrant}>
        <h2>Declare a placement slot and grant consent</h2>
        <p>
          <label>
            Slot id{" "}
            <input
              name="slotId"
              value={slotId}
              onChange={(event) => setSlotId(event.target.value)}
              required
            />
          </label>
        </p>
        <p>
          <label>
            Surface{" "}
            <input
              name="surface"
              value={surface}
              onChange={(event) => setSurface(event.target.value)}
              required
            />
          </label>
        </p>
        <p>
          <label>
            Slot kind{" "}
            <select
              name="slotKind"
              value={slotKind}
              onChange={(event) => setSlotKind(event.target.value)}
            >
              <option value="portal-object">portal-object</option>
              <option value="object-context">object-context</option>
            </select>
          </label>
        </p>
        <p>
          <label>
            Composition capacity{" "}
            <input
              name="compositionCapacity"
              type="number"
              min={1}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              required
            />
          </label>
        </p>
        <input
          type="hidden"
          name="disclosureTextVersion"
          value={props.disclosureTextVersion}
        />
        <button type="submit" disabled={busy}>
          Grant consent under disclosure {props.disclosureTextVersion}
        </button>
      </form>
      {activeSlots.length > 0 ? (
        <div>
          <h2>Revoke consent</h2>
          <p>
            Revocation is recorded in the slot log and stops delivery
            at the next composition.
          </p>
          {activeSlots.map((slot) => (
            <p key={slot.slotId}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRevoke(slot)}
              >
                Revoke consent for {slot.slotId}
              </button>
            </p>
          ))}
        </div>
      ) : null}
      {status !== null ? <p role="alert">{status}</p> : null}
    </div>
  );
}
