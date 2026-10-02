import { NextResponse } from "next/server";
import { verifyPublicProjection } from "@/fyd/sitespec/public-projection";
import { editorialRecords } from "@/fyd/components/editorial-model";
import { SOURCE_ORIGIN } from "../../../presentation";
export const dynamic = "force-dynamic";
/** Fixed read-only public interface. No request-supplied host, tenant, credentials,
 * writes, source files or private-state fallbacks. Upstream enforces its boundary;
 * the existing projection and field-binding checks also run here.
 */
export async function GET() {
  const results = await Promise.allSettled(
    [
      { id: "coppersmith-plumbing", name: "Coppersmith" },
      { id: "happy-place", name: "Happy Place" },
    ].map(async (site) => {
      const response = await fetch(
        `${SOURCE_ORIGIN}/api/fyd/projection?siteId=${site.id}`,
        { cache: "no-store", signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) throw Error("Public projection unavailable");
      const body = await response.json();
      if (
        !body.ok ||
        body.siteId !== site.id ||
        body.contract?.viewerKind !== "anonymous" ||
        body.contract?.boundaryVersion !== "fyd.public-projection@1"
      )
        throw Error("Invalid public projection");
      const projection = verifyPublicProjection(body.graph, [], "anonymous");
      return {
        name: site.name,
        href: `${SOURCE_ORIGIN}/sites/${site.id}`,
        capturedAt: new Date().toISOString(),
        checkpoint: body.contract.checkpoint,
        records: editorialRecords(
          projection.graph.objects.filter(
            (o) => o.schema === "ping.social.service@1",
          ),
          projection.graph,
        ).slice(0, 6),
      };
    }),
  );
  const previews = results.flatMap((r) =>
    r.status === "fulfilled" ? [r.value] : [],
  );
  return NextResponse.json(
    { previews },
    {
      status: previews.length ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
