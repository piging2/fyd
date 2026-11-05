"use client";

/**
 * Client wrapper for the loop collector (lane B4; DESIGN.md
 * component D). Mounted ONLY around a sponsored placement on the
 * loop surface, only when the loop flag is on: organic items never
 * mount it, so an organic render carries no collector markup, no
 * observer, and no event traffic.
 *
 * The wrapper is an unstyled block div: no class, no style, no new
 * visual language. It exists to give IntersectionObserver a target
 * and clicks a capture point. Host feeding follows the rank README:
 * IntersectionObserver samples plus document visibility, with a
 * dwell re-check timer, because the tracker's rule (50 percent
 * visible, foreground, one continuous second) needs a second sample
 * after the dwell even when nothing on screen changes.
 *
 * Activation time uses Date.now(), not the DOM event's timeStamp:
 * the ledger compares occurredAt against decision windows in epoch
 * milliseconds, and event timeStamp is relative to the document's
 * time origin, not the epoch.
 */

import * as React from "react";
import type { ObjectEventContext } from "../rank/object-events";
import { createAdsCollector, type AdsCollector } from "./collector";

const DWELL_RECHECK_MS = 1100;

export function AdsSponsoredCollector({
  context,
  children,
}: {
  /** Serializable event context for the sponsored placement. */
  context: ObjectEventContext;
  children: React.ReactNode;
}) {
  const targetRef = React.useRef<HTMLDivElement>(null);
  const collectorRef = React.useRef<AdsCollector | null>(null);
  if (!collectorRef.current) {
    collectorRef.current = createAdsCollector({ context });
  }

  React.useEffect(() => {
    const target = targetRef.current;
    const collector = collectorRef.current;
    if (!target || !collector) return;
    let lastFraction = 0;
    let lastRendered = false;
    let recheck: ReturnType<typeof setTimeout> | null = null;

    const sample = () => {
      collector.observe({
        at: Date.now(),
        rendered: lastRendered,
        visibleFraction: lastFraction,
        documentVisible: document.visibilityState === "visible",
      });
    };
    const scheduleRecheck = () => {
      if (recheck !== null) return;
      recheck = setTimeout(() => {
        recheck = null;
        sample();
        // The tracker emits at most once; keep re-checking only
        // while the placement stays at or over the threshold.
        if (lastRendered && lastFraction >= 0.5) scheduleRecheck();
      }, DWELL_RECHECK_MS);
    };

    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                lastRendered = entry.isIntersecting;
                lastFraction = entry.intersectionRatio;
                sample();
                if (lastRendered && lastFraction >= 0.5) scheduleRecheck();
              }
            },
            { threshold: [0, 0.5, 1] },
          )
        : null;
    if (observer) observer.observe(target);
    else {
      // No observer support: report the mount as the only sample.
      // The dwell rule still cannot be met from a single sample, so
      // nothing is emitted; the loop under-reports rather than
      // over-claims an impression.
      lastRendered = true;
      lastFraction = 1;
      sample();
    }
    document.addEventListener("visibilitychange", sample);
    return () => {
      if (observer) observer.disconnect();
      document.removeEventListener("visibilitychange", sample);
      if (recheck !== null) clearTimeout(recheck);
    };
  }, []);

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const collector = collectorRef.current;
    if (!collector) return;
    collector.click({
      isTrusted: event.nativeEvent.isTrusted,
      // A keyboard activation of a link surfaces as a click with
      // detail 0; pointer activations carry a positive detail.
      kind: event.detail === 0 ? "keyboard" : "pointer",
      at: Date.now(),
      interactionId:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : "interaction-" + Date.now().toString(36),
    });
  };

  return (
    <div
      ref={targetRef}
      data-fyd-ads-collector={context.sponsorship?.placementId ?? ""}
      onClickCapture={handleClickCapture}
    >
      {children}
    </div>
  );
}
