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
    expect(o.addressVisibility).toBe("public");
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

  test("set-address-visibility toggles", () => {
    const o = applyOwnerCommand(
      "happy-place",
      { type: "set-address-visibility", visibility: "hidden" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(o.addressVisibility).toBe("hidden");
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
