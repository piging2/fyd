/**
 * Portal rail placement harness: unlinked dev proof route.
 *
 * No nav changes; this route exists only to prove the spatial primitive
 * (website canvas + intelligent side rail). Query params:
 *
 *   business=happy-place|coppersmith-plumbing  (default happy-place)
 *   side=left|right|auto                       (default auto)
 *   mode=static|sticky                         (default static)
 *
 * side=auto resolves the rail side from measured margins with the
 * rail-rule (src/fyd/placement/rail-rule.ts); side=left|right forces a
 * side for comparison captures.
 */

import { buildPortalProjection } from "@/fyd/preview/pipeline";
import { RailClient, type RailMode, type RailSideParam } from "./rail-client";

const BUSINESSES = ["happy-place", "coppersmith-plumbing"] as const;
const SIDES: RailSideParam[] = ["left", "right", "auto"];
const MODES: RailMode[] = ["static", "sticky"];

interface PortalRailSearchParams {
  business?: string | string[];
  side?: string | string[];
  mode?: string | string[];
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function PortalRailPage({
  searchParams,
}: {
  searchParams: Promise<PortalRailSearchParams>;
}) {
  const sp = await searchParams;
  const b = first(sp.business);
  const s = first(sp.side);
  const m = first(sp.mode);

  const business: (typeof BUSINESSES)[number] = (
    BUSINESSES as readonly string[]
  ).includes(b ?? "")
    ? (b as (typeof BUSINESSES)[number])
    : "happy-place";
  const side: RailSideParam = (SIDES as string[]).includes(s ?? "")
    ? (s as RailSideParam)
    : "auto";
  const mode: RailMode = (MODES as string[]).includes(m ?? "")
    ? (m as RailMode)
    : "static";

  const portal = buildPortalProjection(business);
  if (!portal) {
    return (
      <div className="p-8 font-mono text-sm">
        No portal projection for business &quot;{business}&quot;.
      </div>
    );
  }

  return <RailClient portal={portal} business={business} side={side} mode={mode} />;
}
