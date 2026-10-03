"use client";

import * as React from "react";
import { ExternalLink, Info, X, Maximize2 } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import type { PortalProjection } from "@/fyd/preview/types";

/** Shared by the desktop expansion and mobile sheet; the asset stays intact. */
export function PortalWebsitePreview({ portal, href, className = "" }: {
  portal: PortalProjection;
  href: string;
  className?: string;
}) {
  const [state, setState] = React.useState<"loading" | "loaded" | "slow" | "error">("loading");
  const [evidenceOpen, setEvidenceOpen] = React.useState(false);
  const { circle, logo } = portal;
  React.useEffect(() => {
    setState("loading");
    const timer = setTimeout(() => setState((s) => s === "loading" ? "slow" : s), 12000);
    return () => clearTimeout(timer);
  }, [circle.id]);

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden bg-[#171613] text-stone-100 ${className}`}>
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
        {logo && <img src={logo.src} alt="" aria-hidden="true" draggable={false}
          className="h-9 w-12 shrink-0 object-contain"
          style={{ background: "transparent", borderRadius: 0, filter: "drop-shadow(0 3px 4px rgba(0,0,0,.25))" }} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold" title={circle.name}>{circle.name}</p>
          <p className="truncate text-[11px] text-stone-400">{new URL(href).hostname.replace(/^www\./, "")}</p>
        </div>
        <button type="button" onClick={() => setEvidenceOpen((v) => !v)}
          aria-label="About this object" aria-expanded={evidenceOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-honey">
          <Info size={17} aria-hidden="true" />
        </button>
      </header>
      {evidenceOpen && <div className="max-h-28 shrink-0 overflow-y-auto border-b border-white/10 px-3 py-3 text-xs leading-relaxed text-stone-300">
        <p>{circle.provenanceLabel}</p>
        {circle.provenanceDetail && <p className="mt-1 break-words text-stone-400">{circle.provenanceDetail}</p>}
      </div>}
      <div className="relative min-h-0 flex-1 bg-white">
        <iframe src={`/api/live/${encodeURIComponent(circle.id)}`}
          title={`${circle.name} website preview`}
          sandbox="allow-scripts allow-forms allow-popups"
          onLoad={() => setState("loaded")} onError={() => setState("error")}
          className="absolute inset-0 h-full w-full border-0 bg-white" />
        {state === "loading" && <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#171613] text-xs text-stone-300">
          Loading website…
        </div>}
      </div>
      <footer className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-t border-white/10 px-3 py-1.5 text-[11px] text-stone-400">
        <span role="status">{state === "slow" || state === "error" ? "Preview unavailable?" : "Website preview"}</span>
        <a href={href} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-8 items-center gap-1 text-stone-200 hover:text-white focus-visible:outline-2 focus-visible:outline-honey">
          Open site <ExternalLink size={12} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}

/**
 * ImmersiveWebsiteView: Nolan 2026-10-02.
 *
 * The live website fills the ENTIRE popup. The live view slowly DRIFTS
 * (gentle Ken Burns pan/zoom) behind big, bold, OUTLINED (never drop
 * shadow), animated, bright, shiny text and buttons overlaid on top.
 *
 * Overlay text always uses a high-contrast outline per the standing
 * 2026-10-02 logo-overlay directive. prefers-reduced-motion: no drift,
 * no sheen; the content stays fully readable and tappable.
 */
export function ImmersiveWebsiteView({
  portal,
  title,
  subtitle,
  actions,
  onClose,
  onExpand,
  expandLabel = "Expand to full screen",
  className = "",
  drift = true,
}: {
  portal: PortalProjection;
  title: string;
  subtitle?: string | null;
  /** Action buttons rendered over the live site (bottom). Null hides the row. */
  actions?: React.ReactNode;
  onClose: () => void;
  /** When set, tapping the preview (or the expand button) calls it. */
  onExpand?: () => void;
  expandLabel?: string;
  className?: string;
  drift?: boolean;
}) {
  const { circle } = portal;
  const reduceMotion = useReducedMotion();
  const [loaded, setLoaded] = React.useState(false);
  const driftOn = drift && !reduceMotion;

  return (
    <div className={`relative h-full w-full overflow-hidden bg-neutral-950 text-white ${className}`}>
      <style>{`
        @keyframes fyd-drift {
          0% { transform: scale(1.02) translate(0, 0); }
          50% { transform: scale(1.14) translate(-2.2%, 1.8%); }
          100% { transform: scale(1.02) translate(0, 0); }
        }
        .fyd-drift { animation: fyd-drift 26s ease-in-out infinite; will-change: transform; }
        @keyframes fyd-sheen {
          0% { background-position: -220% center; }
          100% { background-position: 220% center; }
        }
        .fyd-shiny-text {
          background: linear-gradient(100deg, #fff8e1 12%, #ffd970 36%, #ffffff 50%, #ffd970 64%, #fff8e1 88%);
          background-size: 220% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          -webkit-text-stroke: 1.5px rgba(26, 15, 4, 0.92);
          animation: fyd-sheen 6s linear infinite;
        }
        .fyd-shiny-sub {
          color: #fff;
          -webkit-text-stroke: 0.8px rgba(20, 12, 4, 0.9);
          paint-order: stroke fill;
          letter-spacing: 0.02em;
        }
        .fyd-shiny-btn {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          background: linear-gradient(135deg, #ffedb0 0%, #f7c04a 45%, #dd941f 100%);
          color: #241503;
          animation: fyd-btn-glow 3.4s ease-in-out infinite;
        }
        .fyd-shiny-btn::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(100deg, transparent 25%, rgba(255,255,255,0.7) 50%, transparent 75%);
          transform: translateX(-130%);
          animation: fyd-btn-sheen 3.4s ease-in-out infinite;
          pointer-events: none;
        }
        .fyd-shiny-btn > * { position: relative; z-index: 2; }
        @keyframes fyd-btn-sheen {
          0% { transform: translateX(-130%); }
          55%, 100% { transform: translateX(130%); }
        }
        @keyframes fyd-btn-glow {
          0%, 100% { box-shadow: 0 0 0 1px rgba(255,255,255,0.35), 0 10px 26px rgba(0,0,0,0.5); }
          50% { box-shadow: 0 0 0 1px rgba(255,255,255,0.6), 0 10px 34px rgba(247,192,74,0.4); }
        }
        .fyd-glass-btn {
          background: rgba(12, 10, 8, 0.55);
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
          box-shadow: 0 0 0 1px rgba(255,255,255,0.28), 0 8px 22px rgba(0,0,0,0.45);
        }
        @media (prefers-reduced-motion: reduce) {
          .fyd-drift, .fyd-shiny-text, .fyd-shiny-btn, .fyd-shiny-btn::after { animation: none !important; }
        }
      `}</style>

      {/* Live site, full-bleed, drifting. Non-interactive: the overlay owns taps. */}
      <div className={driftOn ? "fyd-drift absolute inset-0" : "absolute inset-0"} aria-hidden="true">
        <iframe
          src={`/api/live/${encodeURIComponent(circle.id)}`}
          title=""
          tabIndex={-1}
          sandbox="allow-scripts allow-forms allow-popups"
          onLoad={() => setLoaded(true)}
          className="pointer-events-none border-0 bg-neutral-900"
          style={{ position: "absolute", inset: "-6%", width: "112%", height: "112%" }}
        />
      </div>
      {!loaded && (
        <div role="status" className="absolute inset-0 flex items-center justify-center bg-neutral-950 text-xs tracking-wide text-stone-300">
          Loading live site…
        </div>
      )}

      {/* Overlay: big bold outlined shiny text + buttons over the live site. */}
      <div
        className="absolute inset-0 flex flex-col"
        onClick={onExpand}
        role={onExpand ? "button" : undefined}
        aria-label={onExpand ? expandLabel : undefined}
        tabIndex={onExpand ? 0 : undefined}
        onKeyDown={onExpand ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onExpand(); } } : undefined}
      >
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
          <div className="min-w-0 pt-1">
            <p className="fyd-shiny-text text-3xl font-black leading-[1.05] sm:text-4xl">{title}</p>
            {subtitle ? <p className="fyd-shiny-sub mt-1.5 text-[13px] font-semibold sm:text-sm">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 gap-2">
            {onExpand && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onExpand(); }}
                aria-label={expandLabel}
                className="fyd-glass-btn flex h-12 w-12 items-center justify-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
              >
                <Maximize2 size={19} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              aria-label={`Close ${title}`}
              className="fyd-glass-btn flex h-12 w-12 items-center justify-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1" />

        {actions && (
          <div
            className="flex flex-wrap items-center justify-center gap-2.5 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 sm:gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
