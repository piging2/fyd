/**
 * PING home-page composition, applied in this page's own page.tsx.
 *
 * The generic generator orders sections for every business the same way.
 * PING's story needs its own arc: the visitor meets the business first
 * (who PING helps, what it does), then the services, then the conversation
 * (Ask FYD) right beside the services it answers questions about, instead
 * of stranded at the bottom of the page. Everything else keeps its
 * relative order. Pure and deterministic: same spec in, same spec out.
 */
import type { FYDSiteSpec } from "@/fyd/sitespec/types";

/** Desired PING home order; components absent from the spec are skipped. */
const PING_HOME_ORDER = ["Hero", "BusinessSummary", "Services", "AskFYD"];

export function composePingHome(spec: FYDSiteSpec): FYDSiteSpec {
  const pages = spec.pages.map((page) => {
    if (page.slug !== "home") return page;
    const ranked = new Map(PING_HOME_ORDER.map((c, i) => [c, i] as const));
    const sections = [...page.sections].sort((a, b) => {
      const ra = ranked.has(a.component) ? (ranked.get(a.component) as number) : PING_HOME_ORDER.length;
      const rb = ranked.has(b.component) ? (ranked.get(b.component) as number) : PING_HOME_ORDER.length;
      return ra - rb;
    });
    return { ...page, sections };
  });
  return { ...spec, pages };
}
