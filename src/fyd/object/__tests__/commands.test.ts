/**
 * Tests for the owner intent interpreter: deterministic plain language to
 * typed OwnerCommand. Proposing must never mutate anything; only the
 * approve stage writes.
 *
 * The service vocabulary comes from the PING-backed projection (structured
 * service objects), so commands address those names, not prose parses.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { interpretTextCommand } from "../commands";

const SERVICE_ID = "website-service-51de038c1defe8bd";
const SERVICE_NAME = "Pergola Design Consultations";

beforeEach(() => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-cmd-test-"));
  process.env.FYD_PROJECTION_DIR = join(__dirname, "fixtures", "projections");
});

describe("interpretTextCommand", () => {
  test("Put pergola design consultations first becomes a typed move-service proposal", () => {
    const p = interpretTextCommand("Put pergola design consultations first", "happy-place");
    expect(p).not.toBeNull();
    expect(p!.command).toEqual({ type: "move-service", id: SERVICE_ID, to: "first" });
    expect(p!.summary).toContain(SERVICE_NAME);
  });

  test("handles case and surrounding whitespace", () => {
    const p = interpretTextCommand("  PUT PERGOLA DESIGN CONSULTATIONS LAST ", "happy-place");
    expect(p!.command).toEqual({ type: "move-service", id: SERVICE_ID, to: "last" });
  });

  test("move up/down, hide/show, add", () => {
    expect(interpretTextCommand("Move pergola up", "happy-place")!.command).toEqual({
      type: "move-service",
      id: SERVICE_ID,
      to: "up",
    });
    expect(interpretTextCommand("Hide pergola", "happy-place")!.command).toEqual({
      type: "set-service-visibility",
      id: SERVICE_ID,
      visible: false,
    });
    expect(interpretTextCommand("Show pergola", "happy-place")!.command).toEqual({
      type: "set-service-visibility",
      id: SERVICE_ID,
      visible: true,
    });
    const add = interpretTextCommand("Add patios", "happy-place")!;
    expect(add.command).toEqual({ type: "add-service", name: "Patios" });
    expect(add.summary).toContain("Patios");
  });

  test("unknown service or unknown shape returns null, never a guess", () => {
    expect(interpretTextCommand("Put rockets first", "happy-place")).toBeNull();
    expect(interpretTextCommand("Put decks first", "happy-place")).toBeNull();
    expect(interpretTextCommand("What is your refund policy?", "happy-place")).toBeNull();
    expect(interpretTextCommand("", "happy-place")).toBeNull();
  });

  test("proposing never writes owner state", () => {
    const { readOverrides } = require("../owner-store") as typeof import("../owner-store");
    interpretTextCommand("Put pergola first", "happy-place");
    expect(readOverrides("happy-place").history).toEqual([]);
  });
});
