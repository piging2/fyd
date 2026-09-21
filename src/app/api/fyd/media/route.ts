import { NextResponse } from "next/server";
import { getMediaProvenance, listMediaProvenance } from "@/fyd/media/provenance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/fyd/media?siteId=<slug>&digest=<sha256>
 *
 * Provenance query surface for the managed FYD media pipeline
 * (fyd-media@2). Returns the full provenance record for one asset:
 * original source URL, observed_at, content digest (sha256), media type,
 * dimensions, rights/source classification, and the derived-asset
 * relationship (each variant names the original digest it was produced
 * from). This is the record Ask FYD and WHY THIS cite; it never serves
 * bytes and never hotlinks.
 *
 * GET /api/fyd/media?siteId=<slug> lists the provenance summaries for
 * every acquired asset of the site.
 *
 * Failure honesty: unknown site or digest is a 404, never a plausible
 * stand-in. Unclear-reference-only assets are reference-only by pipeline
 * construction and never appear here.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const siteId = params.get("siteId")?.trim() ?? "";
  const digest = params.get("digest")?.trim() ?? "";
  if (!siteId) {
    return NextResponse.json(
      { ok: false, error: "siteId query parameter is required." },
      { status: 400 },
    );
  }
  if (digest) {
    const record = getMediaProvenance(siteId, digest);
    if (!record) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No acquired media asset with that digest for this site. " +
            "Unknown digests and reference-only assets are never served.",
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, ...record });
  }
  const records = listMediaProvenance(siteId);
  if (!records) {
    return NextResponse.json(
      { ok: false, error: "Unknown siteId: no media manifest." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, siteId, assets: records });
}
