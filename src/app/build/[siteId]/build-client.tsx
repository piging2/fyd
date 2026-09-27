"use client";

/**
 * LANE-8: BuildClient, the generic composition shell for /build/[siteId].
 *
 * Consumes ONLY the ProjectedSiteView: the page server component resolves
 * the viewer class and projects the compiled artifacts through
 * projectForViewer. The shell never sees raw state.
 *
 * Visitor: the composed page. No validator findings, no object rail,
 * no owner entry point.
 * Owner: the visitor page plus exactly one "Customize with FYD" entry
 * point (OwnerEntryPoint; lane 9 builds the conversational UX behind
 * it). The OwnerPanel conversational and digest machinery is
 * engineer-only.
 * Engineer: the current debug material (raw findings, the featured-object
 * rail, the full owner panel with digest lines).
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
import { FydMotionFallback } from "@/fyd/components/fyd-motion-fallback";
import { FydViewportProvider } from "@/fyd/components/viewport";
import type {
  FYDSiteSpec,
  ObjectGraph,
  ObjectPresence,
  ViewerContext,
} from "@/fyd/sitespec/types";
import { OwnerEntryPoint, OwnerPanel } from "./owner-panel";
import type { ProjectedSiteView } from "@/fyd/sitespec/render-projection";

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

export function BuildClient({ view }: { view: ProjectedSiteView }) {
  const { spec, graph, findings, renderable, siteId, viewerKind } = view;
  const isEngineer = viewerKind === "engineer";
  const ctx = useMemo(
    () => ({
      spec,
      graph,
      viewer: VIEWER,
      siteId,
      heroMedia: view.heroMedia,
      galleryMedia: view.galleryMedia,
      objectMedia: view.objectMedia,
      viewerKind,
    }),
    [spec, graph, siteId, view.heroMedia, view.galleryMedia, view.objectMedia, viewerKind],
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

  // Validation status. An invalid spec never renders. Non-engineers see a
  // generic message; only engineers see the raw findings.
  if (!renderable) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-xl font-semibold">This site is temporarily unavailable</h1>
        <p className="mt-2 text-sm text-accent">
          The site specification did not pass validation, so nothing is
          rendered rather than rendering something wrong.
        </p>
        {isEngineer ? (
          <ul className="mt-4 list-disc pl-5 text-sm">
            {findings
              .filter((f) => f.severity === "error")
              .map((f, i) => (
                <li key={i}>
                  {f.path}: {f.message}
                </li>
              ))}
          </ul>
        ) : null}
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
      {/* Scroll-entrance fallback: arms only when reduced motion is not
          requested and CSS scroll timelines are unsupported. */}
      <FydMotionFallback />
      {/*
        Viewport capabilities: resolves width class, pointer, hover, and
        safe-area after mount; stamps data attributes for CSS-driven
        layout projection (same object, different projection per device)
        and exposes useViewport() for behavioral choices. SSR renders the
        compact baseline, so there is no hydration mismatch.
      */}
      <FydViewportProvider>
        <div className="min-w-0 flex-1">
          <SitePageView key={page.slug} page={page} ctx={ctx} />
        </div>
      </FydViewportProvider>
      {/* LANE-8: the object rail is debug material (work-order removal
          list: "object-rail debug UI"). Engineer projection only. */}
      {isEngineer && presence ? (
        <ObjectRail cards={cards} presence={presence} theme={theme} heading="Featured object" />
      ) : null}
      {/* LANE-8: the ONE owner affordance. The engineer gets the full
          conversational and digest machinery; the verified owner gets
          exactly one "Customize with FYD" entry point (lane 9 builds the
          conversational UX behind it). Visitors get neither. */}
      {view.showOwnerEntry && siteId ? (
        isEngineer ? (
          <OwnerPanel siteId={siteId} viewerKind={viewerKind} />
        ) : (
          <OwnerEntryPoint />
        )
      ) : null}
    </div>
  );
}
