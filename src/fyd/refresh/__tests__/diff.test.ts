/**
 * Temporal diff tests: identical snapshots produce an empty diff; changed,
 * added, and removed claims produce typed records with before/after.
 */
import assert from "node:assert/strict";
import type { Snapshot } from "../types";
import { diffSnapshots, changeSummaryText } from "../diff";
import { extractWebsiteClaims } from "../website-observe";

const ENTITY = "fyd:business:happy-place-carpentry";
const URL = "https://happy-place-platform.vercel.app/";
const T1 = "2026-09-20T11:00:00.000Z";
const T2 = "2026-09-21T11:23:35.000Z";

function snap(id: string, at: string, html: string, provenance: "real" | "synthetic" = "real"): Snapshot {
  return {
    snapshotId: id,
    capturedAt: at,
    provenance,
    sourceKind: "website",
    sourceUrl: URL,
    claims: extractWebsiteClaims(html, ENTITY, { url: URL, observedAt: at, evidenceRef: "test" }),
  };
}

const BASE_HTML =
  '<html><head><title>Happy Place Carpentry — Decks</title>' +
  '<meta name="description" content="Licensed Oregon carpentry contractor (CCB# 254240)."/></head>' +
  "<body>Mon–Fri 8am–5pm · Sat by appointment</body></html>";

test("identical snapshots produce an empty diff (honest no-change case)", () => {
  const a = snap("t1", T1, BASE_HTML);
  const b = snap("t2", T2, BASE_HTML);
  const changes = diffSnapshots(a, b);
  assert.deepEqual(changes, []);
});

test("changed value produces a changed record with before and after", () => {
  const a = snap("t1", T1, BASE_HTML, "synthetic");
  const changed = BASE_HTML.replace("8am–5pm", "9am–5pm");
  const b = snap("t2", T2, changed, "synthetic");
  const changes = diffSnapshots(a, b);
  assert.equal(changes.length, 1);
  const c = changes[0];
  assert.equal(c.type, "changed");
  assert.equal(c.field, "hours");
  assert.ok(c.before && c.before.value.includes("8am"));
  assert.ok(c.after && c.after.value.includes("9am"));
  assert.ok(changeSummaryText(c).includes("CHANGED"));
});

test("added and removed claims are typed", () => {
  const a = snap("t1", T1, BASE_HTML, "synthetic");
  const added = BASE_HTML + "<body>taylor@happyplacecarpentry.com</body>";
  const b = snap("t2", T2, added, "synthetic");
  const changes = diffSnapshots(a, b);
  const addedRec = changes.find((c) => c.field === "email");
  assert.ok(addedRec);
  assert.equal(addedRec.type, "added");
  assert.ok(addedRec.after);

  const removed = diffSnapshots(b, a);
  const removedRec = removed.find((c) => c.field === "email");
  assert.ok(removedRec);
  assert.equal(removedRec.type, "removed");
  assert.ok(removedRec.before);
});

test("diff output is sorted and deterministic", () => {
  const a = snap("t1", T1, BASE_HTML, "synthetic");
  const bHtml = BASE_HTML.replace("8am–5pm", "9am–5pm") + "<body>541-286-5190</body>";
  const b = snap("t2", T2, bHtml, "synthetic");
  const first = diffSnapshots(a, b).map((c) => c.entityId + "|" + c.field + "|" + c.type);
  const second = diffSnapshots(a, b).map((c) => c.entityId + "|" + c.field + "|" + c.type);
  assert.deepEqual(first, second);
  const sorted = [...first].sort();
  assert.deepEqual(first, sorted);
  assert.ok(changeSummaryText(diffSnapshots(a, b)[0]).length > 0);
});
