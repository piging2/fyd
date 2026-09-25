"use client";

/**
 * PortalHost: mounts portal circles into safe peripheral space.
 *
 * Wiring: SemanticTargetResolver -> SpatialSlotManager ->
 * ContextObjectRanker -> AttentionController -> CircleProjection.
 *
 * - Wide viewports: collapsed circles fixed into the best peripheral
 *   band (right preferred, then left). Each circle's engaged diameter is
 *   clamped to the largest circle fitting its slot: host content is
 *   never occluded, by construction.
 * - Narrow viewports: no honest margin exists, so the circles render as an
 *   inline strip in the page flow (same Circle component, tap to engage).
 *   Per the placement directive (Nolan, 2026-09-21): NO BOTTOM PORTAL
 *   anywhere. The fixed dock branch collapses to null; the inline strip
 *   is document flow, not an overlay, so margins are never faked and
 *   content is never covered.
 *
 * Circle-Only Product Reset (2026-09-22): the host also owns two thin
 * event seams for the ONE global assistant. onAskRequest fires when a
 * circle's "Ask FYD" orbit control is pressed (the circle never opens a
 * per-circle ask view). onContextChange reports the currently
 * aware-or-engaged circle id so the assistant's context follows
 * hover/selection; null when no circle holds attention.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import {
  PEEK_D,
  createSlotManager,
  type PeripheralSlot,
} from "@/fyd/spatial/slot-manager";
import {
  proximityScore,
  resolveSemanticTargets,
} from "@/fyd/spatial/semantic-targets";
import { rankCandidates } from "@/fyd/rank/object-ranker";
import { AttentionController } from "@/fyd/attention/controller";
import { reconcileEngagementOnModeChange } from "@/fyd/placement/engagement-reconcile";
import { PortalCircle } from "./portal-circle";
import type { PortalProjection } from "@/fyd/preview/types";

interface Assignment {
  portal: PortalProjection;
  slot: PeripheralSlot | null;
  x: number;
  y: number;
  /** Collapsed circle diameter for this placement (64 band, 56 peek). */
  d: number;
  /** True when the circle is an edge peek (narrow band or mobile overlay). */
  peek: boolean;
}

interface PortalHostProps {
  portals: PortalProjection[];
  /** A circle's Ask FYD control was pressed: route to the ONE global assistant. */
  onAskRequest?: (id: string) => void;
  /** The aware-or-engaged circle changed (null = no circle holds attention). */
  onContextChange?: (id: string | null) => void;
}

export function PortalHost({ portals, onAskRequest, onContextChange }: PortalHostProps) {
  const [mounted, setMounted] = React.useState(false);
  const [slots, setSlots] = React.useState<PeripheralSlot[]>([]);
  const [awareId, setAwareId] = React.useState<string | null>(null);
  const [engagedId, setEngagedId] = React.useState<string | null>(null);
  const [followed, setFollowed] = React.useState<Record<string, boolean>>({});
  // Mobile overlay anchor: 30% of the initial viewport height, document
  // relative. The overlay is absolute in the document (not fixed), so it
  // scrolls away naturally with the page.
  const [overlayY] = React.useState(() =>
    Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * 0.3),
  );
  const controllerRef = React.useRef<AttentionController | null>(null);
  if (!controllerRef.current) controllerRef.current = new AttentionController();

  // Keep the latest callbacks in refs so the context effect never loops.
  const contextCbRef = React.useRef(onContextChange);
  contextCbRef.current = onContextChange;
  const askCbRef = React.useRef(onAskRequest);
  askCbRef.current = onAskRequest;

  React.useEffect(() => {
    setMounted(true);
    const mgr = createSlotManager((s) => {
      setSlots(s);
    });
    let cancelled = false;
    portals.forEach((p) => {
      fetch(`/api/fyd/follow?objectId=${encodeURIComponent(p.circle.id)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d && d.ok === true) {
            setFollowed((prev) => ({ ...prev, [p.circle.id]: !!d.following }));
          }
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      mgr.dispose();
      controllerRef.current?.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The ONE global assistant's context follows attention: engaged wins,
  // then aware, then null. Reported through a ref-held callback so the
  // parent never re-renders the host in a loop.
  React.useEffect(() => {
    contextCbRef.current?.(engagedId ?? awareId ?? null);
  }, [engagedId, awareId]);

  const assignments: Assignment[] = React.useMemo(() => {
    if (!mounted || portals.length === 0) return [];
    const usable = slots
      .filter((s) => s.capacity > 0)
      .sort((a, b) =>
        a.side === b.side ? 0 : a.side === "right" ? -1 : 1,
      );
    if (usable.length === 0) {
      // No usable slot anywhere. These assignments never render: desktop
      // fails closed to null and mobile uses the edge overlay. Kept
      // well-typed so reconcileEngagementOnModeChange still sees "none".
      return portals.map((portal, i) => ({ portal, slot: null, x: i, y: 0, d: 64, peek: false }));
    }
    const targets = resolveSemanticTargets();
    const targetById = new Map(targets.map((t) => [t.objectId, t]));
    const assigned = new Set<string>();
    const perSlotCount = new Map<string, number>();
    const out: Assignment[] = [];
    // Nolan 2026-09-25 margin directive, round 2: EVERY portal gets a margin
    // home. One portal per slot left the 3rd portal docked to null
    // (invisible) on desktop. Round-robin across usable rails until all
    // portals are placed; extras stack vertically inside their rail's band.
    // Per-slot semantic ranking is preserved: each round picks the best
    // remaining portal FOR that slot.
    for (let round = 0; assigned.size < portals.length; round++) {
      let placedThisRound = 0;
      for (const slot of usable) {
        const ranked = rankCandidates(
          portals
            .filter((p) => !assigned.has(p.circle.id))
            .map((p) => {
              const t = targetById.get(p.circle.id);
              return {
                objectId: p.circle.id,
                semanticProximity: proximityScore(t?.rect ?? null, slot.rect),
                followed: !!followed[p.circle.id],
                liked: false,
                capabilityCount: p.circle.capabilities.length,
                recentInteractionAt: null,
                slotStability: slot.stability,
                slotCollisionRisk: slot.collisionRisk,
              };
            }),
        );
        const winner = ranked[0];
        if (!winner) continue;
        assigned.add(winner.objectId);
        placedThisRound++;
        const portal = portals.find((p) => p.circle.id === winner.objectId);
        if (!portal) continue;
        const k = perSlotCount.get(slot.id) ?? 0;
        perSlotCount.set(slot.id, k + 1);
        let x: number;
        let y: number;
        let d = 64;
        let peek = false;
        if (slot.kind === "peek") {
          // Nolan 2026-09-25 margin directive, round 3: narrow desktop
          // bands (28..72px) host a 56px circle CENTERED ON THE SCREEN
          // EDGE. Only the in-band sliver shows (vis <= band width), so
          // host content is never overlapped. No inline strip on desktop.
          d = PEEK_D;
          peek = true;
          // Anchor the right peek to the LAYOUT width (excludes the classic
          // scrollbar), not the visual viewport: otherwise the scrollbar
          // covers the outer half of the sliver and the tappable target
          // shrinks to ~13px. The full 28px sliver stays clickable and the
          // circle stays inside the measured band.
          const layoutW =
            typeof document !== "undefined"
              ? document.documentElement.clientWidth
              : 1280;
          const vis = Math.min(PEEK_D / 2, slot.rect.width);
          x = slot.side === "left" ? vis - PEEK_D : layoutW - vis;
          y = Math.min(
            slot.rect.y + slot.rect.height * 0.26 + k * (PEEK_D + 14),
            slot.rect.y + Math.max(0, slot.rect.height - PEEK_D),
          );
        } else {
          // Pin the collapsed 64px circle to the EXTREME outer edge of its
          // band (viewport edge side), never centered. The outer edge is the
          // farthest point from host content, so extreme placement is also
          // the safest: the circle stays fully inside the measured band
          // (inset clamps to band width - 64), which by construction never
          // overlaps center content.
          const inset = Math.max(0, Math.min(12, slot.rect.width - 64));
          x =
            slot.side === "left"
              ? slot.rect.x + inset
              : slot.rect.x + slot.rect.width - 64 - inset;
          // Vertical stacking for round >= 1: first circle at 26% of band
          // height, each extra one circle + 16px gap below, clamped inside
          // the band so nothing escapes the measured safe rectangle.
          y = Math.min(
            slot.rect.y + slot.rect.height * 0.26 + k * (64 + 16),
            slot.rect.y + Math.max(0, slot.rect.height - 64),
          );
        }
        out.push({ portal, slot, x, y, d, peek });
      }
      if (placedThisRound === 0) break;
    }
    // Any portal without a slot joins the dock (renders null per the
    // no-bottom-portal directive; reachable only when ranking yields
    // nothing for every remaining portal).
    portals.forEach((portal, i) => {
      if (!assigned.has(portal.circle.id)) {
        out.push({ portal, slot: null, x: i, y: 0, d: 64, peek: false });
      }
    });
    return out;
  }, [mounted, slots, portals, followed]);

  const slotted = assignments.filter((a) => a.slot !== null);

  const handleEngageRequest = React.useCallback(
    (id: string) => {
      const c = controllerRef.current;
      if (!c) return;
      if (engagedId && engagedId !== id) {
        c.release(engagedId);
        setEngagedId(null);
      }
      if (c.requestPrimary(id)) {
        c.lock(id);
        setEngagedId(id);
        setAwareId(null);
      }
    },
    [engagedId],
  );

  const handleRelease = React.useCallback((id: string) => {
    const c = controllerRef.current;
    if (!c) return;
    c.unlock(id);
    c.release(id);
    setEngagedId((cur) => (cur === id ? null : cur));
  }, []);

  // Awareness (secondary) goes through the controller too: it is the
  // single authority for who holds primary vs secondary attention.
  const handleAware = React.useCallback((id: string) => {
    controllerRef.current?.setAware(id);
    setAwareId(id);
  }, []);

  const handleUnaware = React.useCallback((id: string) => {
    controllerRef.current?.clearAware(id);
    setAwareId((cur) => (cur === id ? null : cur));
  }, []);

  const handleAskRequest = React.useCallback((id: string) => {
    askCbRef.current?.(id);
  }, []);

  // Engagement/placement reconciliation (adaptive plane): the engaged
  // portal's placement mode is its peripheral slot id, or "none" when it
  // holds no safe slot. Docked portals render null per the no-bottom-portal
  // directive, so when the mode changes while engaged (slot lost or moved),
  // release engagement: the Circle collapses back to launcher state
  // instead of leaving a stale or invisible surface behind. Engagement
  // moving between Circles is a user action, not a geometry event, and is
  // never released here.
  const engagedSlotMode = engagedId
    ? (slotted.find((a) => a.portal.circle.id === engagedId)?.slot?.id ?? "none")
    : null;
  const prevPlacementRef = React.useRef<{
    engagedId: string;
    mode: string;
  } | null>(null);
  React.useEffect(() => {
    const next =
      engagedId && engagedSlotMode ? { engagedId, mode: engagedSlotMode } : null;
    const decision = reconcileEngagementOnModeChange(prevPlacementRef.current, next);
    prevPlacementRef.current = next;
    if (decision.releaseEngagedId) handleRelease(decision.releaseEngagedId);
  }, [engagedId, engagedSlotMode, handleRelease]);

  if (!mounted) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const isMobile = vw < 640;

  // Nolan 2026-09-25 margin directive, round 3: NO INLINE STRIP anywhere.
  // Mobile renders a floating edge overlay instead: a peek of each circle
  // at the right screen edge. The overlay is absolute in the document
  // (portaled to body), so it scrolls away naturally with the page: not
  // fixed chrome, not in-flow layout. Tap opens the sheet.
  if (isMobile && portals.length > 0 && typeof document !== "undefined") {
    return createPortal(
      <div
        data-ping-host
        data-ping-mobile-overlay
        role="list"
        aria-label="Featured businesses"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 0,
          zIndex: 40,
          pointerEvents: "none",
        }}
      >
        {portals.map((portal, i) => (
          <div
            key={portal.circle.id}
            role="listitem"
            data-ping-slot="mobile-edge"
            style={{
              position: "absolute",
              top: overlayY + i * (PEEK_D + 14),
              right: -(PEEK_D - 28),
              width: PEEK_D,
              height: PEEK_D,
              pointerEvents: "auto",
            }}
          >
            <PortalCircle
              portal={portal}
              slot={null}
              peek
              aware={awareId === portal.circle.id}
              engaged={engagedId === portal.circle.id}
              onAware={handleAware}
              onUnaware={handleUnaware}
              onEngageRequest={handleEngageRequest}
              onRelease={handleRelease}
              onAskRequest={handleAskRequest}
            />
          </div>
        ))}
      </div>,
      document.body,
    );
  }

  // Desktop with no usable slot on either side: fail closed and render
  // nothing. The inline strip is gone by directive; it would compete with
  // margins and shift layout.
  if (slotted.length === 0) return null;

  return (
    <>
      {slotted.map((a) => (
        <div
          key={a.portal.circle.id}
          className="fixed z-40"
          style={{ left: a.x, top: a.y, width: a.d, height: a.d }}
          data-ping-host
          data-ping-slot={a.slot?.id}
          data-ping-peek={a.peek ? "true" : undefined}
        >
          <div className="relative">
            <PortalCircle
              portal={a.portal}
              slot={a.slot}
              peek={a.peek}
              aware={awareId === a.portal.circle.id}
              engaged={engagedId === a.portal.circle.id}
              onAware={handleAware}
              onUnaware={handleUnaware}
              onEngageRequest={handleEngageRequest}
              onRelease={handleRelease}
              onAskRequest={handleAskRequest}
            />
          </div>
        </div>
      ))}
    </>
  );
}
