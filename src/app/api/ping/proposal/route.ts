/**
 * BFF: human approval for Ask PING proposals. The digest is re-verified
 * server-side; any modification after drafting fails. Owner-only updates
 * are enforced before the governed signed envelope is submitted as the
 * viewer identity. Agents propose; they cannot publish.
 *
 * site_patch proposals additionally carry a signed canonical envelope and a
 * siteSpecDigest binding; the current SiteSpec digest is re-read and
 * compared before approval so a stale draft cannot apply to a changed spec.
 * POST { proposal: AskProposal } -> { eventId: string }.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPingObjectReader, BadRequestError } from "@/lib/ping/ping-object-reader";
import { verifySignedSitePatchDraft } from "@/fyd/ask/site-patch";
import { getSiteSpecProvider } from "@/fyd/ask/site-spec";
import { readerErrorResponse } from "@/lib/ping/api-errors";
import { getPracticeIdentityId } from "@/lib/ping/session";
import type { AskProposal } from "@/lib/ping/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isProposal(v: unknown): v is AskProposal {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  const base =
    typeof r.schema === "string" &&
    typeof r.digest === "string" &&
    typeof r.changes === "object" &&
    r.changes !== null;
  if (r.kind === "object_update" || r.kind === "object_create") return base;
  if (r.kind === "site_patch") {
    const sp = r.sitePatch as Record<string, unknown> | null;
    return (
      base &&
      typeof r.targetObjectId === "string" &&
      typeof sp === "object" &&
      sp !== null &&
      typeof sp.siteSpecDigest === "string" &&
      Array.isArray(sp.operations)
    );
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const viewerId = await getPracticeIdentityId();
    if (!viewerId) throw new BadRequestError("No active identity. Select an identity first.");
    const body: unknown = await request.json().catch(() => null);
    const rec = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
    if (!isProposal(rec.proposal)) throw new BadRequestError("proposal is required and must be a drafted AskProposal.");
    const proposal = rec.proposal as AskProposal;
    if (proposal.kind === "site_patch") {
      // The FYD lane owns the signing key material: verify the draft's digest,
      // its canonical envelope signature, and the envelope's digest binding.
      if (!verifySignedSitePatchDraft(proposal)) {
        throw new BadRequestError("Site-patch draft failed verification. Draft it again.");
      }
      // Re-read the CURRENT SiteSpec and compare digests: a draft reasoned
      // over an older spec cannot apply after the spec changed.
      const current = await getSiteSpecProvider()
        .getSummary(proposal.sitePatch.siteId)
        .catch(() => null);
      if (!current) {
        throw new BadRequestError("The site spec is unavailable; cannot verify the proposal is current.");
      }
      if (current.digest !== proposal.sitePatch.siteSpecDigest) {
        throw new BadRequestError(
          "The site changed since this proposal was drafted. Ask again for a fresh proposal.",
        );
      }
    }
    const result = await getPingObjectReader().submitProposal(viewerId, proposal);
    return NextResponse.json(result);
  } catch (err) {
    return readerErrorResponse(err);
  }
}
