"use client";

/**
 * BuildClient: the generic composition shell for /build/[siteId].
 *
 * Not SiteClient: there is no FYD demo header, no structured editor, and
 * no provenance footer here. The customer content owns the page.
 *
 * Layout law: the page content renders in the center through the existing
 * SitePageView/renderSection machinery. The margin features ONE object:
 * the richest public non-owner object by evidence score, rendered through
 * the existing ObjectCircle doorway (inline reference -> preview ->
 * dialog) over the honest pingObjectToView adapter. Desktop shows the
 * object rail; on narrow viewports it collapses to the drawer sheet.
 * The rail never displaces content. The AskFYD mount is the spec's own
 * AskFYD section (the generator adds it to every home page), rendered by
 * the same machinery, not a second chat path.
 */

import { useMemo } from "react";
import { SitePageView } from "@/fyd/components/renderer";
import { ObjectRail, pingObjectToView, richestObject } from "@/fyd/components/object-rail";
import { ObjectCircle } from "@/fyd/ui/object-circle";
import type {
  FYDFinding,
  FYDSiteSpec,
  ObjectGraph,
  ObjectPresence,
  ViewerContext,
} from "@/fyd/sitespec/types";
// Type-only: the hero media is serialized DisplayMedia resolved on the
// server; the client never touches the media store.
import type { DisplayMedia } from "@/fyd/media/select";

const VIEWER: ViewerContext = { viewerId: null, displayName: null };

/**
 * Margin presence: prefer the spec own objectPresence (archetype profiles
 * set it); otherwise derive it from the graph. Deterministic: objects are
 * id-sorted in both paths, so the rail order is stable across renders.
 */
export function presenceForBuild(
  spec: FYDSiteSpec,
  graph: ObjectGraph,
): ObjectPresence | undefined {
  if (spec.objectPresence) return spec.objectPresence;
  const objects = graph.objects
    .filter((o) => o.visibility === "public" && o.id !== spec.ownerObjectId)
    .map((o) => o.id)
    .sort();
  if (objects.length === 0) return undefined;
  return { mode: "auto", objects, rules: { collapseBelow: "lg" } };
}

export function BuildClient({
  spec,
  graph,
  findings,
  renderable,
  siteId,
  heroMedia = null,
}: {
  spec: FYDSiteSpec;
  graph: ObjectGraph;
  findings: FYDFinding[];
  renderable: boolean;
  siteId?: string;
  heroMedia?: DisplayMedia | null;
}) {
  const ctx = useMemo(
    () => ({ spec, graph, viewer: VIEWER, siteId, heroMedia }),
    [spec, graph, siteId, heroMedia],
  );
  const page = spec.pages[0];
  const theme = spec.themeTokens;
  const presence = presenceForBuild(spec, graph);
  // Checkpoint: the margin features ONE object, the richest public
  // non-owner object by evidence score (deterministic). Rendered through
  // the existing ObjectCircle doorway (inline reference -> preview ->
  // dialog), never a reimplementation; no dead view/ask actions are
  // emitted because the /o/ node route serves site slugs only.
  const featured = richestObject(graph.objects, spec.ownerObjectId);
  const featuredView = featured ? pingObjectToView(featured) : null;
  const cards =
    featured && featuredView ? (
      <div className="space-y-3">
        <ObjectCircle view={featuredView} />
        {featured.description?.trim() ? (
          <p className="text-sm leading-relaxed" style={{ color: theme.ink }}>
            {featured.description.trim()}
          </p>
        ) : null}
        <p className="text-xs" style={{ color: theme.ink, opacity: 0.6 }}>
          {featuredView.provenance.label}
        </p>
      </div>
    ) : null;

  // Validation status. An invalid spec never renders.
  if (!renderable) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-xl font-semibold">This site is temporarily unavailable</h1>
        <p className="mt-2 text-sm text-accent">
          The site specification did not pass validation, so nothing is
          rendered rather than rendering something wrong.
        </p>
        <ul className="mt-4 list-disc pl-5 text-sm">
          {findings
            .filter((f) => f.severity === "error")
            .map((f, i) => (
              <li key={i}>
                {f.path}: {f.message}
              </li>
            ))}
        </ul>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-xl font-semibold">This site is temporarily unavailable</h1>
        <p className="mt-2 text-sm text-accent">The specification has no pages.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl items-start gap-8 px-4 py-8 sm:px-6">
      <div className="min-w-0 flex-1">
        <SitePageView key={page.slug} page={page} ctx={ctx} />
      </div>
      {presence ? (
        <ObjectRail cards={cards} presence={presence} theme={theme} heading="Featured object" />
      ) : null}
    </div>
  );
}
