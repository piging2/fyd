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
 * - Narrow viewports: no honest margin exists, so no portal renders.
 *   Per the placement directive (Nolan, 2026-09-21): NO BOTTOM PORTAL
 *   anywhere. The dock branch collapses to null; margins are never faked
 *   and mobile placement is a separate interaction problem.
 */

import * as React from "react";
import {
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
}

export function PortalHost({ portals }: { portals: PortalProjection[] }) {
  const [mounted, setMounted] = React.useState(false);
  const [slots, setSlots] = React.useState<PeripheralSlot[]>([]);
  const [awareId, setAwareId] = React.useState<string | null>(null);
  const [engagedId, setEngagedId] = React.useState<string | null>(null);
  const [followed, setFollowed] = React.useState<Record<string, boolean>>({});
  const controllerRef = React.useRef<AttentionController | null>(null);
  if (!controllerRef.current) controllerRef.current = new AttentionController();

  React.useEffect(() => {
    setMounted(true);
    const mgr = createSlotManager(setSlots);
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

  const assignments: Assignment[] = React.useMemo(() => {
    if (!mounted || portals.length === 0) return [];
    const usable = slots
      .filter((s) => s.capacity > 0)
      .sort((a, b) =>
        a.side === b.side ? 0 : a.side === "right" ? -1 : 1,
      );
    if (usable.length === 0) {
      // Dock mode: no honest margin. Compact circles, bottom edge.
      return portals.map((portal, i) => ({ portal, slot: null, x: i, y: 0 }));
    }
    const targets = resolveSemanticTargets();
    const targetById = new Map(targets.map((t) => [t.objectId, t]));
    const assigned = new Set<string>();
    const out: Assignment[] = [];
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
      const portal = portals.find((p) => p.circle.id === winner.objectId);
      if (!portal) continue;
      out.push({
        portal,
        slot,
        x: slot.rect.x + (slot.rect.width - 64) / 2,
        y: slot.rect.y + slot.rect.height * 0.26,
      });
    }
    // Any portal without a slot joins the dock.
    portals.forEach((portal, i) => {
      if (!assigned.has(portal.circle.id)) {
        out.push({ portal, slot: null, x: i, y: 0 });
      }
    });
    return out;
  }, [mounted, slots, portals, followed]);

  const docked = assignments.filter((a) => a.slot === null);
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

  return (
    <>
      {slotted.map((a) => (
        <div
          key={a.portal.circle.id}
          className="fixed z-40"
          style={{ left: a.x, top: a.y }}
          data-ping-host
          data-ping-slot={a.slot?.id}
        >
          <div className="relative">
            <PortalCircle
              portal={a.portal}
              slot={a.slot}
              aware={awareId === a.portal.circle.id}
              engaged={engagedId === a.portal.circle.id}
              onAware={handleAware}
              onUnaware={handleUnaware}
              onEngageRequest={handleEngageRequest}
              onRelease={handleRelease}
            />
          </div>
        </div>
      ))}

      {/* Placement directive (Nolan, 2026-09-21): NO BOTTOM PORTAL anywhere.
          The dock branch collapses to null. A portal with no safe side
          margin is not rendered at all; narrow/mobile placement is a
          separate interaction problem and never becomes a bottom overlay
          covering customer content. */}
      {docked.length > 0 ? null : null}
    </>
  );
}
