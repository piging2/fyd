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
 * Responsive policy (functional, not polish):
 * - wide desktop (>=1400px): two object rails (left + right)
 * - normal desktop (1024-1399): one preferred rail + overflow clustering
 * - tablet (768-1023): compact edge rail (40px rest)
 * - mobile (<768): no object chrome at all in the customer-facing
 *   experience (2026-09-23 product direction, binding). The page is a
 *   composition of individually interactive objects; there is no
 *   object bucket, no floating tab, no drawer in primary UX.
 *   A generic object explorer survives only as an internal/debug
 *   surface behind ?objectDebug=1.
 *
 * SSR / pre-measure shell: an absolute empty layer. Zero layout impact:
 * absolute elements are out of flow, so center geometry cannot change.
 *
 * Generic: descriptors only. Zero customer-specific code.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import {
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
import { MobileSheet } from "./MobileSheet";
import { claimExpanded, requestObjectOpen, subscribeNavigateRequest } from "./expansion";
import type { MotionTokens } from "@/fyd/sitespec/types";
import type { AskPageContext, MarginObjectDescriptor } from "./types";

export type { MarginObjectDescriptor };

const WIDE_MIN = 1400;
const DESKTOP_MIN = 1024;
const TABLET_MIN = 768;

type Projection = "dual" | "single" | "edge" | "mobile";

function projectionForWidth(w: number): Projection {
  if (w >= WIDE_MIN) return "dual";
  if (w >= DESKTOP_MIN) return "single";
  if (w >= TABLET_MIN) return "edge";
  return "mobile";
}

/** Compact rest diameter for the tablet edge rail. */
const EDGE_REST_D = 40;
/** Document-edge offset of the rail per projection. */
const RAIL_OFFSET: Record<Exclude<Projection, "mobile">, number> = {
  dual: 24,
  single: 12,
  edge: 8,
};

interface DocumentLayout {
  vw: number;
  docH: number;
  anchors: Record<string, number | null>;
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
      for (const k of keys) {
        const el = document.querySelector(`[data-object-anchor="${CSS.escape(k)}"]`);
        if (!el) {
          anchors[k] = null;
          continue;
        }
        const r = el.getBoundingClientRect();
        // Document-space midpoint: scroll-invariant.
        anchors[k] = r.top + scrollY + r.height / 2;
      }
      const vw = window.innerWidth;
      const docH = document.documentElement.scrollHeight;
      const sig = `${vw}|${docH}|${keys.map((k) => anchors[k]).join(",")}`;
      if (sig !== lastSig) {
        lastSig = sig;
        setLayout({ vw, docH, anchors });
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
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const projection: Projection | null = layout ? projectionForWidth(layout.vw) : null;
  const projectionRef = React.useRef(projection);
  projectionRef.current = projection;

  // Relationship navigation: collapse the current card, scroll the
  // target slot into view when it is offscreen, then open it through
  // the open-request bus (single slot, cluster member, or sheet card).
  // Mobile projection: the sheet owns the card, so select it directly
  // with no claim juggling and no scrolling.
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
    if (!layout || !projection || projection === "mobile") return [];
    const inputs: AnchorInput[] = objects.map((o) => ({
      objectId: o.objectId,
      anchorMidY: layout.anchors[o.anchorKey] ?? null,
      priority: o.priority,
    }));
    const restD = projection === "edge" ? EDGE_REST_D : REST_D;
    const rails: Rail[] = projection === "dual" ? ["right", "left"] : ["right"];
    return placeObjects(
      inputs,
      { viewportWidth: layout.vw, documentHeight: layout.docH },
      {
        restDiameter: restD,
        minSpacing: restD + 16,
        edgePadding: 12,
        clusterWindow: 72,
        rails,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, projection, idsKey]);

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

  if (!layout || !projection) {
    // SSR / pre-measure shell: absolute empty layer. Zero document
    // impact: absolute elements are out of flow, so center geometry
    // cannot change.
    return (
      <div
        data-testid="object-layer"
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

  if (projection === "mobile") {
    // 2026-09-23 product direction (binding): the page is a composition
    // of individually interactive objects. No object bucket, no floating
    // tab, no drawer in the customer-facing mobile experience. The
    // explorer sheet survives only as an internal/debug surface behind
    // ?objectDebug=1.
    const debug =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("objectDebug") === "1";
    if (!debug) return null;
    return (
      <>
        {!sheetOpen && (
          <div data-testid="object-layer" data-projection="mobile" className="px-4 py-6">
            <button
              type="button"
              data-testid="mobile-object-tab"
              onClick={() => {
                claimExpanded("sheet");
                setSheetOpen(true);
              }}
              aria-label={`Debug: open object explorer (${objects.length} objects).`}
              className="flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl px-5 py-4 font-mono text-xs text-white"
              style={{
                background: "rgba(20,16,10,0.92)",
                boxShadow: "0 0 0 1px rgba(232,180,90,0.55)",
              }}
            >
              <span>DEBUG object explorer ({objects.length})</span>
            </button>
          </div>
        )}
        {sheetOpen && <MobileSheet objects={objects} onClose={() => setSheetOpen(false)} />}
      </>
    );
  }

  const restD = projection === "edge" ? EDGE_REST_D : REST_D;
  const offset = RAIL_OFFSET[projection];
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
