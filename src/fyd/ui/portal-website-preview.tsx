"use client";

import * as React from "react";
import { ExternalLink, Info, X, Maximize2 } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import type { PortalProjection } from "@/fyd/preview/types";
import { CRASH_BEACON_MESSAGE_TYPE } from "./storage-shim";
import { resolveObjectPresentationIdentity } from "@/fyd/presentation/identity";
import { isObjectDisplayContextValid, ObjectPlacementDisclosure, ObjectDiscoveryExplanation, type ObjectDisplayContext } from "@/fyd/presentation/object-context";

/**
 * Listens for the proxy-injected crash beacon (see storage-shim.ts): when the
 * embedded site dies from the unshimmable sandbox location-probe crash, the
 * iframe's beacon postMessages the parent and onCrash fires. The parent
 * validates event.source against its own iframe element; the opaque iframe
 * origin ("null") is expected and is never allow-listed by origin.
 */
function useEmbedCrashBeacon(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  onCrash: () => void,
) {
  const onCrashRef = React.useRef(onCrash);
  onCrashRef.current = onCrash;
  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== CRASH_BEACON_MESSAGE_TYPE) return;
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      onCrashRef.current();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeRef]);
}

/**
 * Graceful fallback shown when the embedded site cannot run inside the
 * sandboxed preview. Same promise as the /api/live fallback page: the live
 * site is one tap away in a new tab.
 */
export function EmbedCrashFallback({ name, href }: { name: string; href: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#171613] p-6 text-center">
      <div>
        <p className="text-sm font-semibold text-stone-200">Live preview unavailable</p>
        <p className="mx-auto mt-1 max-w-60 text-xs leading-relaxed text-stone-400">
          {name} cannot load inside this preview. Open the live site in a new tab instead.
        </p>
        <a href={href} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-white/10 px-4 text-xs font-semibold text-stone-100 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-honey">
          Open site <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/** Shared by the desktop expansion and mobile sheet; the asset stays intact. */
export function PortalWebsitePreview({ portal, href, displayContext, relationshipFeedback, className = "" }: {
  portal: PortalProjection;
  relationshipFeedback?: React.ReactNode;
  displayContext?: ObjectDisplayContext;
  href: string;
  className?: string;
}) {
  const [state, setState] = React.useState<"loading" | "loaded" | "slow" | "error">("loading");
  const [evidenceOpen, setEvidenceOpen] = React.useState(false);
  const { circle } = portal;
  const { mark: logo } = resolveObjectPresentationIdentity({ id: circle.id, name: circle.name, logo: portal.logo }, "dark");
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  // The sandboxed location-probe crash ("Application error" inside the
  // iframe) is unshimmable; the beacon reports it and we swap the dead iframe
  // for the graceful fallback instead.
  useEmbedCrashBeacon(iframeRef, () => setState("error"));
  React.useEffect(() => {
    setState("loading");
    const timer = setTimeout(() => setState((s) => s === "loading" ? "slow" : s), 12000);
    return () => clearTimeout(timer);
  }, [circle.id]);

  const presentationNow = Date.now();
  if (!isObjectDisplayContextValid(circle.id, displayContext, presentationNow)) return null;
  return (
    <div className={`flex min-h-0 flex-col overflow-hidden bg-[#171613] text-stone-100 ${className}`}>
      {displayContext?.sponsorship && <div className="shrink-0 px-3 pt-2"><ObjectPlacementDisclosure objectId={circle.id} context={displayContext} now={presentationNow} /></div>}
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
        {logo && <img src={logo.src} srcSet={logo.srcSet} alt="" aria-hidden="true" draggable={false}
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
        <ObjectDiscoveryExplanation objectId={circle.id} context={displayContext} now={presentationNow} />
      </div>}
      <div className="relative min-h-0 flex-1 bg-white">
        {state === "error" ? (
          <EmbedCrashFallback name={circle.name} href={href} />
        ) : (
          <iframe ref={iframeRef} src={`/api/live/${encodeURIComponent(circle.id)}`}
            title={`${circle.name} website preview`}
            sandbox="allow-scripts allow-forms allow-popups"
            onLoad={() => setState("loaded")} onError={() => setState("error")}
            className="absolute inset-0 h-full w-full border-0 bg-white" />
        )}
        {state === "loading" && <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#171613] text-xs text-stone-300">
          Loading website…
        </div>}
      </div>
      {relationshipFeedback && <div className="max-h-28 shrink-0 overflow-y-auto border-t border-white/10">{relationshipFeedback}</div>}
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
  displayContext,
  relationshipFeedback,
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
  relationshipFeedback?: React.ReactNode;
  displayContext?: ObjectDisplayContext;
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
  const { mark } = resolveObjectPresentationIdentity({ id: circle.id, name: circle.name, logo: portal.logo }, "dark");
  const reduceMotion = useReducedMotion();
  const [loaded, setLoaded] = React.useState(false);
  const [crashed, setCrashed] = React.useState(false);
  const [slow, setSlow] = React.useState(false);
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  // A crashed background iframe would show "Application error" through the
  // overlay; drop it and keep the neutral backdrop instead.
  useEmbedCrashBeacon(iframeRef, () => setCrashed(true));
  const driftOn = drift && !reduceMotion;
  React.useEffect(() => {
    setLoaded(false);
    setCrashed(false);
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(timer);
  }, [circle.id]);

  const presentationNow = Date.now();
  if (!isObjectDisplayContextValid(circle.id, displayContext, presentationNow)) return null;
  return (
    <div className={`fyd-object-sheet relative h-full w-full overflow-hidden bg-neutral-950 text-white ${className}`}>
      <style>{`
        @keyframes fyd-drift {
          0% { transform: scale(1.02) translate(0, 0); }
          50% { transform: scale(1.14) translate(-2.2%, 1.8%); }
          100% { transform: scale(1.02) translate(0, 0); }
        }
        .fyd-drift { animation: fyd-drift 26s ease-in-out 1; }
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
          animation: fyd-sheen 1.4s ease-out 1;
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
          box-shadow: 0 0 0 1px rgba(255,255,255,0.35), 0 6px 16px rgba(0,0,0,0.35);
        }
        .fyd-shiny-btn::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(100deg, transparent 25%, rgba(255,255,255,0.7) 50%, transparent 75%);
          transform: translateX(-130%);
          animation: fyd-btn-sheen 1.4s ease-out 1;
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
        /* Container queries: the sheet's own width drives typography and
           spacing, so a small object on a wide desktop never gets oversized
           viewport-based type. Identity and close controls stay stable;
           secondary content adapts. */
        .fyd-object-sheet { container-type: inline-size; container-name: fyd-sheet; }
        @container fyd-sheet (min-width: 420px) {
          .fyd-sheet-pad { padding: 1.25rem; }
          .fyd-sheet-title { font-size: 2.25rem; }
          .fyd-sheet-sub { font-size: 0.875rem; }
          .fyd-sheet-actions { gap: 0.75rem; }
        }
        @container fyd-sheet (max-width: 419px) {
          .fyd-sheet-title { font-size: 1.7rem; }
        }
      `}</style>

      {/* Live site, full-bleed, drifting. Non-interactive: the overlay owns taps. */}
      <div className={driftOn ? "fyd-drift absolute inset-0" : "absolute inset-0"} aria-hidden="true">
        {!crashed && (
          <iframe
            ref={iframeRef}
            src={`/api/live/${encodeURIComponent(circle.id)}`}
            title=""
            tabIndex={-1}
            sandbox="allow-scripts allow-forms allow-popups"
            onLoad={() => setLoaded(true)}
            onError={() => setCrashed(true)}
            className="pointer-events-none border-0 bg-neutral-900"
            style={{ position: "absolute", inset: "-6%", width: "112%", height: "112%" }}
          />
        )}
      </div>
      {/* Non-blocking load status: the object identity and actions in the
          overlay above remain visible and tappable while the site loads.
          pointer-events-none + no opaque backdrop = loading never blocks
          useful object interaction. */}
      {!loaded && !crashed && !slow && (
        <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/60 px-4 py-2 text-xs tracking-wide text-stone-300 backdrop-blur-sm">
            Loading website…
          </span>
        </div>
      )}

      {/* Overlay: big bold outlined shiny text + buttons over the live site. */}
      <div
        className="absolute inset-0 flex flex-col overflow-y-auto overscroll-contain"
        onClick={onExpand}
      >
        <div className="fyd-sheet-pad flex shrink-0 items-start justify-between gap-3 bg-gradient-to-b from-black/65 to-transparent p-4">
          <div className="min-w-0 pt-1">
            <ObjectPlacementDisclosure objectId={circle.id} context={displayContext} now={presentationNow} />
            {mark && <img src={mark.src} srcSet={mark.srcSet} alt="" aria-hidden="true" draggable={false}
              className="mb-2 h-12 w-16 object-contain"
              style={{ background: "transparent", borderRadius: 0, filter: "drop-shadow(0 3px 4px rgba(0,0,0,.25))" }} />}
            <p className="fyd-shiny-text fyd-sheet-title text-3xl font-black leading-[1.05]">{title}</p>
            {subtitle ? <p className="fyd-shiny-sub fyd-sheet-sub mt-1.5 text-[13px] font-semibold">{subtitle}</p> : null}
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
              data-object-close
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              aria-label={`Close ${title}`}
              className="fyd-glass-btn flex h-12 w-12 items-center justify-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-6 flex-1" />

        <div className="shrink-0 px-4 pb-3" onClick={(event) => event.stopPropagation()}>
          {relationshipFeedback && <div className="mb-2 rounded-lg bg-black/75">{relationshipFeedback}</div>}
          {(crashed || (slow && !loaded)) && <p role="status" className="mb-2 rounded-lg bg-black/75 px-3 py-2 text-xs text-stone-200">
            Website preview unavailable. {portal.websiteHref && <a href={portal.websiteHref} target="_blank" rel="noopener noreferrer" className="underline">Open site</a>}
          </p>}
          <details className="rounded-lg bg-black/75 px-3 text-xs text-stone-200">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 focus-visible:outline-2 focus-visible:outline-honey"><Info size={14} aria-hidden="true" /> About this object</summary>
            <div className="max-h-28 overflow-y-auto pb-3 leading-relaxed">
              {circle.tagline && <p className="mb-2">{circle.tagline}</p>}
              {circle.topFacts.length > 0 && <p className="mb-2">{circle.topFacts.slice(0, 3).join(" · ")}</p>}
              <p>{circle.provenanceLabel}</p>
              {circle.provenanceDetail && <p className="mt-1 break-words text-stone-300">{circle.provenanceDetail}</p>}
              <ObjectDiscoveryExplanation objectId={circle.id} context={displayContext} now={presentationNow} />
            </div>
          </details>
        </div>

        {actions && (
          <div
            className="fyd-sheet-actions flex shrink-0 flex-wrap items-center justify-center gap-2.5 bg-gradient-to-t from-black/65 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
