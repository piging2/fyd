"use client";

/**
 * Rail placement harness (client).
 *
 * Renders ONE PortalCircle in the chosen side rail of the representative
 * business page. Placement strategy only: the portal object itself is
 * reused as-is; engage/release is managed locally (click to engage,
 * close/Escape to release), and the live geometry is measured
 * (see metrics.ts) with an on-screen readout so screenshots carry the
 * evidence.
 *
 * NO BOTTOM PORTAL: when the rail rule returns "none" the portal is not
 * rendered at all. Narrow/mobile is a separate interaction problem; the
 * desktop portal is never shrunk into nonsense.
 *
 * Positioning: CSS-first (normal flow for static, position: sticky for
 * sticky). CSS anchor positioning was considered and skipped: the rail
 * lives inside a bounded container whose top is the hero and whose end
 * is above the footer, so plain flow/sticky already satisfies alignment
 * and release; a second positioning system adds nothing here.
 */

import * as React from "react";
import { PortalCircle } from "@/fyd/ui/portal-circle";
import type { PortalProjection } from "@/fyd/preview/types";
import { chooseRailSide, type RailSide } from "@/fyd/placement/rail-rule";
import { installRailMetrics, type RailMetrics } from "./metrics";
import {
  FixtureContent,
  FixtureFooter,
  FixtureHero,
  fixtureFor,
} from "./fixture";

export type RailSideParam = "left" | "right" | "auto";
export type RailMode = "static" | "sticky";

const CONTENT_MAX_W = 1200;
/** At or below this viewport width the side rail never renders. */
const MOBILE_MAX_W = 719;

interface RailClientProps {
  portal: PortalProjection;
  business: string;
  side: RailSideParam;
  mode: RailMode;
}

function formatMetrics(m: RailMetrics | null): string {
  if (!m) return "RAIL METRICS\nmeasuring...";
  const pb = m.portalBox
    ? `${m.portalBox.width}x${m.portalBox.height}@${m.portalBox.x},${m.portalBox.y}`
    : "null";
  return [
    "RAIL METRICS",
    `side=${m.side} mode=${m.mode}`,
    `content=${m.contentWidth}px left=${m.leftFree}px right=${m.rightFree}px`,
    `portal=${pb} overlap=${m.overlapPx}px hoverflow=${m.hOverflowPx}px`,
    `scrollY=${m.scrollY}`,
  ].join("\n");
}

export function RailClient({ portal, business, side, mode }: RailClientProps) {
  const fixture = fixtureFor(business);
  const objectId = portal.circle.id;
  const [engagedId, setEngagedId] = React.useState<string | null>(null);
  const [awareId, setAwareId] = React.useState<string | null>(null);
  const [resolvedSide, setResolvedSide] = React.useState<RailSide>(
    side === "auto" ? "right" : side,
  );
  const [metrics, setMetrics] = React.useState<RailMetrics | null>(null);
  const portalWrapRef = React.useRef<HTMLDivElement>(null);
  const sideRef = React.useRef<RailSide>(resolvedSide);
  sideRef.current = resolvedSide;

  // Resolve the rail side: forced sides render as-is for comparison
  // captures; auto measures the live margins and applies the rail rule.
  React.useEffect(() => {
    if (side !== "auto") {
      setResolvedSide(side);
      return;
    }
    const resolve = () => {
      const content = document.getElementById("rail-content");
      const chrome = document.getElementById("rail-readout");
      if (!content) return;
      const r = content.getBoundingClientRect();
      // The readout panel sits fixed at top-left; the left margin loses
      // its footprint so the portal never hides behind PING chrome.
      const chromeInset = chrome
        ? Math.max(0, chrome.getBoundingClientRect().right + 8)
        : 0;
      const leftFree = Math.max(0, r.left - chromeInset);
      const rightFree = Math.max(0, window.innerWidth - r.right);
      setResolvedSide(
        window.innerWidth <= MOBILE_MAX_W
          ? "none"
          : chooseRailSide(leftFree, rightFree),
      );
    };
    resolve();
    window.addEventListener("resize", resolve);
    return () => window.removeEventListener("resize", resolve);
  }, [side]);

  // Live measurement into window.__railMetrics + the on-screen readout.
  React.useEffect(() => {
    const handle = installRailMetrics(
      () => ({
        contentEl: document.getElementById("rail-content"),
        portalEl: portalWrapRef.current,
        chromeEl: document.getElementById("rail-readout"),
        side: sideRef.current,
        mode,
      }),
      setMetrics,
    );
    return () => handle.dispose();
  }, [mode]);

  if (!fixture) return null;

  const showRail = resolvedSide === "left" || resolvedSide === "right";
  const railStyle: React.CSSProperties =
    resolvedSide === "left"
      ? {
          left: 0,
          width: `max(0px, calc((100% - ${CONTENT_MAX_W}px) / 2))`,
        }
      : {
          right: 0,
          width: `max(0px, calc((100% - ${CONTENT_MAX_W}px) / 2))`,
        };

  const circle = (
    <div ref={portalWrapRef} className="pointer-events-auto">
      <PortalCircle
        portal={portal}
        slot={null}
        aware={awareId === objectId}
        engaged={engagedId === objectId}
        onAware={(id) => setAwareId(id)}
        onUnaware={(id) => setAwareId((cur) => (cur === id ? null : cur))}
        onEngageRequest={(id) => setEngagedId(id)}
        onRelease={(id) => setEngagedId((cur) => (cur === id ? null : cur))}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      {/* Rail region: bounded above the footer so a sticky rail releases
          at the region's end and never overlaps footer chrome. */}
      <div id="rail-region" className="relative">
        <FixtureHero fixture={fixture} />
        <FixtureContent fixture={fixture} />

        {showRail && (
          <div
            aria-label={`Portal side rail (${resolvedSide}, ${mode})`}
            className="pointer-events-none absolute inset-y-0"
            style={railStyle}
          >
            {mode === "sticky" ? (
              <div className="sticky top-24 flex justify-center">{circle}</div>
            ) : (
              <div className="flex justify-center pt-6">{circle}</div>
            )}
          </div>
        )}
      </div>

      <FixtureFooter fixture={fixture} />

      {/* On-screen readout: fixed top-left, monospace, semi-transparent.
          Its own footprint is subtracted from the left margin measurement. */}
      <div
        id="rail-readout"
        className="fixed left-2 top-2 z-50 max-w-[340px] whitespace-pre-wrap rounded bg-black/70 p-2 font-mono text-[10px] leading-tight text-lime-300"
      >
        {formatMetrics(metrics)}
      </div>
    </div>
  );
}
