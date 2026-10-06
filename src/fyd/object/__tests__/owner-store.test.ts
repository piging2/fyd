/**
 * Tests for the owner store: durable, validated, fail-closed commands.
 *
 * Owner state must survive reload (file-backed) and must never accept a
 * command referencing unknown services.
 */

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyOwnerCommand,
  parseOwnerCommand,
  readOverrides,
  OwnerCommandError,
} from "../owner-store";

const KNOWN_IDS = ["svc-decks", "svc-fences", "svc-pergolas"];
const KNOWN_NAMES = new Map([
  ["svc-decks", "Decks"],
  ["svc-fences", "Fences"],
  ["svc-pergolas", "Pergolas"],
]);

beforeEach(() => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-owner-test-"));
});

describe("readOverrides", () => {
  test("returns empty defaults when no file exists", () => {
    const o = readOverrides("happy-place");
    expect(o.serviceOrder).toEqual([]);
    expect(o.history).toEqual([]);
    expect(o.addressVisibility).toBe("default");
  });
});

describe("applyOwnerCommand", () => {
  test("move-service first reorders and persists", () => {
    const o = applyOwnerCommand(
      "happy-place",
      { type: "move-service", id: "svc-fences", to: "first" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(o.serviceOrder[0]).toBe("svc-fences");
    expect(o.history.length).toBe(1);
    // Survives reload: a fresh read sees the same order.
    const reread = readOverrides("happy-place");
    expect(reread.serviceOrder[0]).toBe("svc-fences");
    expect(reread.history.length).toBe(1);
  });

  test("move-service up/down moves one step", () => {
    applyOwnerCommand("happy-place", { type: "move-service", id: "svc-decks", to: "first" }, KNOWN_IDS, KNOWN_NAMES);
    const o = applyOwnerCommand("happy-place", { type: "move-service", id: "svc-decks", to: "down" }, KNOWN_IDS, KNOWN_NAMES);
    // Order was [decks, fences, pergolas]; decks down -> [fences, decks, pergolas]
    expect(o.serviceOrder).toEqual(["svc-fences", "svc-decks", "svc-pergolas"]);
  });

  test("set-service-visibility hides and shows", () => {
    let o = applyOwnerCommand(
      "happy-place",
      { type: "set-service-visibility", id: "svc-decks", visible: false },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(o.hiddenServices).toContain("svc-decks");
    o = applyOwnerCommand(
      "happy-place",
      { type: "set-service-visibility", id: "svc-decks", visible: true },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(o.hiddenServices).not.toContain("svc-decks");
  });

  test("add-service appends an owner service", () => {
    const o = applyOwnerCommand("happy-place", { type: "add-service", name: "Patios" }, KNOWN_IDS, KNOWN_NAMES);
    expect(o.addedServices).toEqual([{ id: "svc-patios", name: "Patios" }]);
  });

  test("rejects unknown service ids without writing", () => {
    expect(() =>
      applyOwnerCommand("happy-place", { type: "move-service", id: "svc-nope", to: "first" }, KNOWN_IDS, KNOWN_NAMES),
    ).toThrow(OwnerCommandError);
    expect(readOverrides("happy-place").history).toEqual([]);
  });

  test("rejects duplicate and blank service names", () => {
    expect(() => applyOwnerCommand("happy-place", { type: "add-service", name: "Decks" }, KNOWN_IDS, KNOWN_NAMES)).toThrow(
      OwnerCommandError,
    );
    expect(() => applyOwnerCommand("happy-place", { type: "add-service", name: "   " }, KNOWN_IDS, KNOWN_NAMES)).toThrow(
      OwnerCommandError,
    );
  });

  test("set-address-visibility records the tri-state preference", () => {
    const hid = applyOwnerCommand(
      "happy-place",
      { type: "set-address-visibility", visibility: "hide" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(hid.addressVisibility).toBe("hide");
    // Idempotent: hiding twice confirms without changing state.
    const hidAgain = applyOwnerCommand(
      "happy-place",
      { type: "set-address-visibility", visibility: "hide" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(hidAgain.addressVisibility).toBe("hide");
    // Explicit DEFAULT withdraws the preference (append-only).
    const back = applyOwnerCommand(
      "happy-place",
      { type: "set-address-visibility", visibility: "default" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(back.addressVisibility).toBe("default");
  });

  test("writes valid JSON to disk", () => {
    applyOwnerCommand("happy-place", { type: "add-service", name: "Patios" }, KNOWN_IDS, KNOWN_NAMES);
    const dir = process.env.FYD_OWNER_DIR as string;
    const raw = readFileSync(join(dir, "happy-place.json"), "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});

describe("parseOwnerCommand", () => {
  test("parses each command shape", () => {
    expect(parseOwnerCommand({ type: "move-service", id: "a", to: "up" })).toEqual({
      type: "move-service",
      id: "a",
      to: "up",
    });
    expect(parseOwnerCommand({ type: "add-service", name: "X" })).toEqual({ type: "add-service", name: "X" });
  });

  test("rejects malformed commands", () => {
    expect(() => parseOwnerCommand(null)).toThrow(OwnerCommandError);
    expect(() => parseOwnerCommand({ type: "move-service", id: "a", to: "sideways" })).toThrow(OwnerCommandError);
    expect(() => parseOwnerCommand({ type: "nuke" })).toThrow(OwnerCommandError);
  });
});

describe("owner service description corrections", () => {
  const SITE2 = "happy-place";
  function setDesc(value: string, sourceValue: string | null = "Old site text.") {
    return applyOwnerCommand(
      SITE2,
      { type: "set-service-description", serviceId: "svc-decks", value },
      KNOWN_IDS,
      KNOWN_NAMES,
      { sourceValue, actorLabel: "Demo Owner (seeded, unverified)" },
    );
  }

  test("parse accepts a valid command", () => {
    expect(
      parseOwnerCommand({ type: "set-service-description", serviceId: "svc-decks", value: "X" }),
    ).toEqual({ type: "set-service-description", serviceId: "svc-decks", value: "X" });
    expect(parseOwnerCommand({ type: "revert-service-description", serviceId: "svc-decks" })).toEqual(
      { type: "revert-service-description", serviceId: "svc-decks" },
    );
  });

  test("parse rejects missing serviceId/value", () => {
    expect(() => parseOwnerCommand({ type: "set-service-description", value: "X" })).toThrow(
      OwnerCommandError,
    );
    expect(() => parseOwnerCommand({ type: "set-service-description", serviceId: "svc-decks" })).toThrow(
      OwnerCommandError,
    );
    expect(() => parseOwnerCommand({ type: "revert-service-description" })).toThrow(OwnerCommandError);
  });

  test("apply records the correction keyed service-field:<id> with the source value from opts", () => {
    const o = setDesc("We build custom cedar decks.");
    const c = o.fieldCorrections["service-field:svc-decks"];
    expect(c).toBeDefined();
    expect(c.field).toBe("description");
    expect(c.targetObjectId).toBe("svc-decks");
    expect(c.label).toBe("Description");
    expect(c.ownerValue).toBe("We build custom cedar decks.");
    expect(c.sourceValue).toBe("Old site text.");
    expect(o.history.length).toBe(1);
    expect(o.history[0].text).toContain("Corrected the description of 'Decks'");
    // Survives reload: a fresh read re-projects the same correction.
    const reread = readOverrides(SITE2);
    expect(reread.fieldCorrections["service-field:svc-decks"].ownerValue).toBe(
      "We build custom cedar decks.",
    );
    expect(reread.fieldCorrections["service-field:svc-decks"].sourceValue).toBe("Old site text.");
  });

  test("apply rejects unknown service and empty value", () => {
    expect(() =>
      applyOwnerCommand(
        SITE2,
        { type: "set-service-description", serviceId: "svc-nope", value: "X" },
        KNOWN_IDS,
        KNOWN_NAMES,
      ),
    ).toThrow(OwnerCommandError);
    expect(() =>
      applyOwnerCommand(
        SITE2,
        { type: "set-service-description", serviceId: "svc-decks", value: "   " },
        KNOWN_IDS,
        KNOWN_NAMES,
      ),
    ).toThrow(OwnerCommandError);
  });

  test("revert appends a restored event; the correction event stays in the log", () => {
    setDesc("We build custom cedar decks.");
    const o = applyOwnerCommand(
      SITE2,
      { type: "revert-service-description", serviceId: "svc-decks" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(o.fieldCorrections["service-field:svc-decks"]).toBeUndefined();
    expect(o.history.length).toBe(2);
    expect(o.history[0].text).toContain("Corrected the description of 'Decks'");
    expect(o.history[1].text).toContain("Reverted the description correction");
  });

  test("revert with no correction fails closed", () => {
    expect(() =>
      applyOwnerCommand(
        SITE2,
        { type: "revert-service-description", serviceId: "svc-decks" },
        KNOWN_IDS,
        KNOWN_NAMES,
      ),
    ).toThrow(OwnerCommandError);
  });

  test("a second set supersedes the first; both events stay in the log", () => {
    setDesc("First value.");
    const o = setDesc("Second value.");
    expect(o.fieldCorrections["service-field:svc-decks"].ownerValue).toBe("Second value.");
    expect(o.history.length).toBe(2);
    expect(o.history.every((e) => e.text.includes("Corrected the description of 'Decks'"))).toBe(true);
  });
});
