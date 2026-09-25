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
 * Security: every href rendered here is validated https-only. The website
 * preview is a snapshot (content), never an interactive authority.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  ExternalLink,
  Heart,
  MessageCircleQuestion,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { spring } from "@/motion/motionTokens";
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
  const { portal, slot, dock, aware, engaged } = props;
  const id = portal.circle.id;
  const reduceMotion = useReducedMotion();
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [following, setFollowing] = React.useState<boolean | null>(null);
  const [liked, setLiked] = React.useState<boolean | null>(null);
  const [showEvidence, setShowEvidence] = React.useState(false);
  const [center, setCenter] = React.useState<{ x: number; y: number } | null>(null);
  const [engagedD, setEngagedD] = React.useState(320);
  // Mobile sheet: narrow viewports cannot honestly hold the circle+orbit
  // footprint (320px), so tap opens a compact bottom sheet instead of the
  // spatial expansion. Same identity, same actions, no forced geometry.
  const [sheetOpen, setSheetOpen] = React.useState(false);
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
    // Directive (Nolan, 2026-09-22): do not force desktop spatial behavior
    // onto mobile. Below 640px the tap opens the bottom sheet; the
    // circle+orbit expansion stays a desktop treatment. Edge peeks (round
    // 3: narrow desktop bands, mobile overlay) also open the sheet: no
    // safe footprint exists for spatial expansion there.
    if (window.innerWidth < 640 || props.peek) {
      setSheetOpen(true);
      props.onEngageRequest(id);
      return;
    }
    const r = el.getBoundingClientRect();
    // Full-footprint geometry: the orbit controls extend beyond the circle,
    // so the engaged size and center account for the whole footprint.
    // Null means no safe geometry: stay collapsed, never overlap content.
    const g = engagedGeometryFor(
      { width: window.innerWidth, height: window.innerHeight },
      slot,
      { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    );
    if (!g) return;
    setCenter({ x: g.cx, y: g.cy });
    setEngagedD(g.d);
    setEngagedSide(g.side);
    setOrbitPad(g.orbitPad);
    setOrbitBtn(g.orbitBtn);
    props.onEngageRequest(id);
  }, [id, slot, props]);

  // Scroll while engaged: the circles are fixed-positioned, so host
  // scrolling never moves them, but a host-page scroll means the reading
  // context moved on, so release. Resize while engaged: the slot geometry
  // changed, so release rather than sit on stale measurements.
  React.useEffect(() => {
    if (!engaged) return;
    const onScroll = () => props.onRelease(id);
    let t: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => props.onRelease(id), 200);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onRelease(id);
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
  }, [engaged, id, props]);

  const toggleFollow = async () => {
    if (following === null) return;
    setFollowing(await executeFollow(id, following));
  };

  const toggleLike = async () => {
    if (liked === null) return;
    setLiked(await executeLike(id, liked));
  };

  const preview = portal.preview;
  const focalPos = preview ? focalToObjectPosition({ x: preview.focalX, y: preview.focalY }) : "50% 30%";
  const collapsedBg = preview ? (
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
      <motion.button
        ref={buttonRef}
        type="button"
        aria-label={`${portal.circle.name}, ${portal.circle.category ?? "business"}. Activate to expand.`}
        aria-expanded={engaged}
        onMouseEnter={() => props.onAware(id)}
        onMouseLeave={() => props.onUnaware(id)}
        onFocus={() => props.onAware(id)}
        onBlur={() => props.onUnaware(id)}
        onClick={beginEngage}
        animate={{ scale, opacity: engaged ? 0 : 1 }}
        transition={txSnap}
        whileTap={reduceMotion ? undefined : { scale: scale * 0.96 }}
        className="relative block overflow-hidden rounded-full"
        style={{
          width: D,
          height: D,
          boxShadow: aware ? rimAware : rimRest,
          cursor: "pointer",
          pointerEvents: engaged ? "none" : "auto",
        }}
      >
        {collapsedBg}
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.28), transparent 55%)",
            opacity: aware ? 0.4 : 1,
            transition: "opacity 180ms ease",
          }}
        />
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
              {sheetOpen && (
                <CompactSheet
                  portal={portal}
                  following={following}
                  liked={liked}
                  canFollow={canFollow}
                  canLike={canLike}
                  canAsk={canAsk}
                  webHref={webHref}
                  onToggleFollow={toggleFollow}
                  onToggleLike={toggleLike}
                  onAskRequest={(sid) => {
                    setSheetOpen(false);
                    props.onAskRequest(sid);
                  }}
                  onClose={() => {
                    setSheetOpen(false);
                    props.onRelease(id);
                  }}
                  reduceMotion={!!reduceMotion}
                />
              )}
            </AnimatePresence>,
            document.body,
          )
        : null}

      {engaged && !sheetOpen && center && typeof document !== "undefined"
        ? createPortal(
            <EngagedPortal
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
              onAskRequest={props.onAskRequest}
              onClose={() => props.onRelease(id)}
              txGentle={txGentle}
              reduceMotion={!!reduceMotion}
            />,
            document.body,
          )
        : null}
    </>
  );
}

interface EngagedProps {
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
  onClick: () => void;
  angleDeg: number;
  radius: number;
  size: number;
  /** Side slots: the tooltip opens toward the circle so it never leaves safe space. */
  inwardTooltip?: boolean;
  children: React.ReactNode;
}) {
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
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      className="group pointer-events-auto absolute flex items-center justify-center rounded-full bg-black/78 text-white backdrop-blur"
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
 * CompactSheet: the mobile engaged treatment. A bottom sheet with the
 * identity's highest-value information: image, name, descriptor,
 * location, top facts, actions (Ask FYD, Follow, Like, Website), and
 * evidence provenance. One tap opens, readable at 320px, close/Escape/
 * outside-tap collapses. No orbit ring, no spatial footprint math.
 */
interface SheetProps {
  portal: PortalProjection;
  following: boolean | null;
  liked: boolean | null;
  canFollow: boolean;
  canLike: boolean;
  canAsk: boolean;
  webHref: string | null;
  onToggleFollow: () => void;
  onToggleLike: () => void;
  /** Routes to the ONE global assistant; the sheet closes so the dock is visible. */
  onAskRequest: (id: string) => void;
  onClose: () => void;
  reduceMotion: boolean;
}

function CompactSheet(p: SheetProps) {
  const { portal } = p;
  const c = portal.circle;
  const preview = portal.preview;
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  // Focus the close control on open; Escape closes; outside tap closes.
  // The open tap is deferred past so it never instantly dismisses.
  React.useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") p.onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) p.onClose();
    };
    const t = setTimeout(() => document.addEventListener("pointerdown", onDown), 60);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [p]);

  const facts = c.topFacts.slice(0, 4);
  const sub = [c.category, c.locationLabel].filter(Boolean).join(" · ");

  return (
    <motion.div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label={c.name}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={p.reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 38 }}
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-[95] max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border-soft bg-surface shadow-[0_-18px_60px_rgba(0,0,0,0.45)]"
    >
      <div className="sticky top-0 flex items-center justify-between bg-surface px-4 pb-2 pt-3">
        <span aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-border-soft" />
        <button
          ref={closeRef}
          type="button"
          onClick={p.onClose}
          aria-label={`Close ${c.name}`}
          className="absolute right-3 top-3 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-accent/70 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {preview && (
        <div className="px-4">
          <img
            src={preview.thumbSrc ?? preview.src}
            srcSet={preview.srcSet}
            sizes="(max-width: 640px) 100vw, 480px"
            alt={`${c.name} website preview`}
            decoding="async"
            className="aspect-[16/9] w-full rounded-2xl object-cover"
            style={{ objectPosition: focalToObjectPosition({ x: preview.focalX, y: preview.focalY }) }}
          />
        </div>
      )}

      <div className="px-5 pb-6 pt-4">
        <h2 className="text-xl font-bold leading-tight text-accent">{c.name}</h2>
        {sub ? <p className="mt-1 text-sm text-accent/70">{sub}</p> : null}
        {c.tagline ? <p className="mt-2 text-sm leading-relaxed text-accent/85">{c.tagline}</p> : null}
        {facts.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Top services">
            {facts.map((f) => (
              <li
                key={f}
                className="rounded-full border border-border-soft bg-surface-2 px-3 py-1.5 text-xs font-medium text-accent"
              >
                {f}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {p.canAsk && (
            <button
              type="button"
              onClick={() => p.onAskRequest(c.id)}
              className="flex min-h-[44px] items-center gap-2 rounded-full bg-honey px-5 text-sm font-semibold text-honey-foreground hover:bg-honey-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey"
            >
              <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
              Ask FYD
            </button>
          )}
          {p.canFollow && (
            <button
              type="button"
              onClick={p.onToggleFollow}
              aria-pressed={!!p.following}
              className="flex min-h-[44px] items-center gap-2 rounded-full border border-border-soft px-4 text-sm font-medium text-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey"
            >
              {p.following ? (
                <UserCheck className="h-4 w-4" aria-hidden="true" />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              )}
              {p.following ? "Following" : "Follow"}
            </button>
          )}
          {p.canLike && (
            <button
              type="button"
              onClick={p.onToggleLike}
              aria-pressed={!!p.liked}
              aria-label={p.liked ? "Liked" : "Like"}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border-soft text-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey"
            >
              <Heart className="h-4 w-4" aria-hidden="true" fill={p.liked ? "currentColor" : "none"} />
            </button>
          )}
          {p.webHref && (
            <button
              type="button"
              onClick={() => openWebsite(p.webHref as string)}
              className="flex min-h-[44px] items-center gap-2 rounded-full border border-border-soft px-4 text-sm font-medium text-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Website
            </button>
          )}
        </div>

        <p className="mt-4 border-t border-border-soft/60 pt-3 text-xs leading-relaxed text-accent/60">
          <span className="font-semibold text-accent/75">Evidence: </span>
          {c.provenanceLabel}
          {c.provenanceDetail ? ` ${c.provenanceDetail}` : ""}
        </p>
      </div>
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

  // Outside pointer closes. The wrap is pointer-transparent except children.
  React.useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) p.onClose();
    };
    // Defer so the opening click does not immediately close.
    const t = setTimeout(() => document.addEventListener("pointerdown", onDown), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [p]);

  const facts = portal.circle.topFacts.slice(0, 2);

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none fixed z-[90]"
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
        initial={{ scale: COLLAPSED_D / d, opacity: 0.55 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: COLLAPSED_D / d, opacity: 0 }}
        transition={p.txGentle}
        className="pointer-events-auto absolute overflow-hidden rounded-full bg-neutral-900"
        style={{
          left: (wrapSize - d) / 2,
          top: (wrapSize - d) / 2,
          width: d,
          height: d,
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.22), 0 0 60px rgba(232,180,90,0.22), 0 24px 70px rgba(0,0,0,0.6)",
        }}
      >
        {preview ? (
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
            wrap instead of clipping on the curve. */}
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

        {/* Evidence affordance: one subtle check, detail on demand. */}
        <button
          type="button"
          onClick={() => p.setShowEvidence(!p.showEvidence)}
          aria-label={p.showEvidence ? "Hide verification" : "Why is this verified?"}
          className="absolute bottom-[6%] left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-black/60 text-[13px] text-emerald-300 backdrop-blur"
          style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.18)" }}
        >
          {p.showEvidence ? <X size={13} /> : <Check size={13} />}
        </button>
        {p.showEvidence && (
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
    </div>
  );
}
