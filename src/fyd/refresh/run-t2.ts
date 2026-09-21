/**
 * T2 refresh runner (run with tsx):
 *
 *   npx tsx src/fyd/refresh/run-t2.ts <htmlFile> <snapshotDir>
 *
 * Reads a fetched page, builds the T2 website observation, persists a
 * snapshot, diffs against the previous snapshot in the dir (if any), and
 * runs conflict detection against the synthetic Facebook fixture
 * (real Facebook data is unavailable; see facebook-source.ts).
 *
 * Prints a JSON report to stdout. No journal writes.
 */

import { readFileSync } from "node:fs";
import { observeWebsite } from "./website-observe.ts";
import {
  checkFacebookAvailability,
  syntheticFacebookObservation,
} from "./facebook-source.ts";
import { detectConflicts } from "./conflict.ts";
import { changeSummaryText, diffSnapshots } from "./diff.ts";
import {
  DependencyIndex,
  happyPlaceSeedIndex,
  pagesForSections,
} from "./dependency-index.ts";
import {
  listSnapshots,
  loadSnapshot,
  observationToSnapshot,
  saveSnapshot,
} from "./snapshot-store.ts";

const ENTITY_ID = "fyd:business:happy-place-carpentry";
const SITE_URL = "https://happy-place-platform.vercel.app/";

function main(): void {
  const [htmlFile, snapshotDir] = process.argv.slice(2);
  if (!htmlFile || !snapshotDir) {
    console.error("usage: run-t2.ts <htmlFile> <snapshotDir>");
    process.exit(1);
  }
  const html = readFileSync(htmlFile, "utf8");
  const observedAt = new Date().toISOString();

  const observation = observeWebsite(html, ENTITY_ID, {
    url: SITE_URL,
    observedAt,
    evidenceRef: "live fetch of " + SITE_URL + " at " + observedAt,
  });

  const snapshotId = "t2-" + observedAt.slice(0, 10) + "-" + observedAt.slice(11, 13) + observedAt.slice(14, 16);
  const snapshot = observationToSnapshot(observation, snapshotId);

  // Temporal diff against the previous snapshot, if one exists.
  const existing = listSnapshots(snapshotDir).filter((id) => id !== snapshotId);
  const previousId = existing.length > 0 ? existing[existing.length - 1] : null;
  const previous = previousId ? loadSnapshot(snapshotDir, previousId) : null;
  const changes = previous ? diffSnapshots(previous, snapshot) : [];
  const index = DependencyIndex.fromSeed(happyPlaceSeedIndex());
  const invalidation = index.invalidateForChanges(changes);

  // Conflict detection vs the labeled synthetic Facebook fixture.
  const fbAvailability = checkFacebookAvailability(observedAt);
  const fbFixture = syntheticFacebookObservation(ENTITY_ID, observedAt);
  const conflicts = detectConflicts([...observation.claims, ...fbFixture.claims], observedAt);

  const savedPath = saveSnapshot(snapshotDir, snapshot);

  const report = {
    snapshotId,
    savedPath,
    observedAt,
    claimCount: observation.claims.length,
    fields: observation.claims.map((c) => c.field),
    previousSnapshotId: previousId,
    temporalDiff: {
      changeCount: changes.length,
      changes: changes.map(changeSummaryText),
      invalidatedSections: invalidation.allSections,
      pagesToRegenerate: pagesForSections(invalidation.allSections),
    },
    facebook: {
      available: fbAvailability.available,
      reason: fbAvailability.reason,
    },
    conflicts: {
      count: conflicts.length,
      items: conflicts.map((c) => ({
        conflictId: c.conflictId,
        field: c.field,
        status: c.status,
        surfaceText: c.surfaceText,
        claims: c.claims.map((k) => ({
          value: k.value,
          sourceKind: k.sourceKind,
          grade: k.grade,
          label: k.label,
        })),
      })),
    },
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
