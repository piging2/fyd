/**
 * GET /api/fyd/why-this?siteId=&objectId=[&field=]
 *
 * Why-this trust path for the edge-object experience. Answers "why does
 * FYD show this?" from the object's own provenance record via the
 * focused Why This claim chain (whyThisClaimChainFor):
 *   CLAIM -> SOURCE -> OBSERVED WHEN -> EVIDENCE ->
 *   SUPPORT (DIRECT | DERIVED | OWNER-CONFIRMED)
 * CLAIM is the object title (the response's claim field). It never invents
 * a link in the evidence chain: a missing link renders as "unknown", and
 * an object with no provenance yields found:false.
 *
 * Owner-facing language law: the SUPPORT detail for OWNER-CONFIRMED uses
 * "Confirmed by you" plus the knowledge-transition wording ("you updated
 * the business"), never blurring it with presentation intent ("change the
 * website"). Demo-operator overlays are DIRECT with honest attribution,
 * never mislabeled as owner-confirmed.
 *
 * Visibility: the object must be visible to a public viewer (the
 * verified public projection, Q-C-01, the same boundary the site pages
 * and the edge-object route use). Invisible objects yield found:false,
 * indistinguishable from unknown: the why-this path is never a privacy
 * bypass.
 *
 * Field-level queries (field=<predicate>) report the relationship's own
 * evidence reference (the edge is a claim too). The root business object
 * carries no field-level evidence_ref, so a bare objectId query falls
 * back to the honest object-level provenance: the source statement from
 * the existing record, never an invented observation.
 *
 * Response shape:
 *   { found: true, claim, source, observedWhen, evidence, support,
 *     supportDetail }
 *   { found: false, reason }
 */

import { NextRequest, NextResponse } from "next/server";
import { getVerifiedPublicProjectionSync } from "@/fyd/data/ping-object-source";
import {
  whyThisClaimChainFor,
  type WhyThisSupport,
} from "@/fyd/object/why-this-steps";
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

/** The SUPPORT class for one chain: the trailing token of the detail. */
function supportOf(steps: { step: string; detail: string }[]): WhyThisSupport {
  const detail = stepDetail(steps, "Support");
  if (detail.startsWith("OWNER-CONFIRMED")) return "OWNER-CONFIRMED";
  if (detail.startsWith("DERIVED")) return "DERIVED";
  return "DIRECT";
}

function objectWhy(o: PingObject): {
  found: true;
  claim: string;
  source: string;
  observedWhen: string;
  evidence: string;
  support: WhyThisSupport;
  supportDetail: string;
} {
  const steps = whyThisClaimChainFor(o);
  // The why lane builds CLAIM (the heading) -> SOURCE -> OBSERVED WHEN ->
  // EVIDENCE -> SUPPORT from the object's own provenance. The honest
  // fallback for the root business object: object-level provenance,
  // exactly what this lane returns, never an invented observation.
  return {
    found: true,
    claim: o.title,
    source: stepDetail(steps, "Source"),
    observedWhen: stepDetail(steps, "Observed when"),
    evidence: stepDetail(steps, "Evidence"),
    support: supportOf(steps),
    supportDetail: stepDetail(steps, "Support"),
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
  let verified;
  try {
    verified = getVerifiedPublicProjectionSync(siteId, "anonymous");
  } catch {
    return NextResponse.json(
      { found: false, reason: "Projection unavailable." },
      { status: 503 },
    );
  }
  // The boundary already applied field visibility, traversal cuts, and the
  // public-object filter: the graph below is the verified public projection.
  const visible = verified.graph;
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
    // A recorded relationship is DIRECT support: observed in the site
    // data, not derived and not an owner assertion.
    return NextResponse.json({
      found: true,
      claim: `The "${field}" relationship`,
      source: rel.evidenceRef || "unknown",
      observedWhen: rel.createdAt ? `Observed ${rel.createdAt.slice(0, 10)}.` : "unknown",
      evidence: `Relationship "${field}" recorded in the site data.`,
      support: "DIRECT",
      supportDetail:
        "Recorded in the site data.",
    });
  }
  const steps = whyThisClaimChainFor(target);
  if (steps.length === 0) {
    return NextResponse.json(
      { found: false, reason: "No provenance recorded for that entry." },
      { status: 200 },
    );
  }
  return NextResponse.json(objectWhy(target));
}
