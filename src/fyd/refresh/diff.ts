/**
 * Temporal diff: compare two snapshots of the same source (T1 vs T2) and
 * emit typed change records: changed observation -> diff -> affected object
 * -> affected sections (via the dependency index).
 *
 * The honest no-change case produces an empty array. The machinery is proved
 * on controlled synthetic variants, clearly labeled.
 */

import { claimSlotKey } from "./types.ts";
import type { ChangeRecord, Claim, Snapshot } from "./types.ts";

/** Diff two snapshots of the same source for the same entity set. */
export function diffSnapshots(before: Snapshot, after: Snapshot): ChangeRecord[] {
  const beforeBySlot = new Map<string, Claim>();
  for (const c of before.claims) beforeBySlot.set(claimSlotKey(c.entityId, c.field), c);
  const afterBySlot = new Map<string, Claim>();
  for (const c of after.claims) afterBySlot.set(claimSlotKey(c.entityId, c.field), c);

  const changes: ChangeRecord[] = [];
  const slots = new Set<string>([...beforeBySlot.keys(), ...afterBySlot.keys()]);

  for (const slot of slots) {
    const b = beforeBySlot.get(slot);
    const a = afterBySlot.get(slot);
    if (b && a) {
      if (b.normalizedValue !== a.normalizedValue) {
        changes.push({
          type: "changed",
          entityId: a.entityId,
          field: a.field,
          before: b,
          after: a,
        });
      }
    } else if (a && !b) {
      changes.push({ type: "added", entityId: a.entityId, field: a.field, after: a });
    } else if (b && !a) {
      changes.push({ type: "removed", entityId: b.entityId, field: b.field, before: b });
    }
  }
  changes.sort((x, y) =>
    (x.entityId + "|" + x.field).localeCompare(y.entityId + "|" + y.field),
  );
  return changes;
}

export function changeSummaryText(c: ChangeRecord): string {
  const where = c.entityId + " field '" + c.field + "'";
  if (c.type === "changed") {
    return (
      "CHANGED " + where + ": '" + (c.before ? c.before.value : "?") +
      "' -> '" + (c.after ? c.after.value : "?") + "'"
    );
  }
  if (c.type === "added") {
    return "ADDED " + where + ": '" + (c.after ? c.after.value : "?") + "'";
  }
  return "REMOVED " + where + " (was '" + (c.before ? c.before.value : "?") + "')";
}
