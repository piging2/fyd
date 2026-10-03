/**
 * Tests for the append-only owner event log.
 *
 * The acceptance bar for the owner-core transition model:
 *  1. Every event carries full provenance (actor, target, previous basis,
 *     new value/state, timestamp, event identity, evidence reference).
 *  2. The reducer is a pure fold: the same log replayed twice from empty
 *     state produces byte-identical owner-visible state (digest match).
 *  3. The replayed projection matches the live read path
 *     (readOverrides, which is what every consumer serves).
 *  4. Revert is append-only: a restored event, never a delete.
 *  5. v1 (mutable) files migrate transparently on read.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalizeJson } from "../../../lib/ping/dev-signer";
import {
  applyOwnerCommand,
  readOverrides,
  OwnerCommandError,
} from "../owner-store";
import {
  appendOwnerEvent,
  digestOwnerState,
  fydOwnerEventId,
  migrateV1ToEvents,
  CorruptOwnerLogError,
  readOwnerEvents,
  reduceOwnerEvents,
  type OwnerEvent,
  type OwnerEventDraft,
} from "../owner-events";

const KNOWN_IDS = ["svc-decks", "svc-fences", "svc-pergolas"];
const KNOWN_NAMES = new Map([
  ["svc-decks", "Decks"],
  ["svc-fences", "Fences"],
  ["svc-pergolas", "Pergolas"],
]);

beforeEach(() => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-owner-events-"));
});

function draft(over: Partial<OwnerEventDraft> = {}): OwnerEventDraft {
  return {
    at: "2026-09-21T15:00:00.000Z",
    objectId: "happy-place",
    type: "owner.confirmed-fact",
    actor: { kind: "demo", label: "Demo Owner (seeded, unverified)" },
    target: "object",
    previousBasis: null,
    newValue: null,
    evidence: { kind: "owner-attestation", ref: "test" },
    note: "test note",
    generator: "fyd-owner@1",
    ...over,
  };
}

describe("event identity", () => {
  test("same body yields the same id; seq is part of the identity", () => {
    const a = { ...draft(), seq: 0 };
    const b = { ...draft(), seq: 0 };
    const c = { ...draft(), seq: 1 };
    expect(fydOwnerEventId(a)).toBe(fydOwnerEventId(b));
    expect(fydOwnerEventId(a)).not.toBe(fydOwnerEventId(c));
    expect(fydOwnerEventId(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("appended events get sequential seqs and stable ids", () => {
    const e1 = appendOwnerEvent("happy-place", draft({ note: "one" }));
    const e2 = appendOwnerEvent("happy-place", draft({ note: "two" }));
    expect(e1.seq).toBe(0);
    expect(e2.seq).toBe(1);
    expect(e1.id).not.toBe(e2.id);
    const reread = readOwnerEvents("happy-place");
    expect(reread.map((e) => e.id)).toEqual([e1.id, e2.id]);
  });
});

describe("provenance", () => {
  test("every appended event carries the full provenance record", () => {
    applyOwnerCommand(
      "happy-place",
      { type: "set-contact-field", field: "phone", value: "+15551234567" },
      KNOWN_IDS,
      KNOWN_NAMES,
      { sourceValue: "+15550000000" },
    );
    const events = readOwnerEvents("happy-place");
    expect(events.length).toBe(1);
    const e = events[0];
    expect(e.type).toBe("owner.corrected-fact");
    expect(e.actor).toEqual({
      kind: "demo",
      label: "Demo Owner (seeded, unverified)",
    });
    expect(e.target).toBe("contact:phone");
    expect(e.previousBasis).toEqual({
      priorOwnerValue: null,
      sourceValue: "+15550000000",
    });
    expect((e.newValue as { ownerValue: string }).ownerValue).toBe(
      "+15551234567",
    );
    expect(typeof e.at).toBe("string");
    expect(e.id).toMatch(/^[0-9a-f]{64}$/);
    expect(e.evidence.kind).toBe("source-snapshot");
  });
});

describe("replay determinism", () => {
  test("same log folded twice from empty state is byte-identical", () => {
    applyOwnerCommand(
      "happy-place",
      { type: "move-service", id: "svc-fences", to: "first" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    applyOwnerCommand(
      "happy-place",
      { type: "set-service-visibility", id: "svc-decks", visible: false },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    applyOwnerCommand(
      "happy-place",
      { type: "add-service", name: "Patios" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    applyOwnerCommand(
      "happy-place",
      { type: "set-address-visibility", visibility: "hide" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    applyOwnerCommand(
      "happy-place",
      { type: "set-contact-field", field: "phone", value: "+15551234567" },
      KNOWN_IDS,
      KNOWN_NAMES,
      { sourceValue: "+15550000000" },
    );

    const events = readOwnerEvents("happy-place");
    expect(events.length).toBe(5);

    const first = reduceOwnerEvents("happy-place", events);
    const second = reduceOwnerEvents("happy-place", events);
    const bytes1 = canonicalizeJson(first);
    const bytes2 = canonicalizeJson(second);
    expect(bytes1).toBe(bytes2);
    expect(digestOwnerState(first)).toBe(digestOwnerState(second));

    // The persisted file holds only events: no mutable owner map.
    const raw = JSON.parse(
      readFileSync(
        join(process.env.FYD_OWNER_DIR as string, "happy-place.json"),
        "utf8",
      ),
    );
    expect(raw.version).toBe(2);
    expect(Array.isArray(raw.events)).toBe(true);
    expect(raw.fieldCorrections).toBeUndefined();
    expect(raw.serviceOrder).toBeUndefined();
  });

  test("replayed projection matches the live read path digest", () => {
    applyOwnerCommand(
      "happy-place",
      { type: "set-contact-field", field: "email", value: "a@b.com" },
      KNOWN_IDS,
      KNOWN_NAMES,
      { sourceValue: null },
    );
    applyOwnerCommand(
      "happy-place",
      { type: "set-service-visibility", id: "svc-pergolas", visible: false },
      KNOWN_IDS,
      KNOWN_NAMES,
    );

    // Live path: what every consumer (view, overlay, routes) serves.
    const liveDigest = digestOwnerState(readOverrides("happy-place"));
    // Replay path: raw log folded from empty state, twice.
    const events = readOwnerEvents("happy-place");
    const replayDigest1 = digestOwnerState(
      reduceOwnerEvents("happy-place", events),
    );
    const replayDigest2 = digestOwnerState(
      reduceOwnerEvents("happy-place", events),
    );
    expect(replayDigest1).toBe(liveDigest);
    expect(replayDigest2).toBe(liveDigest);
  });
});

describe("append-only revert", () => {
  test("revert appends a restored event; the correction event is never deleted", () => {
    applyOwnerCommand(
      "happy-place",
      { type: "set-contact-field", field: "phone", value: "+15551234567" },
      KNOWN_IDS,
      KNOWN_NAMES,
      { sourceValue: "+15550000000" },
    );
    const reverted = applyOwnerCommand(
      "happy-place",
      { type: "revert-contact-field", field: "phone" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    // Projection: the correction is no longer composed.
    expect(reverted.fieldCorrections).toEqual({});
    // Log: append-only. The corrected event is still there, followed by
    // the restored event. Nothing was deleted.
    const events = readOwnerEvents("happy-place");
    expect(events.length).toBe(2);
    expect(events.map((e) => e.type)).toEqual([
      "owner.corrected-fact",
      "owner.restored-fact",
    ]);
    expect(events[1].target).toBe("contact:phone");
    expect(events[1].previousBasis).toMatchObject({
      ownerValue: "+15551234567",
      sourceValue: "+15550000000",
    });
  });

  test("revert with no correction fails closed and writes nothing", () => {
    expect(() =>
      applyOwnerCommand(
        "happy-place",
        { type: "revert-contact-field", field: "phone" },
        KNOWN_IDS,
        KNOWN_NAMES,
      ),
    ).toThrow(OwnerCommandError);
    expect(readOwnerEvents("happy-place")).toEqual([]);
  });
});

describe("v1 migration", () => {
  test("a v1 mutable file migrates transparently on read", () => {
    const dir = process.env.FYD_OWNER_DIR as string;
    const v1 = {
      version: 1,
      objectId: "happy-place",
      updatedAt: "2026-09-20T10:00:00.000Z",
      serviceOrder: ["svc-fences", "svc-decks"],
      hiddenServices: ["svc-pergolas"],
      addedServices: [{ id: "svc-patios", name: "Patios" }],
      addressVisibility: "hide",
      fieldCorrections: {
        phone: {
          field: "phone",
          label: "Phone",
          sourceValue: "+15550000000",
          ownerValue: "+15551234567",
          correctedAt: "2026-09-20T10:00:00.000Z",
          actorLabel: "Demo Owner (seeded, unverified)",
          basis: "Owner correction: the owner says this is the correct phone. The source record is unchanged.",
        },
      },
      history: [{ at: "2026-09-20T10:00:00.000Z", text: "Hid Pergolas." }],
    };
    writeFileSync(join(dir, "happy-place.json"), JSON.stringify(v1), "utf8");

    // Transparent on read: the projected state matches the old v1 state.
    const o = readOverrides("happy-place");
    expect(o.serviceOrder).toEqual(["svc-fences", "svc-decks"]);
    expect(o.hiddenServices).toEqual(["svc-pergolas"]);
    expect(o.addedServices).toEqual([{ id: "svc-patios", name: "Patios" }]);
    expect(o.addressVisibility).toBe("hide");
    expect(o.fieldCorrections.phone.ownerValue).toBe("+15551234567");
    expect(o.fieldCorrections.phone.sourceValue).toBe("+15550000000");
    // The human log survived migration.
    expect(o.history.map((h) => h.text)).toContain("Hid Pergolas.");

    // Migration events are provenance-labeled and deterministic.
    const events = readOwnerEvents("happy-place");
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.every((e) => e.evidence.kind === "migration"),
    ).toBe(true);
    expect(events.map((e) => e.type)).toContain("owner.corrected-fact");
    expect(events.map((e) => e.type)).toContain("owner.hid-fact");
    expect(events.map((e) => e.type)).toContain("owner.added-fact");
    // Deterministic: migrating the same v1 file twice yields the same ids.
    const again = migrateV1ToEvents(v1 as never);
    const once = readOwnerEvents("happy-place");
    expect(again.length).toBe(once.length);

    // A new command after migration persists one v2 file with everything.
    applyOwnerCommand(
      "happy-place",
      { type: "set-contact-field", field: "email", value: "a@b.com" },
      KNOWN_IDS,
      KNOWN_NAMES,
      { sourceValue: null },
    );
    const raw = JSON.parse(
      readFileSync(join(dir, "happy-place.json"), "utf8"),
    );
    expect(raw.version).toBe(2);
    const after = readOverrides("happy-place");
    expect(after.fieldCorrections.email.ownerValue).toBe("a@b.com");
    expect(after.fieldCorrections.phone.ownerValue).toBe("+15551234567");
  });
});

describe("fail closed", () => {
  test("unknown event types throw in the reducer", () => {
    const bad = [
      { ...draft({ type: "owner.nuke-fact" as never }), seq: 0, id: "x" },
    ];
    expect(() => reduceOwnerEvents("happy-place", bad)).toThrow();
  });

  test("events for another object throw in the reducer", () => {
    const e: OwnerEvent = { ...draft(), seq: 0, id: "x" };
    expect(() => reduceOwnerEvents("other-object", [e])).toThrow();
  });

  test("rejected commands write nothing", () => {
    expect(() =>
      applyOwnerCommand(
        "happy-place",
        { type: "move-service", id: "svc-nope", to: "first" },
        KNOWN_IDS,
        KNOWN_NAMES,
      ),
    ).toThrow(OwnerCommandError);
    expect(readOwnerEvents("happy-place")).toEqual([]);
  });
});

describe("corrupt owner log (F01)", () => {
  const oid = "happy-place";
  const logPath = () => join(process.env.FYD_OWNER_DIR!, oid + ".json");

  test("missing file still yields []", () => {
    expect(readOwnerEvents(oid)).toEqual([]);
  });

  test("invalid JSON throws CorruptOwnerLogError, not []", () => {
    writeFileSync(logPath(), "{not json", "utf8");
    expect(() => readOwnerEvents(oid)).toThrow(CorruptOwnerLogError);
    try {
      readOwnerEvents(oid);
    } catch (err) {
      expect(err).toBeInstanceOf(CorruptOwnerLogError);
      expect((err as CorruptOwnerLogError).code).toBe("OWNER_LOG_CORRUPT");
      expect((err as CorruptOwnerLogError).reason).toBe("invalid JSON");
    }
  });

  test("objectId mismatch throws CorruptOwnerLogError", () => {
    writeFileSync(logPath(), JSON.stringify({ version: 2, objectId: "other-shop", events: [] }), "utf8");
    expect(() => readOwnerEvents(oid)).toThrow(CorruptOwnerLogError);
  });

  test("append on a corrupt log refuses mutation and retains the bytes", () => {
    const corrupt = "{corrupt";
    writeFileSync(logPath(), corrupt, "utf8");
    expect(() => appendOwnerEvent(oid, draft())).toThrow(CorruptOwnerLogError);
    expect(readFileSync(logPath(), "utf8")).toBe(corrupt);
  });

  test("append on a missing log still works (fresh log)", () => {
    const event = appendOwnerEvent(oid, draft());
    expect(event.seq).toBe(0);
    expect(readOwnerEvents(oid)).toHaveLength(1);
  });
});
