/**
 * bundledOverlaySnapshotStatus: the readiness-facing view of the bundled
 * overlay snapshot (FYD-READYZ-FIX-20261023). Must agree with the read
 * path's parser: same configured path, same accepted shapes, null count
 * on any failure (missing, unreadable, malformed, wrong shape).
 */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPingObjectReader } from "../ping-object-reader";

let saved: string | undefined;
let dir = "";

beforeEach(() => {
  saved = process.env.FYD_OVERLAY_SNAPSHOT;
  delete process.env.FYD_OVERLAY_SNAPSHOT;
  dir = mkdtempSync(join(tmpdir(), "snap-status-"));
});

afterEach(() => {
  if (saved === undefined) delete process.env.FYD_OVERLAY_SNAPSHOT;
  else process.env.FYD_OVERLAY_SNAPSHOT = saved;
  rmSync(dir, { recursive: true, force: true });
});

describe("bundledOverlaySnapshotStatus", () => {
  it("reports the configured path and event count for an { events } file", () => {
    const p = join(dir, "snap.json");
    writeFileSync(p, JSON.stringify({ events: [{ id: 1 }, { id: 2 }] }), "utf8");
    process.env.FYD_OVERLAY_SNAPSHOT = p;
    const s = getPingObjectReader().bundledOverlaySnapshotStatus();
    expect(s.path).toBe(p);
    expect(s.eventCount).toBe(2);
  });

  it("accepts a bare array snapshot", () => {
    const p = join(dir, "snap.json");
    writeFileSync(p, JSON.stringify([{ id: 1 }]), "utf8");
    process.env.FYD_OVERLAY_SNAPSHOT = p;
    expect(getPingObjectReader().bundledOverlaySnapshotStatus().eventCount).toBe(1);
  });

  it("returns a null count for a missing file, keeping the configured path", () => {
    const p = join(dir, "nope.json");
    process.env.FYD_OVERLAY_SNAPSHOT = p;
    const s = getPingObjectReader().bundledOverlaySnapshotStatus();
    expect(s.path).toBe(p);
    expect(s.eventCount).toBeNull();
  });

  it("returns a null count for malformed JSON", () => {
    const p = join(dir, "bad.json");
    writeFileSync(p, "{ nope", "utf8");
    process.env.FYD_OVERLAY_SNAPSHOT = p;
    expect(getPingObjectReader().bundledOverlaySnapshotStatus().eventCount).toBeNull();
  });

  it("defaults to the bundled repo snapshot when the env var is unset", () => {
    const s = getPingObjectReader().bundledOverlaySnapshotStatus();
    expect(s.path).toBe("fyd-projections/fyd-overlay-snapshot.json");
    expect(s.eventCount).not.toBeNull();
    expect(s.eventCount as number).toBeGreaterThan(0);
  });
});
