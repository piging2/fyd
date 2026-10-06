"use client";

/**
 * MarginObjectLayer: ONE page-level document-anchored object plane.
 * (Nolan, 2026-09-22: "Margins Are the Object Layer"; objects are
 * document/section-anchored, never viewport-sticky.)
 *
 * DOCUMENT PLANE + OBJECT PLANE. Objects are never inserted into the
 * document; they live in ONE document-anchored plane rendered via
 * createPortal into document.body: an absolutely positioned div with
 * height = document height. Slots sit at position:absolute at their
 * document-space Y, so objects scroll WITH the page. Publisher content
 * geometry is invariant to the layer's presence: absolute elements are
 * out of flow and the layer adds no height of its own.
 *
 * - Anchoring: each object tracks a document anchor
 *   ([data-object-anchor="<key>"]); candidate Y = the anchor midpoint
 *   in DOCUMENT space (rect.top + scrollY + rect.height/2).
 * - Placement: deterministic placeObjects() (see ./placement), all in
 *   document space: clamp to document bounds, resolve collisions with
 *   minimum vertical spacing, merge overflow into clusters (each cluster
 *   renders its members as a staggered constellation of mini-circles).
 * - Expansion: the compact object card (300x400 vertical oval) and Ask
 *   mode (300x460 vertical oval), each document-space clamped for its own
 *   size, anchored to their object in document space. They move WITH
 *   the page on scroll. Never viewport-clamped.
 * - One-expanded: shared claim registry (./expansion) across circles,
 *   cluster popovers, and the mobile sheet.
 * - Relationship navigation: the layer subscribes to navigate requests
 *   (./expansion): collapse the current card, scroll the target slot
 *   into view when it is offscreen, then open it through the
 *   open-request bus.
 *
 * Measurement (useDocumentLayout): anchor document-Y values, document
 * height, and viewport width. Recomputed ONLY on: initial mount, window
 * resize, document.fonts.ready, window load, one delayed re-measure
 * ~1200ms after mount (late images), and a MutationObserver on
 * document.body (childList + subtree + class/style attributes,
 * rAF-throttled, ignoring mutations inside the layer's own node).
 * NEVER on scroll: document-space anchors are scroll-invariant, and
 * there is no scroll listener anywhere in this path. Responsive
 * breakpoint changes are covered by resize.
 *
 * Responsive policy (functional, not polish; Nolan 2026-09-25
 * edge-placement directive):
 * - desktop (>=1024px): fit-gated dual margins. A rail is used only
 *   when the measured free margin actually fits the glyph; when both
 *   fit, placements round-robin across left + right so the margins
 *   flank the content. Margins are never faked; the layer never
 *   overlaps center content.
 * - tablet (768-1023): compact edge rail (40px rest) when it fits.
 * - mobile (<768): NO overlay chrome. Objects render in-flow as
 *   cards/sections via the renderer composition: visible, tappable
 *   (44px+ targets), never hidden, never overlaid.
 * No debug flag in the production path.
 *
 * SSR / pre-measure shell: an absolute empty layer. Zero layout impact:
 * absolute elements are out of flow, so center geometry cannot change.
 *
 * Generic: descriptors only. Zero customer-specific code.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import {
  distributeBalanced,
  flipCardX,
  placeObjects,
  type AnchorInput,
  type Placed,
  type Rail,
} from "./placement";
import {
  CIRCLE_MOTION,
  ClusterSlot,
  MarginObject,
  PEEK_H,
  PEEK_W,
  REST_D,
} from "./ObjectCircle";
import { claimExpanded, requestObjectOpen, subscribeNavigateRequest } from "./expansion";
import type { MotionTokens } from "@/fyd/sitespec/types";
import type { AskPageContext, MarginObjectDescriptor } from "./types";

export type { MarginObjectDescriptor };

const WIDE_MIN = 1400;
const DESKTOP_MIN = 1024;
const TABLET_MIN = 768;

/** Compact rest diameter for the tablet edge rail. */
const EDGE_REST_D = 40;

/**
 * Document-edge offset of the rail per width band (preserves the
 * 2026-09-24 wide-desktop geometry: 24px at >=1400, 12px at
 * 1024-1399, 8px on the tablet edge).
 */
function railOffsetForWidth(vw: number): number {
  if (vw >= WIDE_MIN) return 24;
  if (vw >= DESKTOP_MIN) return 12;
  return 8;
}

/**
 * Fit-gated rail selection (Nolan 2026-09-25 edge-placement directive).
 * A rail is used only when the measured free margin actually fits the
 * glyph: margins are never faked, and the layer never overlaps center
 * content. Desktop (>=1024) uses both rails when both fit (the caller
 * round-robins placements across them so the margins flank the
 * content); tablet (768-1023) keeps the compact right edge rail when
 * it fits; mobile (<768) uses no overlay rail at all: objects render
 * in-flow as cards/sections via the renderer composition, never
 * hidden, never overlaid. When the content column is unmeasurable,
 * falls back to the legacy rail assignment.
 */
function railsForWidth(
  vw: number,
  leftFree: number,
  rightFree: number,
  measurable: boolean,
): Rail[] {
  if (vw < TABLET_MIN) return [];
  if (!measurable) {
    if (vw >= WIDE_MIN) return ["right", "left"];
    return ["right"];
  }
  const restD = vw >= DESKTOP_MIN ? REST_D : EDGE_REST_D;
  const need = railOffsetForWidth(vw) + restD;
  if (vw >= DESKTOP_MIN) {
    const rails: Rail[] = [];
    if (rightFree >= need) rails.push("right");
    if (leftFree >= need) rails.push("left");
    return rails;
  }
  return rightFree >= need ? ["right"] : [];
}

/** Truthful data-projection label for the layer plane. */
function projectionLabel(vw: number, rails: Rail[]): string {
  if (vw < TABLET_MIN) return "mobile";
  if (rails.length === 2) return "dual";
  if (rails.length === 1) return vw < DESKTOP_MIN ? "edge" : "single";
  return "none";
}

/**
 * 18:47 sparsity (Nolan 2026-09-25): objects that share one section anchor
 * spread deterministically around the anchor instead of collapsing into a
 * single cluster. Very far apart is acceptable; anchoring stays near the
 * contextual section. Pure and deterministic: same inputs, same spread.
 */
const SHARED_ANCHOR_SPREAD_PX = 140;

/** Exported for the ui test suite (sparsity pin, Nolan 2026-09-25). */
export function spreadSharedAnchors<
  T extends {
    objectId: string;
    anchorKey: string;
    anchorMidY: number | null;
    priority: number;
  },
>(items: T[]): (T & { spreadY: number | null })[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const g = groups.get(it.anchorKey);
    if (g) g.push(it);
    else groups.set(it.anchorKey, [it]);
  }
  const out: (T & { spreadY: number | null })[] = [];
  for (const [, g] of groups) {
    g.sort(
      (a, b) =>
        a.priority - b.priority ||
        (a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0),
    );
    const baseY = g[0].anchorMidY;
    g.forEach((it, idx) => {
      out.push({
        ...it,
        spreadY:
          baseY == null || it.anchorMidY == null
            ? null
            : baseY + (idx - (g.length - 1) / 2) * SHARED_ANCHOR_SPREAD_PX,
      });
    });
  }
  return out;
}

interface DocumentLayout {
  vw: number;
  docH: number;
  anchors: Record<string, number | null>;
  /**
   * Content-column bounds (viewport-relative X, whole px): the union of
   * [data-fyd-section] rects, falling back to the anchor elements.
   * Infinity/-Infinity when nothing measurable is present.
   */
  contentLeft: number;
  contentRight: number;
}

/**
 * Measures anchor document-Y values, document height, and viewport
 * width. Re-runs on resize, font load, window load, once ~1200ms after
 * mount (late images), and on body DOM mutations (rAF-throttled,
 * ignoring the layer's own node). NOT on scroll. Returns null until the
 * first client measurement (SSR renders the empty shell).
 */
function useDocumentLayout(anchorKeys: string[]): {
  layout: DocumentLayout | null;
  layerRef: React.RefObject<HTMLDivElement>;
} {
  const keysKey = anchorKeys.join("|");
  const layerRef = React.useRef<HTMLDivElement>(null);
  const [layout, setLayout] = React.useState<DocumentLayout | null>(null);

  React.useEffect(() => {
    let disposed = false;
    let raf = 0;
    // Signature of the last published measurement: identical layouts
    // never re-render (mutation storms from page animations coalesce).
    let lastSig = "";
    const keys = keysKey.split("|").filter(Boolean);
    const measure = () => {
      if (disposed) return;
      raf = 0;
      const scrollY = window.scrollY;
      const anchors: Record<string, number | null> = {};
      // Content-column bounds (viewport-relative X): the union of the
      // section rects, so the free margins are honest. Anchors seed the
      // bounds; the full [data-fyd-section] set overrides when present
      // (anchors only cover sections that have margin objects).
      let contentLeft = Infinity;
      let contentRight = -Infinity;
      const noteBounds = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        if (r.left < contentLeft) contentLeft = r.left;
        if (r.right > contentRight) contentRight = r.right;
      };
      for (const k of keys) {
        const el = document.querySelector(`[data-object-anchor="${CSS.escape(k)}"]`);
        if (!el) {
          anchors[k] = null;
          continue;
        }
        const r = el.getBoundingClientRect();
        // Document-space midpoint: scroll-invariant.
        anchors[k] = r.top + scrollY + r.height / 2;
        noteBounds(el);
      }
      const sectionEls = document.querySelectorAll("[data-fyd-section]");
      if (sectionEls.length > 0) {
        contentLeft = Infinity;
        contentRight = -Infinity;
        sectionEls.forEach(noteBounds);
      }
      const vw = window.innerWidth;
      const docH = document.documentElement.scrollHeight;
      const cL = Math.round(contentLeft);
      const cR = Math.round(contentRight);
      const sig = `${vw}|${docH}|${cL}|${cR}|${keys.map((k) => anchors[k]).join(",")}`;
      if (sig !== lastSig) {
        lastSig = sig;
        setLayout({ vw, docH, anchors, contentLeft: cL, contentRight: cR });
      }
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("load", schedule);
    const t = window.setTimeout(measure, 1200);
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fonts?.ready) {
      fonts.ready.then(() => measure()).catch(() => {});
    }
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const node = m.target as Node;
        // Ignore the layer's own subtree: its renders must not
        // re-trigger measurement.
        if (layerRef.current && (node === layerRef.current || layerRef.current.contains(node))) {
          continue;
        }
        schedule();
        break;
      }
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("load", schedule);
      window.clearTimeout(t);
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysKey]);

  return { layout, layerRef };
}

/**
 * Viewport-edge margin for expanded cards (compact object card and Ask
 * mode). The expanded card carries a drop shadow and an ornate gold
 * border; both must stay fully inside the viewport. The horizontal clamp
 * keeps the whole card this far from the viewport edge, so the card never
 * reads as cut off at the edge it grows from.
 */
export const CARD_EDGE_MARGIN = 24;

/**
 * Pure horizontal clamp for an expanded card: given the slot's
 * document-space x and the card width, returns the card's document-space
 * left edge so the full card stays within
 * [CARD_EDGE_MARGIN, viewportW - CARD_EDGE_MARGIN]. Prefers the
 * slot-anchored position, so on the right rail the card grows inward
 * (leftward) from the rail and never pushes past the viewport edge.
 * Exported for regression tests.
 */
export function clampCardX(slotX: number, cardW: number, viewportW: number): number {
  return Math.min(
    Math.max(slotX, CARD_EDGE_MARGIN),
    Math.max(CARD_EDGE_MARGIN, viewportW - CARD_EDGE_MARGIN - cardW),
  );
}

/**
 * Pure: choose the context anchor from observed intersection ratios.
 * Highest ratio wins; ties break by observation order (first wins).
 * Null when no anchor intersects. Kept pure so the deterministic
 * selection rule is unit-testable; the hook only feeds it ratios.
 */
export function strongestAnchor(ratios: ReadonlyMap<string, number>): string | null {
  let best: string | null = null;
  let bestRatio = 0;
  for (const [k, r] of ratios) {
    if (r > bestRatio) {
      best = k;
      bestRatio = r;
    }
  }
  return best;
}

/**
 * Context-aware Circle (Nolan, 2026-09-22 FYD grill): the Circle follows
 * the viewer's current object. Watches the [data-object-anchor]
 * elements with one IntersectionObserver over the viewport's middle
 * band; the anchor with the strongest intersection becomes the context
 * anchor. Sticky: when nothing intersects (between sections), the last
 * context holds. Returns the context anchor key, or null.
 *
 * No scroll listener: IntersectionObserver is the only mechanism, and
 * it only ever sets state when the context actually changes.
 */
export function useContextAnchor(anchorKeys: string[]): string | null {
  const [active, setActive] = React.useState<string | null>(null);
  const keysKey = anchorKeys.filter(Boolean).join("|");
  React.useEffect(() => {
    const keys = keysKey.split("|").filter(Boolean);
    if (keys.length === 0) return;
    const els = new Map<string, Element>();
    for (const k of keys) {
      const el = document.querySelector(`[data-object-anchor="${CSS.escape(k)}"]`);
      if (el) els.set(k, el);
    }
    if (els.size === 0) return;
    const ratios = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const e of entries) {
          for (const [k, el] of els) {
            if (el === e.target) {
              ratios.set(k, e.isIntersecting ? e.intersectionRatio : 0);
              changed = true;
            }
          }
        }
        if (changed) {
          // Sticky: only promote a real intersection; never clear to
          // null just because the band is momentarily empty.
          const best = strongestAnchor(ratios);
          if (best) setActive(best);
        }
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysKey]);
  return active;
}

export function MarginObjectLayer({
  objects,
  motion,
}: {
  objects: MarginObjectDescriptor[];
  /**
   * The Circle's MotionTokens profile (Nolan, 2026-09-22 FYD grill).
   * Defaults to CIRCLE_MOTION (SUBTLE). Reduced motion always wins and
   * collapses decorative motion to instant.
   */
  motion?: MotionTokens;
}) {
  const idsKey = objects.map((o) => o.objectId).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const anchorKeys = React.useMemo(() => objects.map((o) => o.anchorKey), [idsKey]);
  const { layout, layerRef } = useDocumentLayout(anchorKeys);

  // Fit-gated rails (see railsForWidth): the actual placement rails,
  // derived from the measured content-column margins. The label is the
  // responsive band for the data-projection test hook.
  const rails: Rail[] = React.useMemo(() => {
    if (!layout) return [];
    const measurable =
      Number.isFinite(layout.contentLeft) &&
      Number.isFinite(layout.contentRight) &&
      layout.contentRight > layout.contentLeft;
    const leftFree = measurable ? layout.contentLeft : Infinity;
    const rightFree = measurable ? layout.vw - layout.contentRight : Infinity;
    return railsForWidth(layout.vw, leftFree, rightFree, measurable);
  }, [layout]);
  const projection: string | null = layout ? projectionLabel(layout.vw, rails) : null;
  const projectionRef = React.useRef(projection);
  projectionRef.current = projection;

  // Relationship navigation: collapse the current card, scroll the
  // target slot into view when it is offscreen, then open it through
  // the open-request bus (single slot or cluster member). Mobile: no
  // slots exist (in-flow cards own the doorway), so the open request
  // goes straight through with no claim juggling and no scrolling.
  React.useEffect(
    () =>
      subscribeNavigateRequest((objectId) => {
        if (projectionRef.current === "mobile") {
          requestObjectOpen(objectId);
          return;
        }
        claimExpanded(null);
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const openTarget = () => requestObjectOpen(objectId);
        let el = document.querySelector(`[data-object-id="${CSS.escape(objectId)}"]`);
        if (!el) {
          const clusters = document.querySelectorAll("[data-member-ids]");
          for (const c of clusters) {
            const ids = (c.getAttribute("data-member-ids") || "").split(/\s+/).filter(Boolean);
            if (ids.includes(objectId)) {
              el = c;
              break;
            }
          }
        }
        if (!el) {
          openTarget(); // unknown id: the open bus no-ops downstream
          return;
        }
        const target = el as HTMLElement;
        const r = target.getBoundingClientRect();
        const vh = window.innerHeight;
        if (r.bottom >= 0 && r.top <= vh) {
          openTarget();
          return;
        }
        target.scrollIntoView({
          block: "center",
          behavior: reducedMotion ? "auto" : "smooth",
        });
        window.setTimeout(openTarget, reducedMotion ? 60 : 500);
      }),
    [],
  );

  const placed = React.useMemo<Placed[]>(() => {
    if (!layout || rails.length === 0) return [];
    const inputs: AnchorInput[] = spreadSharedAnchors(
      objects.map((o) => ({
        objectId: o.objectId,
        anchorKey: o.anchorKey,
        anchorMidY: layout.anchors[o.anchorKey] ?? null,
        priority: o.priority,
      })),
    ).map((sd) => ({
      objectId: sd.objectId,
      anchorMidY: sd.spreadY,
      priority: sd.priority,
    }));
    const restD = layout.vw >= DESKTOP_MIN ? REST_D : EDGE_REST_D;
    const vp = { viewportWidth: layout.vw, documentHeight: layout.docH };
    const baseOpts = {
      restDiameter: restD,
      minSpacing: restD + 16,
      edgePadding: 12,
      clusterWindow: 72,
    };
    if (rails.length === 2) {
      // Dual-margin directive: round-robin across rails so the left and
      // right margins both flank the content, instead of filling the
      // preferred rail and leaving the other empty. Per-rail placement
      // keeps collision resolution, clustering, and the never-overlap
      // invariant.
      const parts = distributeBalanced(inputs, rails, layout.docH);
      return rails.flatMap((rail) =>
        placeObjects(parts.get(rail) ?? [], vp, { ...baseOpts, rails: [rail] }),
      );
    }
    return placeObjects(inputs, vp, { ...baseOpts, rails });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, rails, idsKey]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const byId = React.useMemo(() => new Map(objects.map((o) => [o.objectId, o])), [idsKey]);

  /**
   * Document-space card position relative to the slot wrapper's origin.
   * The card moves WITH the page on scroll; it is never
   * viewport-clamped. x flips inward from the rail (see flipCardX in
   * ./placement) so the expanded card never grows past the viewport
   * edge; y is clamped to the document bounds. No scrolling introduced.
   */
  const placeCard = React.useCallback(
    (
      slotX: number,
      slotW: number,
      rail: Rail,
      slotTop: number,
      docY: number,
      cardW: number,
      cardH: number,
    ): React.CSSProperties => {
      if (!layout) return {};
      const { cardX } = flipCardX(slotX, slotW, rail, cardW, layout.vw, CARD_EDGE_MARGIN);
      const cardY = Math.min(
        Math.max(docY - cardH / 2, 12),
        Math.max(12, layout.docH - 12 - cardH),
      );
      return { left: cardX - slotX, top: cardY - slotTop };
    },
    [layout],
  );

  // Context-aware Circle: which object the viewer is currently reading.
  // (anchorKeys is derived once above for the document layout pass.)
  const contextAnchorKey = useContextAnchor(anchorKeys);
  const contextObjectId = React.useMemo(() => {
    if (!contextAnchorKey) return null;
    const found = objects.find((o) => o.anchorKey === contextAnchorKey);
    return found ? found.objectId : null;
  }, [contextAnchorKey, objects]);
  const askContext: AskPageContext = React.useMemo(
    () => ({
      visibleObjectIds: objects.map((o) => o.objectId),
      contextObjectId,
    }),
    [objects, contextObjectId],
  );

  if (!layout || !projection || rails.length === 0) {
    // SSR / pre-measure shell, the mobile band, and any band whose
    // margins are too narrow to fit a glyph: absolute empty layer. Zero
    // document impact: absolute elements are out of flow, so center
    // geometry cannot change. On mobile the objects render in-flow as
    // cards/sections via the renderer composition; the layer adds no
    // overlay chrome (Nolan 2026-09-25 edge-placement directive:
    // in-flow cards, never hidden, never overlaid).
    return (
      <div
        data-testid="object-layer"
        data-projection={projection ?? undefined}
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          overflowX: "clip",
          overflowY: "visible",
          pointerEvents: "none",
          zIndex: 50,
        }}
      />
    );
  }

  const restD = layout.vw >= DESKTOP_MIN ? REST_D : EDGE_REST_D;
  const offset = railOffsetForWidth(layout.vw);
  const slotX = (rail: Rail) => (rail === "right" ? layout.vw - offset - restD : offset);

  // ONE page-level document-anchored plane. Absolutely no
  // position:fixed in this path, no scroll listener, no
  // viewport-relative anchor coordinates.
  return createPortal(
    <div
      ref={layerRef}
      data-testid="object-layer"
      data-projection={projection}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: layout.docH,
        overflowX: "clip",
        overflowY: "visible",
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <style>{`[data-fyd-anchor-active="true"]{outline:2px solid rgba(124,92,214,0.45);outline-offset:3px;border-radius:6px;}/* Object continuity (./view-transitions): only NAMED shared elements animate. The default whole-page crossfade is disabled so transitions serve EXPAND/ENTER/EXIT semantics only, never decoration. */::view-transition-old(root),::view-transition-new(root){animation:none;}::view-transition-group(*){animation-duration:180ms;animation-timing-function:ease-out;}/* Peek skeleton pulse. Disabled under prefers-reduced-motion. */@keyframes fyd-skeleton{0%{opacity:.45}50%{opacity:1}100%{opacity:.45}}@media (prefers-reduced-motion:reduce){[data-fyd-skeleton]{animation:none!important;opacity:.7}}`}</style>
      {placed.map((p) => {
        const x = slotX(p.rail);
        const slotTop = p.y - restD / 2;
        const slotStyle: React.CSSProperties = {
          left: x,
          top: slotTop,
          width: restD,
          height: restD,
        };
        // Peek popover (content-sized up to PEEK_W wide; PEEK_H is the
        // placement budget): the same document-space placement math,
        // flipped inward from the rail for its size. The workspace
        // sheet is viewport-fixed in its own portal, not placed here.
        const peekStyle = placeCard(x, restD, p.rail, slotTop, p.y, PEEK_W, PEEK_H);
        if (p.kind === "single") {
          const d = byId.get(p.objectId);
          if (!d) return null;
          return (
            <MarginObject
              key={p.objectId}
              descriptor={d}
              slotStyle={slotStyle}
              peekStyle={peekStyle}
              restD={restD}
              contextActive={d.objectId === contextObjectId}
              rail={p.rail}
              motionProfile={motion}
              askContext={askContext}
            />
          );
        }
        const members = p.objectIds
          .map((id) => byId.get(id))
          .filter((m): m is MarginObjectDescriptor => !!m);
        if (members.length === 0) return null;
        // Cluster slot: the members render as a staggered constellation
        // of mini-circles (see ./star-layout); tapping a member opens its
        // compact object card, document-space clamped like a single slot.
        return (
          <ClusterSlot
            key={p.clusterId}
            clusterId={p.clusterId}
            members={members}
            slotStyle={slotStyle}
            peekStyleFor={() => peekStyle}
            align={p.rail === "left" ? "left" : "right"}
            askContext={askContext}
            motionProfile={motion}
          />
        );
      })}
    </div>,
    document.body,
  );
}
