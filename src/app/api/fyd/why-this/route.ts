/**
 * GET /api/fyd/why-this?siteId=&objectId=[&field=]
 *
 * Why-this trust path for the edge-object experience. Answers "why does
 * FYD show this?" from the object's own provenance record via the
 * existing why-this-steps lane (whyThisStepsFor). It never invents a
 * link in the evidence chain: a missing link renders as "unknown", and
 * an object with no provenance yields found:false.
 *
 * Visibility: the object must be visible to a public viewer (the same
 * publicGraph gate the site pages and the edge-object route use).
 * Invisible objects yield found:false, indistinguishable from unknown:
 * the why-this path is never a privacy bypass.
 *
 * Field-level queries (field=<predicate>) report the relationship's own
 * evidence reference (the edge is a claim too). The root business object
 * carries no field-level evidence_ref, so a bare objectId query falls
 * back to the honest object-level provenance: the source statement from
 * the existing record, never an invented observation.
 *
 * Response shape (source-compatible):
 *   { found: true, objectTitle, fieldLabel, source, observedValue,
 *     observationTime, extractionMethod }
 *   { found: false, reason }
 */

import { NextRequest, NextResponse } from "next/server";
import { getPingObjectGraphSync } from "@/fyd/data/ping-object-source";
import { applyPublicVisibilityGate } from "@/fyd/edge/resolve";
import { whyThisStepsFor } from "@/fyd/object/why-this-steps";
import type { PingObject } from "@/lib/ping/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The authorized FYD demo tenants (same list as /sites page.tsx). */
const DEMO_SITES: ReadonlySet<string> = new Set([
  "happy-place",
  "coppersmith-plumbing",
]);

function stepDetail(
  steps: { step: string; detail: string }[],
  name: string,
): string {
  const s = steps.find((x) => x.step === name);
  return s ? s.detail : "unknown";
}

function objectWhy(o: PingObject): {
  found: true;
  objectTitle: string;
  fieldLabel: string;
  source: string;
  observedValue: string;
  observationTime: string;
  extractionMethod: string;
} {
  const steps = whyThisStepsFor(o);
  // The why lane builds SOURCE -> OBSERVED EVIDENCE -> EXTRACTION METHOD
  // -> STATUS from the object's own provenance. The honest fallback for
  // the root business object: object-level provenance, exactly what this
  // lane returns, never an invented observation.
  return {
    found: true,
    objectTitle: o.title,
    fieldLabel: `The "${o.title}" entry`,
    source: stepDetail(steps, "Source"),
    observedValue: stepDetail(steps, "Observed value"),
    observationTime: stepDetail(steps, "Observation time"),
    extractionMethod: stepDetail(steps, "Extraction method"),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const siteId = request.nextUrl.searchParams.get("siteId") ?? "";
  const objectId = request.nextUrl.searchParams.get("objectId") ?? "";
  const field = request.nextUrl.searchParams.get("field") ?? "";
  if (!siteId || !DEMO_SITES.has(siteId) || !objectId) {
    return NextResponse.json(
      { found: false, reason: "siteId and objectId are required" },
      { status: 400 },
    );
  }
  let graph;
  try {
    graph = getPingObjectGraphSync(siteId).graph;
  } catch {
    return NextResponse.json(
      { found: false, reason: "Projection unavailable." },
      { status: 503 },
    );
  }
  const visible = applyPublicVisibilityGate(graph);
  const byId = new Map(visible.objects.map((o) => [o.id, o]));
  const target = byId.get(objectId);
  if (!target) {
    // canSee gate: invisible or unknown -> found:false, no oracle.
    return NextResponse.json(
      {
        found: false,
        reason:
          "FYD has no record of that entry, so it cannot say why it is shown.",
      },
      { status: 200 },
    );
  }
  if (field) {
    // Per-edge-group why: the relationship's own evidence reference.
    const rel = visible.relationships.find(
      (r) => r.subject === objectId && r.predicate === field && r.status === "active",
    );
    if (!rel || !byId.has(rel.object)) {
      return NextResponse.json(
        { found: false, reason: "No edge recorded." },
        { status: 200 },
      );
    }
    const targetObj = byId.get(rel.object)!;
    return NextResponse.json({
      found: true,
      objectTitle: targetObj.title,
      fieldLabel: `The "${field}" relationship`,
      source: rel.evidenceRef || "unknown",
      observedValue: targetObj.title,
      observationTime: rel.createdAt || "unknown",
      extractionMethod:
        "relationship evidence: recorded by website ingestion (edge-level evidence reference)",
    });
  }
  const steps = whyThisStepsFor(target);
  if (steps.length === 0) {
    return NextResponse.json(
      { found: false, reason: "No provenance recorded for that entry." },
      { status: 200 },
    );
  }
  return NextResponse.json(objectWhy(target));
}
