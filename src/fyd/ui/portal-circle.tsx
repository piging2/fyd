"use client";

/**
 * PortalCircle: the PING circle as a portal-grade margin object.
 *
 * The ONE Circle primitive for the PING homepage (Circle-Only Product Reset,
 * 2026-09-22). One physical object, no teleport:
 * - rest:    64px circle (56px edge peek on narrow bands / mobile overlay).
 *            The website preview (or logo/gradient) fills it.
 *            Almost static; PING chrome almost absent.
 * - aware:   hover/focus proximity. Rim wakes, spring to 112px, slight
 *            luminance lift, name hint. Media prewarms for engage.
 * - engaged: the circle expands spatially from its exact origin to
 *            SIZE = f(available safe rectangle), clamped 200..480px.
 *            The website preview becomes legible; perimeter controls
 *            (Follow, Like, Ask FYD, Web) appear around the rim. The host
 *            page is never covered: the diameter is clamped to the largest
 *            circle fitting inside the assigned peripheral slot.
 *
 * Ask FYD is NOT per-circle. The "Ask FYD" orbit control hands the circle's
 * identity to the ONE global assistant (see ../ui/global-ask-dock.tsx) via
 * the onAskRequest callback; it never opens an in-circle ask view. There is
 * exactly one assistant for the entire experience; the Circle is discovery.
 *
 * Motion: transform + opacity only, framer-motion springs harvested from
 * src/motion/motionTokens.ts. prefers-reduced-motion: instant opacity
 * swap, capability fully retained.
 *
 * Security: every external href rendered here is validated https-only.
 * Embedded websites stay sandboxed and do not grant FYD capabilities.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import {
  Info,
  ExternalLink,
  Heart,
  MessageCircleQuestion,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { spring } from "@/motion/motionTokens";
import { ImmersiveWebsiteView, PortalWebsitePreview } from "./portal-website-preview";
import { compactEngagedDiameter, portalOriginTransform, type PortalOrigin } from "./portal-motion";
import type { PeripheralSlot } from "@/fyd/spatial/slot-manager";
import { PEEK_D, engagedGeometryFor, type EngagedSide } from "@/fyd/spatial/slot-manager";
import { focalToObjectPosition } from "@/fyd/preview/focal";
import { isSafeWebHref } from "@/fyd/preview/types";
import type { PortalProjection } from "@/fyd/preview/types";
import {
  executeFollow,
  executeLike,
  hasCapability,
  openWebsite,
} from "@/fyd/capabilities/runtime";

const COLLAPSED_D = 64;
const AWARE_D = 112;

interface PortalCircleProps {
  portal: PortalProjection;
  /** Assigned peripheral slot (viewport coords), or null in dock mode. */
  slot: PeripheralSlot | null;
  dock?: boolean;
  /**
   * Edge-peek placement: a 56px circle centered on the screen edge (narrow
   * desktop bands, mobile overlay). Tap opens the sheet; there is no
   * spatial expansion because no safe footprint exists.
   */
  peek?: boolean;
  aware: boolean;
  engaged: boolean;
  onAware: (id: string) => void;
  onUnaware: (id: string) => void;
  onEngageRequest: (id: string) => void;
  onRelease: (id: string) => void;
  /**
   * The circle's "Ask FYD" control calls this with the circle id instead of
   * opening a per-circle ask view. The host routes it to the ONE global
   * assistant, which adopts this circle as its context.
   */
  onAskRequest: (id: string) => void;
}

const rimRest =
  "0 0 0 1px rgba(255,255,255,0.16), 0 0 22px rgba(232,180,90,0.16), 0 10px 28px rgba(0,0,0,0.45)";
const rimAware =
  "0 0 0 1px rgba(255,255,255,0.32), 0 0 34px rgba(232,180,90,0.34), 0 10px 28px rgba(0,0,0,0.45)";

export function PortalCircle(props: PortalCircleProps) {
  const { portal, slot, aware, engaged } = props;
  const id = portal.circle.id;
  const reduceMotion = useReducedMotion();
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [following, setFollowing] = React.useState<boolean | null>(null);
  const [liked, setLiked] = React.useState<boolean | null>(null);
  const followInFlight = React.useRef(false);
  const likeInFlight = React.useRef(false);
  const [showEvidence, setShowEvidence] = React.useState(false);
  const [center, setCenter] = React.useState<{ x: number; y: number } | null>(null);
  const [engagedD, setEngagedD] = React.useState(320);
  const [origin, setOrigin] = React.useState<PortalOrigin | null>(null);
  const suppressAwareness = React.useRef(false);
  // Mobile two-stage popup (Nolan 2026-10-02): narrow viewports cannot
  // honestly hold the circle+orbit footprint, so the first tap opens a
  // compact object popup that never takes up the screen; a second tap
  // (expand button or the preview) blows up to full screen. Same identity,
  // same actions, no forced geometry.
  const [popupStage, setPopupStage] = React.useState<"compact" | "full" | null>(null);
  const [engagedSide, setEngagedSide] = React.useState<EngagedSide>("dock");
  const [orbitPad, setOrbitPad] = React.useState(26);
  const [orbitBtn, setOrbitBtn] = React.useState(44);

  const canFollow = hasCapability(portal, "follow");
  const canLike = hasCapability(portal, "like");
  const canAsk = hasCapability(portal, "ask");
  const webHref = portal.websiteHref && isSafeWebHref(portal.websiteHref) ? portal.websiteHref : null;

  const springSnap = { type: "spring", ...spring.snappy } as const;
  const springGentle = { type: "spring", ...spring.gentle } as const;
  const instant = { duration: 0.01 } as const;
  const txSnap = reduceMotion ? instant : springSnap;
  const txGentle = reduceMotion ? instant : springGentle;

  // Follow / like state: fetched once, fail closed.
  React.useEffect(() => {
    let cancelled = false;
    if (canFollow) {
      fetch(`/api/fyd/follow?objectId=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d && d.ok === true) setFollowing(!!d.following);
        })
        .catch(() => {});
    }
    if (canLike) {
      fetch(`/api/fyd/like?objectId=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d && d.ok === true) setLiked(!!d.liked);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [id, canFollow, canLike]);

  // Prewarm the engaged image on proximity: REST -> NEAR -> PREWARM -> HOVER -> EXPAND.
  React.useEffect(() => {
    if (aware && portal.preview) {
      const img = new Image();
      img.decoding = "async";
      img.src = portal.preview.src;
    }
  }, [aware, portal.preview]);

  // Directive mapping: the engaged diameter IS the immersive-margin state:
  // the largest circle fitting the safe peripheral rect, computed by
  // engagedGeometryFor from the button's live position. There is no
  // separate immersive mode; engaged geometry and the immersive margin
  // are the same state.
  const beginEngage = React.useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    // Directive (Nolan, 2026-09-22, refined 2026-10-02): do not force
    // desktop spatial behavior onto mobile. Below 640px the first tap opens
    // the compact popup stage; the circle+orbit expansion stays a desktop
    // treatment. Edge peeks (round 3: narrow desktop bands, mobile overlay)
    // also open the compact popup: no safe footprint exists for spatial
    // expansion there.
    if (window.innerWidth < 640 || props.peek) {
      setPopupStage("compact");
      props.onEngageRequest(id);
      return;
    }
    const r = el.getBoundingClientRect();
    setOrigin({ x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height });
    // Full-footprint geometry: the orbit controls extend beyond the circle,
    // so the engaged size and center account for the whole footprint.
    // Null means no safe geometry: use the compact sheet instead.
    const g = engagedGeometryFor(
      { width: window.innerWidth, height: window.innerHeight },
      slot,
      { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    );
    if (!g) {
      setPopupStage("compact");
      props.onEngageRequest(id);
      return;
    }
    setPopupStage(null);
    setCenter({ x: g.cx, y: g.cy });
    // Nolan 2026-10-02: the first click expands a SMALLER object, never a
    // page-filling panel. Clamp the engaged diameter to the compact
    // first-stage size around the same center.
    setEngagedD(compactEngagedDiameter(g.d));
    setEngagedSide(g.side);
    setOrbitPad(g.orbitPad);
    setOrbitBtn(g.orbitBtn);
    props.onEngageRequest(id);
  }, [id, slot, props]);

  const release = props.onRelease;
  const ask = props.onAskRequest;
  const closePortal = React.useCallback(() => {
    setPopupStage(null);
    setShowEvidence(false);
    release(id);
  }, [id, release]);
  const closeAndFocus = React.useCallback(() => {
    closePortal();
    suppressAwareness.current = true;
    requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }));
  }, [closePortal]);
  const askFromPortal = React.useCallback((objectId: string) => {
    closePortal();
    ask(objectId);
  }, [ask, closePortal]);

  // Parent release (another object, Escape, or placement change) also
  // dismisses the mobile popup. Local state never keeps a stale popup open.
  React.useEffect(() => {
    if (!engaged) {
      setPopupStage(null);
      setShowEvidence(false);
    }
  }, [engaged]);

  React.useEffect(() => {
    if (!engaged) return;
    const onScroll = () => { if (!popupStage) closePortal(); };
    let t: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (t) clearTimeout(t);
      t = setTimeout(closePortal, 200);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAndFocus();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      if (t) clearTimeout(t);
    };
  }, [engaged, popupStage, closePortal, closeAndFocus]);

  const toggleFollow = async () => {
    if (following === null || followInFlight.current) return;
    followInFlight.current = true;
    try { setFollowing(await executeFollow(id, following)); }
    finally { followInFlight.current = false; }
  };

  const toggleLike = async () => {
    if (liked === null || likeInFlight.current) return;
    likeInFlight.current = true;
    try { setLiked(await executeLike(id, liked)); }
    finally { likeInFlight.current = false; }
  };

  const preview = portal.preview;
  const focalPos = preview ? focalToObjectPosition({ x: preview.focalX, y: preview.focalY }) : "50% 30%";
  // Nolan 2026-10-02: an owner-supplied logo (irregular cutout) wins over
  // the preview photo in the collapsed mark and renders with NO badge
  // background, so the cutout's own edge is the visible shape.
  const ownerLogo = portal.logo?.ownerSupplied ? portal.logo : null;
  const collapsedBg = ownerLogo ? (
    <img
      src={ownerLogo.src}
      alt=""
      aria-hidden="true"
      decoding="async"
      className="fyd-owner-mark absolute inset-0 h-full w-full object-contain"
      // Drop-shadow follows the irregular cutout edge (no circular rim).
      style={{
        filter: aware
          ? "drop-shadow(0 14px 22px rgba(0,0,0,0.55))"
          : "drop-shadow(0 8px 14px rgba(0,0,0,0.4))",
        transition: "filter 180ms ease",
      }}
    />
  ) : preview ? (
    <img
      src={preview.thumbSrc}
      srcSet={preview.srcSet}
      sizes="72px"
      alt=""
      aria-hidden="true"
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover"
      style={{ objectPosition: focalPos }}
    />
  ) : portal.logo ? (
    <img
      src={portal.logo.src}
      alt=""
      aria-hidden="true"
      decoding="async"
      className="absolute inset-0 h-full w-full bg-white object-contain p-2"
    />
  ) : (
    <span
      aria-hidden="true"
      className="absolute inset-0 flex items-center justify-center text-xl font-bold text-white"
      style={{ background: "radial-gradient(circle at 35% 30%, #8a6f4d, #4a3f30)" }}
    >
      {portal.circle.name.trim().charAt(0).toUpperCase()}
    </span>
  );

  const D = props.peek ? PEEK_D : COLLAPSED_D;
  const scale = aware && !engaged ? AWARE_D / D : 1;

  return (
    <>
      {/* Nolan 2026-10-02: owner marks rock on hover. Pure CSS; the
          framer-motion circle transform stays untouched. */}
      <style>{`
        @keyframes fyd-owner-rock {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-4deg); }
          50% { transform: rotate(3deg); }
          75% { transform: rotate(-1deg); }
        }
        .fyd-portal-trigger:is(:hover, :focus-visible) .fyd-owner-mark {
          animation: fyd-owner-rock 0.6s ease-in-out;
          transform-origin: 50% 80%;
        }
        @media (prefers-reduced-motion: reduce) {
          .fyd-portal-trigger:is(:hover, :focus-visible) .fyd-owner-mark { animation: none; }
        }
      `}</style>
      <motion.button
        ref={buttonRef}
        type="button"
        aria-label={`${portal.circle.name}, ${portal.circle.category ?? "business"}. Activate to expand.`}
        aria-expanded={engaged}
        aria-haspopup="dialog"
        tabIndex={engaged ? -1 : 0}
        onMouseEnter={() => props.onAware(id)}
        onMouseLeave={() => props.onUnaware(id)}
        onFocus={() => {
          if (suppressAwareness.current) {
            suppressAwareness.current = false;
            return;
          }
          props.onAware(id);
        }}
        onBlur={() => props.onUnaware(id)}
        onClick={beginEngage}
        animate={{ scale, opacity: engaged ? 0 : 1 }}
        transition={txSnap}
        whileTap={reduceMotion ? undefined : { scale: scale * 0.96 }}
        // Nolan 2026-10-02: an owner mark is the FULL irregular object.
        // No circle clip, no circular rim, no circular tint overlay; the
        // drop-shadow follows the cutout's own edge so it pops off the page.
        className={`fyd-portal-trigger relative block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-honey ${ownerLogo ? "bg-transparent" : "overflow-hidden rounded-full"}`}
        style={{
          width: D,
          height: D,
          boxShadow: ownerLogo ? "none" : aware ? rimAware : rimRest,
          cursor: "pointer",
          pointerEvents: engaged ? "none" : "auto",
        }}
      >
        {collapsedBg}
        {!ownerLogo && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full"
            style={{
              background: "linear-gradient(to top, rgba(0,0,0,0.28), transparent 55%)",
              opacity: aware ? 0.4 : 1,
              transition: "opacity 180ms ease",
            }}
          />
        )}
      </motion.button>

      <AnimatePresence>
        {aware && !engaged && (
          <motion.span
            key="hint"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={reduceMotion ? instant : { duration: 0.18 }}
            className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-xs font-medium text-white backdrop-blur"
          >
            {portal.circle.name}
          </motion.span>
        )}
      </AnimatePresence>

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {engaged && popupStage && (
                <MobileImmersivePopup
                  key={popupStage}
                  portal={portal}
                  stage={popupStage}
                  following={following}
                  liked={liked}
                  canFollow={canFollow}
                  canLike={canLike}
                  canAsk={canAsk}
                  webHref={webHref}
                  onToggleFollow={toggleFollow}
                  onToggleLike={toggleLike}
                  onAskRequest={askFromPortal}
                  onExpand={() => setPopupStage("full")}
                  onClose={closeAndFocus}
                  reduceMotion={!!reduceMotion}
                />
              )}
            </AnimatePresence>,
            document.body,
          )
        : null}

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
            {engaged && !popupStage && center && origin && <EngagedPortal
              key={id}
              origin={origin}
              portal={portal}
              center={center}
              diameter={engagedD}
              side={engagedSide}
              orbitPad={orbitPad}
              orbitBtn={orbitBtn}
              following={following}
              liked={liked}
              canFollow={canFollow}
              canLike={canLike}
              canAsk={canAsk}
              webHref={webHref}
              showEvidence={showEvidence}
              setShowEvidence={setShowEvidence}
              onToggleFollow={toggleFollow}
              onToggleLike={toggleLike}
              onAskRequest={askFromPortal}
              onClose={closeAndFocus}
              onDismiss={closePortal}
              txGentle={txGentle}
              reduceMotion={!!reduceMotion}
            />}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}

interface EngagedProps {
  origin: PortalOrigin;
  onDismiss: () => void;
  portal: PortalProjection;
  center: { x: number; y: number };
  diameter: number;
  side: EngagedSide;
  orbitPad: number;
  orbitBtn: number;
  following: boolean | null;
  liked: boolean | null;
  canFollow: boolean;
  canLike: boolean;
  canAsk: boolean;
  webHref: string | null;
  showEvidence: boolean;
  setShowEvidence: (v: boolean) => void;
  onToggleFollow: () => void;
  onToggleLike: () => void;
  /** Routes the circle's Ask FYD control to the ONE global assistant. */
  onAskRequest: (id: string) => void;
  onClose: () => void;
  txGentle: { type: "spring"; stiffness: number; damping: number } | { duration: number };
  reduceMotion: boolean;
}

function PerimeterButton({
  label,
  activeLabel,
  active,
  receded,
  disabled,
  onClick,
  angleDeg,
  radius,
  size,
  inwardTooltip,
  children,
}: {
  label: string;
  activeLabel?: string;
  active?: boolean;
  receded?: boolean;
  disabled?: boolean;
  onClick: () => void;
  angleDeg: number;
  radius: number;
  size: number;
  /** Side slots: the tooltip opens toward the circle so it never leaves safe space. */
  inwardTooltip?: boolean;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const rad = (angleDeg * Math.PI) / 180;
  const x = Math.cos(rad) * radius;
  const y = Math.sin(rad) * radius;
  const half = size / 2;
  const cos = Math.cos(rad);
  const inwardStyle: React.CSSProperties | undefined = inwardTooltip
    ? cos > 0.3
      ? { right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" }
      : cos < -0.3
        ? { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" }
        : undefined
    : undefined;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={active && activeLabel ? activeLabel : label}
      aria-pressed={active}
      disabled={disabled}
      whileHover={reduceMotion ? undefined : { scale: 1.04 }}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      className="group pointer-events-auto absolute flex items-center justify-center rounded-full bg-black/78 text-white backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-honey disabled:opacity-40"
      style={{
        width: size,
        height: size,
        left: `calc(50% + ${x}px - ${half}px)`,
        top: `calc(50% + ${y}px - ${half}px)`,
        boxShadow: "0 0 0 1px rgba(255,255,255,0.2), 0 6px 18px rgba(0,0,0,0.5)",
        opacity: receded ? 0.62 : 1,
        transform: receded ? "scale(0.88)" : undefined,
      }}
    >
      {children}
      <span
        className="pointer-events-none absolute hidden whitespace-nowrap rounded-full bg-black/85 px-2 py-0.5 text-[11px] text-white group-hover:block group-focus-visible:block"
        style={
          inwardStyle ?? { top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)" }
        }
      >
        {active && activeLabel ? activeLabel : label}
      </span>
    </motion.button>
  );
}

/**
 * Orbit angles per side. For side slots the controls live on the OUTER
 * half only, away from host content; the geometry reserves that space.
 * Dock mode spreads symmetrically (viewport-fit guarantees room).
 * Degrees: 0 = east, -90 = north.
 */
function orbitAngles(side: EngagedSide) {
  if (side === "left") return { follow: -90, ask: 135, web: 180, like: 90, close: -135 };
  if (side === "right") return { follow: -90, ask: 45, web: 0, like: 90, close: -45 };
  return { follow: -90, ask: 180, web: 0, like: 90, close: -45 };
}

/**
 * MobileImmersivePopup: the mobile engaged treatment (Nolan 2026-10-02).
 *
 * Two stages. First tap: a compact object popup that never takes up the
 * screen. Second tap (expand button or the preview itself): full screen.
 * The live website fills the ENTIRE popup and drifts gently behind big,
 * bold, OUTLINED (never drop shadow), animated, bright, shiny text and
 * buttons. Same identity, same actions, no forced geometry.
 */
export interface MobilePopupProps {
  portal: PortalProjection;
  stage: "compact" | "full";
  following: boolean | null;
  liked: boolean | null;
  canFollow: boolean;
  canLike: boolean;
  canAsk: boolean;
  webHref: string | null;
  onToggleFollow: () => void;
  onToggleLike: () => void;
  /** Routes to the ONE global assistant; the popup closes so the dock is visible. */
  onAskRequest: (id: string) => void;
  /** Second tap: blow up to full screen. */
  onExpand: () => void;
  onClose: () => void;
  reduceMotion: boolean;
}

export function MobileImmersivePopup(p: MobilePopupProps) {
  const { portal, stage } = p;
  const c = portal.circle;
  const isPresent = useIsPresent();
  const full = stage === "full";
  const sub = [c.category, c.locationLabel].filter(Boolean).join(" · ");

  // Scroll lock + Escape while the popup is present. The parent also
  // closes on Escape; both paths are idempotent.
  React.useEffect(() => {
    if (!isPresent) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") p.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [p.onClose, isPresent]);

  const actions = (
    <>
      {p.canAsk && (
        <button
          type="button"
          onClick={() => p.onAskRequest(c.id)}
          className="fyd-shiny-btn flex min-h-[48px] items-center gap-2 rounded-full px-6 text-[15px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
        >
          <MessageCircleQuestion className="h-5 w-5" aria-hidden="true" />
          <span>Ask FYD</span>
        </button>
      )}
      {p.canFollow && (
        <button
          type="button"
          onClick={p.onToggleFollow}
          disabled={p.following === null}
          aria-pressed={!!p.following}
          className="fyd-glass-btn flex min-h-[48px] items-center gap-2 rounded-full px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey disabled:opacity-40"
        >
          {p.following ? (
            <UserCheck className="h-4 w-4" aria-hidden="true" />
          ) : (
            <UserPlus className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{p.following ? "Following" : "Follow"}</span>
        </button>
      )}
      {p.canLike && (
        <button
          type="button"
          onClick={p.onToggleLike}
          disabled={p.liked === null}
          aria-pressed={!!p.liked}
          aria-label={p.liked ? "Liked" : "Like"}
          className="fyd-glass-btn flex h-12 w-12 items-center justify-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey disabled:opacity-40"
        >
          <Heart className="h-5 w-5" aria-hidden="true" fill={p.liked ? "currentColor" : "none"} />
        </button>
      )}
      {p.webHref && (
        <button
          type="button"
          onClick={() => openWebsite(p.webHref as string)}
          className="fyd-glass-btn flex min-h-[48px] items-center gap-2 rounded-full px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          <span>Website</span>
        </button>
      )}
    </>
  );

  const view = (
    <ImmersiveWebsiteView
      portal={portal}
      title={c.name}
      subtitle={sub || null}
      actions={actions}
      onClose={p.onClose}
      onExpand={full ? undefined : p.onExpand}
    />
  );

  if (!full) {
    return (
      <>
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: p.reduceMotion ? 0 : 0.2 }}
          onClick={p.onClose}
          aria-hidden="true"
          className="fixed inset-0 z-[94] bg-black/55"
          style={{ WebkitBackdropFilter: "blur(2px)", backdropFilter: "blur(2px)" }}
        />
        <motion.div
          key="compact"
          role="dialog"
          aria-modal="true"
          aria-label={c.name}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.94 }}
          transition={p.reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }}
          className="fyd-popup-compact fixed z-[95] overflow-hidden"
          style={{
            left: "50%",
            top: "50%",
            x: "-50%",
            y: "-50%",
            width: "min(92vw, 380px)",
            height: "min(62vh, 540px)",
            borderRadius: 28,
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.16), 0 30px 80px rgba(0,0,0,0.6)",
          }}
        >
          {view}
        </motion.div>
      </>
    );
  }

  return (
    <motion.div
      key="full"
      role="dialog"
      aria-modal="true"
      aria-label={c.name}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={p.reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34 }}
      className="fyd-popup-full fixed inset-0 z-[95] bg-neutral-950"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {view}
    </motion.div>
  );
}

function EngagedPortal(p: EngagedProps) {
  const { portal, center, diameter } = p;
  const d = diameter;
  const r = d / 2;
  const orbitR = r + p.orbitPad + p.orbitBtn / 2;
  const wrapSize = d + 2 * (p.orbitPad + p.orbitBtn) + 32;
  const angles = orbitAngles(p.side);
  const inwardTip = p.side !== "dock";
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const preview = portal.preview;
  const focalPos = preview ? focalToObjectPosition({ x: preview.focalX, y: preview.focalY }) : "50% 30%";
  // Nolan 2026-10-02: when the portal has a real website, the engaged
  // circle MORPHS into a live browser panel. The site is served through
  // /api/live/[id] (same-origin proxy that strips frame-blocking
  // headers), so what renders is the live site, not a screenshot.
  const liveSrc = p.webHref ? `/api/live/${encodeURIComponent(portal.circle.id)}` : null;

  React.useEffect(() => {
    wrapRef.current?.focus({ preventScroll: true });
  }, []);
  React.useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) p.onDismiss();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [p.onDismiss]);

  const facts = portal.circle.topFacts.slice(0, 2);
  // Owner marks are irregular objects, not circles: the engaged panel
  // morphs from the cutout's own edge, not from a round badge.
  const engagedFromRadius = portal.logo?.ownerSupplied ? 12 : "50%";
  const originTransform = portalOriginTransform(p.origin, center, d);
  const stationary = { x: 0, y: 0, scaleX: 1, scaleY: 1 };

  return (
    <motion.div
      ref={wrapRef}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: p.reduceMotion ? 0 : 0.2 }}
      className="pointer-events-none fixed z-[90] outline-none"
      style={{
        left: center.x - wrapSize / 2,
        top: center.y - wrapSize / 2,
        width: wrapSize,
        height: wrapSize,
      }}
      role="dialog"
      aria-label={`${portal.circle.name} preview`}
    >
      <motion.div
        initial={{ ...(p.reduceMotion ? stationary : originTransform), opacity: 0, borderRadius: engagedFromRadius }}
        animate={{ ...stationary, opacity: 1, borderRadius: liveSrc ? 20 : "50%" }}
        exit={{ ...(p.reduceMotion ? stationary : originTransform), opacity: 0, borderRadius: engagedFromRadius }}
        transition={p.txGentle}
        className={`pointer-events-auto absolute overflow-hidden bg-neutral-900${liveSrc ? "" : " rounded-full"}`}
        style={{
          left: (wrapSize - d) / 2,
          top: (wrapSize - d) / 2,
          width: d,
          height: d,
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.22), 0 0 60px rgba(232,180,90,0.22), 0 24px 70px rgba(0,0,0,0.6)",
        }}
      >
        {liveSrc ? (
          <PortalWebsitePreview portal={portal} href={p.webHref!} className="h-full w-full" />
        ) : preview ? (
          <img
            src={preview.src}
            srcSet={preview.srcSet}
            sizes={`${d}px`}
            alt={`${portal.circle.name} website preview`}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: focalPos }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "radial-gradient(circle at 35% 30%, #8a6f4d, #3a3226)" }}
          />
        )}

        {/* Interior chrome: native object projection, quiet until asked.
            Text width is constrained to the circle's chord so long names
            wrap instead of clipping on the curve. Skipped for the live
            website panel: the top bar above is its chrome. */}
        {!liveSrc && (
          <div className="absolute inset-x-0 top-0 p-[7%] text-center">
            <div
              className="absolute inset-x-0 top-0 h-[46%]"
              style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.62), transparent)" }}
            />
            <p
              className="relative mx-auto text-[clamp(13px,4.5%,18px)] font-bold leading-tight text-white"
              style={{ maxWidth: d * 0.6 }}
            >
              {portal.circle.name}
            </p>
            <p
              className="relative mx-auto mt-0.5 text-[clamp(10px,3.4%,13px)] text-white/75"
              style={{ maxWidth: d * 0.62 }}
            >
              {[portal.circle.category, portal.circle.locationLabel].filter(Boolean).join(" · ")}
            </p>
            {facts.length > 0 && (
              <p className="relative mt-1 text-[clamp(10px,3.2%,12px)] text-white/65">
                {facts.join(" · ")}
              </p>
            )}
          </div>
        )}

        {/* Evidence describes the source; it does not imply verification. */}
        {!liveSrc && (
          <button
            type="button"
            onClick={() => p.setShowEvidence(!p.showEvidence)}
            aria-label={p.showEvidence ? "Hide evidence" : "Show evidence"}
            aria-expanded={p.showEvidence}
            className="absolute bottom-[6%] left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-black/60 text-[13px] text-stone-200 backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
            style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.18)" }}
          >
            {p.showEvidence ? <X size={13} /> : <Info size={13} />}
          </button>
        )}
        {p.showEvidence && !liveSrc && (
          <div className="absolute inset-x-[10%] bottom-[14%] rounded-2xl bg-black/78 px-3 py-2 text-center backdrop-blur">
            <p className="text-[11px] leading-snug text-white/85">{portal.circle.provenanceLabel}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-white/55">{portal.circle.provenanceDetail}</p>
          </div>
        )}
      </motion.div>

      {/* Restrained orbit: small glyphs at rest, explicit on hover/focus.
          On side slots the controls live on the outer half only, away
          from host content; the engaged geometry reserves that space. */}
      {p.canFollow && (
        <PerimeterButton
          label="Follow"
          disabled={p.following === null}
          activeLabel="Following"
          active={!!p.following}
          receded={!!p.following}
          onClick={p.onToggleFollow}
          angleDeg={angles.follow}
          radius={orbitR}
          size={p.orbitBtn}
          inwardTooltip={inwardTip}
        >
          {p.following ? <UserCheck size={18} /> : <UserPlus size={18} />}
        </PerimeterButton>
      )}
      {p.canAsk && (
        <PerimeterButton
          label="Ask FYD"
          onClick={() => p.onAskRequest(portal.circle.id)}
          angleDeg={angles.ask}
          radius={orbitR}
          size={p.orbitBtn}
          inwardTooltip={inwardTip}
        >
          <MessageCircleQuestion size={18} />
        </PerimeterButton>
      )}
      {p.webHref && (
        <PerimeterButton
          label="Open website"
          onClick={() => openWebsite(p.webHref as string)}
          angleDeg={angles.web}
          radius={orbitR}
          size={p.orbitBtn}
          inwardTooltip={inwardTip}
        >
          <ExternalLink size={18} />
        </PerimeterButton>
      )}
      {p.canLike && (
        <PerimeterButton
          label="Like"
          disabled={p.liked === null}
          activeLabel="Liked"
          active={!!p.liked}
          receded={!!p.liked}
          onClick={p.onToggleLike}
          angleDeg={angles.like}
          radius={orbitR}
          size={p.orbitBtn}
          inwardTooltip={inwardTip}
        >
          <Heart size={18} fill={p.liked ? "currentColor" : "none"} />
        </PerimeterButton>
      )}
      <PerimeterButton
        label="Close"
        onClick={p.onClose}
        angleDeg={angles.close}
        radius={orbitR}
        size={p.orbitBtn}
        inwardTooltip={inwardTip}
      >
        <X size={16} />
      </PerimeterButton>
    </motion.div>
  );
}
