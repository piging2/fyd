/**
 * Snapshot store: persist observations/snapshots as JSON files so the next
 * run can diff against the previous one. Plain files, no journal writes.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Observation, Snapshot } from "./types.ts";

export function saveSnapshot(dir: string, snapshot: Snapshot): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, snapshot.snapshotId + ".json");
  writeFileSync(path, JSON.stringify(snapshot, null, 2), "utf8");
  return path;
}

export function loadSnapshot(dir: string, snapshotId: string): Snapshot {
  const path = join(dir, snapshotId + ".json");
  return JSON.parse(readFileSync(path, "utf8")) as Snapshot;
}

/** Snapshot ids present in dir, sorted ascending (chronological by id). */
export function listSnapshots(dir: string): string[] {
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files.map((f) => f.slice(0, -".json".length)).sort();
}

export function observationToSnapshot(
  observation: Observation,
  snapshotId: string,
): Snapshot {
  return {
    snapshotId,
    capturedAt: observation.observedAt,
    provenance: observation.provenance,
    sourceKind: observation.sourceKind,
    sourceUrl: observation.sourceUrl,
    claims: observation.claims,
  };
}
