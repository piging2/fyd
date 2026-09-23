"use client";

/**
 * ObjectCircle: the generic PING object projection for the margin object
 * layer (Nolan, 2026-09-22: "Margins Are the Object Layer").
 *
 * INTERACTION MODEL (Nolan, 2026-09-22 course correction, BINDING):
 * GLYPH -> PEEK -> WORKSPACE. Geometry follows function. The oval
 * expansion geometry is dead; do not revive it.
 *
 * - GLYPH (STATE 1): the small quiet circle (40px). A tiny,
 *   recognizable FYD/PING presence indicator living unobtrusively at
 *   the edge of an object/page. Almost zero runtime work: no
 *   projection fetch, no chat initialization, no layout shift.
 * - PEEK (STATE 2): hover / focus / tap responds in 100-180ms. A
 *   rectangular popover (max ~400px), document-anchored like the
 *   glyph: identity, type, one-line description, 2-4 contextually
 *   valid actions (Ask FYD first, then Website, Contact, then Follow,
 *   Like), plus the Ask FYD entry ("What do you want to know?" + up
 *   to 3 contextual suggestions). Content-budgeted: never scrolls.
 *   The peek is transient: pointer leave closes it after a 300ms
 *   forgiving delay.
 * - WORKSPACE (STATE 3): only when the user intentionally asks for
 *   deeper interaction (Ask FYD, evidence, relationships, contact,
 *   customization). A restrained side sheet on desktop (viewport-
 *   fixed, ~400px, host content stays readable) and a bottom sheet on
 *   mobile. NOT circular. Tabs: Ask | Evidence | Contact | Related
 *   (+ Owner behind an explicit DEMO badge). Ask never opens a giant
 *   chatbot from the peek: the peek holds the question entry, the
 *   workspace holds the conversation.
 *
 * ONE GRAMMAR: every surface (glyph, peek, workspace, contact,
 * evidence, owner) shares ./fyd-shell (radius, spacing, typography,
 * elevation, focus, buttons, identity). The PresentationSpec seam
 * (./presentation-spec) separates object data from presentation:
 * Object + ViewerContext + SurfaceContext + Capabilities + Evidence
 * -> PresentationSpec -> Peek, Workspace, Card, Page, Sheet, Feed.
 *
 * CONTACT: phone/email are FYD-addressable ContactMethod projections
 * (contact-link.tsx, built by the contact lane): value -> provenance
 * line -> real Call/Send email action inside the flow, plus Copy and
 * "Ask about contacting". Native tel:/mailto: remain the
 * deterministic fallbacks. No PhoneAuthority/EmailAuthority invented.
 *
 * EVIDENCE: trust on demand via the ProvenanceLine grammar (claim ->
 * compact verified line -> tap expands the lineage). Never a
 * dashboard.
 *
 * OWNER MODE: viewer.role "owner-demo" injects Customize, Correct,
 * Hide, Evidence, Visibility, Regenerate behind an explicit DEMO
 * badge. Impossible to mistake for production security. Not an auth
 * platform.
 *
 * CONTEXT-AWARE CIRCLE: the layer watches [data-object-anchor]
 * elements with an IntersectionObserver; the object whose anchor the
 * viewer is reading becomes the context object. Its glyph shows a
 * "Viewing: {name}" pill, and Ask FYD is wired with that page context.
 * The active anchor gets a quiet outline via a data attribute (no
 * inline style mutation, no layout shift, fully reversible).
 *
 * MOTION (canonical type in @/fyd/sitespec/types): framer-motion only
 * where state/gesture semantics require it; transform + opacity only.
 * Reduced motion collapses every decorative transition; no
 * functionality depends on animation.
 *
 * CLUSTERS: a cluster slot renders members as a staggered
 * constellation of mini-circles (see ./star-layout). Tapping a member
 * opens its peek semantics.
 *
 * Layout: glyph + peek render in DOCUMENT space (position:absolute
 * inside the document-height object plane) and scroll WITH the page.
 * The workspace sheet is viewport-fixed in its own portal: it is an
 * application surface, not a page annotation.
 *
 * Generic: takes object data as props. No per-customer logic lives
 * here. One-expanded coordination comes from ./expansion.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, type Transition } from "framer-motion";
import {
  ChevronLeft,
  Heart,
  UserCheck,
  UserPlus,
} from "lucide-react";
import type { MotionTokens } from "@/fyd/sitespec/types";
import {
  duration as motionDuration,
  effectiveIntensity,
  resolveMotionIntensity,
  spring as motionSpring,
  staggerDelayFor,
} from "@/motion/motionTokens";
import {
  claimExpanded,
  currentExpandedId,
  subscribeExpanded,
  subscribeOpenRequest,
} from "./expansion";
import { useObjectActions } from "./use-object-actions";
import { starLayoutFor, STAR_MINI_D } from "./star-layout";
import { fyd } from "./fyd-tokens";
import { isSafeWebHref } from "@/fyd/preview/types";
import type { AskPageContext, MarginObjectDescriptor } from "./types";
import type {
  Fact,
  ObjectCapability,
  ObjectProjection,
  RelatedRef,
} from "@/fyd/object/object-projection";
import { PeekCard, PEEK_W } from "./PeekCard";
import { WorkspaceSheet, WORKSPACE_W } from "./WorkspaceSheet";
import {
  buildPresentationSpec,
  type PresentationSpec,
  type ViewerContext,
} from "./presentation-spec";
import { useViewportCapabilities } from "./viewport";
import { identityTransitionName, transitionViews } from "./view-transitions";

/** Resting diameter: the small quiet glyph. */
export const REST_D = 40;
/**
 * PEEK placement footprint: the popover is content-sized up to PEEK_W
 * wide; the layer budgets this height for document-space placement.
 * The peek itself never scrolls.
 */
export { PEEK_W };
export const PEEK_H = 340;
/** Workspace sheet width (desktop); mobile uses a bottom sheet. */
export { WORKSPACE_W };
/** Forgiving collapse delay so the pointer can reach the controls. */
const COLLAPSE_DELAY_MS = 300;
/** Follow receipt visibility window before settling into Following. */
const RECEIPT_MS = 2600;
/** Short-description display budget: one sentence, roughly 80-140 chars. */
export const SHORT_DESC_MAX = 140;

const instantTx = { duration: 0.01 } as const;

/* ------------------------------------------------------------------ */
/* Motion profile: the Circle's MotionTokens.                         */
/* ------------------------------------------------------------------ */

/**
 * The Circle's default motion profile (Nolan, 2026-09-22 FYD grill).
 * SUBTLE: quiet, quick, no theater. The layer accepts an override
 * profile via props; the compose lane owns the canonical MotionTokens
 * type in @/fyd/sitespec/types.
 */
export const CIRCLE_MOTION: MotionTokens = {
  motionIntensity: "SUBTLE",
  entrance: "FADE_RISE",
  objectTransition: "MORPH",
  stagger: "NONE",
};

/** The Circle's motion profile resolved to concrete animation values. */
export interface ResolvedCircleMotion {
  /** Effective intensity after the reduced-motion signal wins. */
  intensity: MotionTokens["motionIntensity"];
  /** Effective object transition (reduced motion forces CROSSFADE). */
  objectTransition: MotionTokens["objectTransition"];
  /** Decorative/idle motion (sheen, breathing) may run. */
  decorative: boolean;
  /** Stagger delay (s) between sequenced children; 0 = none. */
  staggerDelay: number;
  /** Hover/focus/tap response: 100-180ms, instant under reduced motion. */
  appearDuration: number;
  /** Open/expand transition: a gentle spring, never bounce theater. */
  openTransition: Transition;
  /** Collapse transition: quick fade. */
  closeTransition: Transition;
}

/**
 * Pure: resolve a MotionTokens profile + the reduced-motion signal into
 * concrete framer-motion values. Reduced motion (or NONE intensity)
 * collapses every decorative transition to ~instant; no functionality
 * depends on animation.
 */
export function resolveCircleMotion(
  profile: MotionTokens,
  reducedMotion: boolean | null,
): ResolvedCircleMotion {
  const rm = reducedMotion === true;
  const intensity = effectiveIntensity(profile.motionIntensity, rm);
  const resolved = resolveMotionIntensity(intensity);
  const preset = resolved.spring ? motionSpring[resolved.spring] : null;
  // Collapsed = reduced motion, NONE intensity, or an unknown intensity
  // that failed closed to NONE: every decorative transition ~instant,
  // identity swaps crossfade. No functionality depends on animation.
  const collapsed = rm || resolved.durationScale === 0;
  return {
    intensity,
    objectTransition: collapsed ? "CROSSFADE" : profile.objectTransition,
    decorative: resolved.decorative,
    staggerDelay: collapsed ? 0 : staggerDelayFor(profile.stagger),
    appearDuration: collapsed ? 0.01 : intensity === "EXPRESSIVE" ? 0.16 : 0.12,
    openTransition: preset
      ? { type: "spring", stiffness: preset.stiffness, damping: preset.damping }
      : { duration: 0.01 },
    closeTransition: {
      duration: collapsed ? 0.01 : motionDuration.fast,
      ease: "easeIn",
    },
  };
}

/* ------------------------------------------------------------------ */
/* Pure helpers: actions, questions, descriptions.                     */
/* ------------------------------------------------------------------ */

/**
 * Pure: the PRIMARY contextual action for the peek surface.
 * Rank: Website (first-class where evidence supports it) > Contact >
 * Ask FYD. Follow/Like are peek-level actions, never the primary.
 * Null when the object exposes none of the three.
 */
export function primaryActionFor(actions: CompactAction[]): CompactAction | null {
  return (
    actions.find((a) => a.kind === "website") ??
    actions.find((a) => a.kind === "contact") ??
    actions.find((a) => a.kind === "ask") ??
    null
  );
}

/**
 * Pure: suggested Ask FYD questions generated from the object type.
 * Fallback only: the projection's evidence-backed sampleQuestions win
 * whenever present. Never invented per object; the variants are fixed
 * per kind.
 */
export function sampleQuestionsFor(kindLabel: string | null | undefined): string[] {
  const kind = (kindLabel ?? "").toLowerCase();
  if (/product/.test(kind))
    return [
      "What does this product do?",
      "How much does it cost?",
      "Where can I get it?",
      "What does FYD know about this product?",
    ];
  if (/person/.test(kind))
    return [
      "What do they do?",
      "How do I contact them?",
      "Where are they based?",
      "What does FYD know about this person?",
    ];
  if (/service/.test(kind))
    return [
      "What does this service include?",
      "Where is it available?",
      "How do I book it?",
      "What does FYD know about this service?",
    ];
  return [
    "What services do they offer?",
    "Where do they work?",
    "How do I contact them?",
    "What does FYD know about this company?",
  ];
}

/**
 * Compact action kinds the surfaces render. Derived from schema +
 * evidence + capabilities, never hardcoded per object.
 */
export type CompactActionKind = "website" | "contact" | "follow" | "like" | "ask";

export interface CompactAction {
  kind: CompactActionKind;
  label: string;
  /** Destination href; empty for follow/like/ask (they act in place). */
  href: string;
}

/**
 * Schema eligibility (Nolan, 2026-09-22): OBJECT -> ELIGIBLE CAPABILITIES
 * -> ACTIONS. An address/location object never exposes social actions:
 * an address has no Like. All other schemas keep what their capabilities
 * grant them.
 */
export function actionAllowedBySchema(schema: string, kind: CompactActionKind): boolean {
  if ((kind === "like" || kind === "follow") && /address|location/i.test(schema)) return false;
  return true;
}

/** Contact hrefs are tel: or mailto: only; anything else fails closed. */
function isSafeContactHref(href: string): boolean {
  return /^(tel:\+?[0-9().\-\s]+|mailto:[^\s@]+@[^\s@]+)$/i.test(href);
}

/**
 * Pure: capabilities + schema + evidence-backed website URL -> the ranked
 * compact action set. A capability renders only when its underlying
 * value exists and passes URL safety; "view" never renders.
 */
export function compactActionsFor(
  schema: string,
  capabilities: ObjectCapability[],
  websiteUrl: string | null,
): CompactAction[] {
  const out: CompactAction[] = [];
  const push = (kind: CompactActionKind, label: string, href: string) => {
    if (actionAllowedBySchema(schema, kind)) out.push({ kind, label, href });
  };
  const websiteCap = capabilities.find((c) => c.kind === "website");
  const websiteHref =
    (websiteCap && websiteCap.kind === "website" ? websiteCap.href : null) ?? websiteUrl;
  if (websiteHref && isSafeWebHref(websiteHref)) push("website", "Website", websiteHref);
  const callCap = capabilities.find((c) => c.kind === "call");
  const emailCap = capabilities.find((c) => c.kind === "email");
  const contactCap = callCap ?? emailCap;
  if (
    contactCap &&
    (contactCap.kind === "call" || contactCap.kind === "email") &&
    isSafeContactHref(contactCap.href)
  ) {
    push("contact", "Contact", contactCap.href);
  }
  if (capabilities.some((c) => c.kind === "follow")) push("follow", "Follow", "");
  if (capabilities.some((c) => c.kind === "like")) push("like", "Like", "");
  if (capabilities.some((c) => c.kind === "ask")) push("ask", "Ask FYD", "");
  return out;
}

/** Where the short description came from. */
export type ShortDescriptionSource = "owner" | "derived" | "excerpt";

export interface ShortDescription {
  text: string;
  /** "derived" is GENERATED PRESENTATION, never canonical fact. */
  source: ShortDescriptionSource;
}

/** First sentence of a text, whitespace-collapsed. */
function firstSentence(text: string): string {
  const m = text.match(/^[^.!?]+[.!?]/);
  return (m ? m[0] : text).replace(/\s+/g, " ").trim();
}

/**
 * Enforce the display budget: one sentence, at most SHORT_DESC_MAX chars.
 * Cuts at a word boundary with an ellipsis; never cuts mid-word and never
 * invents words.
 */
export function budgetShortDescription(text: string): string {
  const s = firstSentence(text);
  if (s.length <= SHORT_DESC_MAX) return s;
  const cut = s.lastIndexOf(" ", SHORT_DESC_MAX - 1);
  // Space before the ellipsis: the cut lands on a word boundary and the
  // ellipsis never glues onto a word ("… staircases …", never "…staircases…").
  return (cut > 40 ? s.slice(0, cut) : s.slice(0, SHORT_DESC_MAX - 1)).trimEnd() + " …";
}

/**
 * Pure: the compact short description with provenance.
 * Precedence (Nolan, 2026-09-22): owner-authored > evidence-backed
 * derived presentation > deterministic source-excerpt fallback.
 * Nothing is invented: every tier draws only on owner copy or observed
 * evidence. Null when there is nothing to project.
 */
export function shortDescriptionFor(input: {
  ownerShortDescription?: string | null;
  category?: string | null;
  location?: string | null;
  services?: string[];
}): ShortDescription | null {
  const owner = (input.ownerShortDescription ?? "").trim();
  if (owner.length > 0) return { text: budgetShortDescription(owner), source: "owner" };
  const services = (input.services ?? []).filter((s) => s.trim().length > 0).slice(0, 3);
  const bits: string[] = [];
  if (input.category?.trim()) bits.push(input.category.trim());
  if (services.length > 0) bits.push(services.join(", "));
  if (input.location?.trim()) bits.push(`in ${input.location.trim()}`);
  if (bits.length === 0) return null;
  return { text: budgetShortDescription(bits.join(", ") + "."), source: "derived" };
}

/**
 * Pure: build the compact projection the peek renders from a full
 * ObjectProjection. Keeps the peek's information budget explicit.
 */
export function compactProjectionFor(projection: ObjectProjection): {
  name: string;
  kindLabel: string;
  shortDescription: ShortDescription | null;
  websiteUrl: string | null;
  actions: CompactAction[];
  sampleQuestions: string[];
} {
  const websiteCap = projection.capabilities.find((c) => c.kind === "website");
  const websiteUrl =
    (websiteCap && websiteCap.kind === "website" ? websiteCap.href : null) ??
    projection.contact.website?.value ??
    null;
  const knownFacts = projection.facts.filter(factKnown);
  const firstFact = knownFacts[0];
  return {
    name: projection.name,
    kindLabel: projection.kindLabel,
    shortDescription: firstFact
      ? shortDescriptionFor({ ownerShortDescription: firstFact.value })
      : null,
    websiteUrl,
    actions: compactActionsFor(
      projection.schema,
      projection.capabilities,
      websiteUrl,
    ),
    sampleQuestions:
      projection.sampleQuestions.length > 0
        ? projection.sampleQuestions.slice(0, 4)
        : sampleQuestionsFor(projection.kindLabel),
  };
}

/* ------------------------------------------------------------------ */
/* ObjectFace: the glyph's identity face.                             */
/* ------------------------------------------------------------------ */

function ObjectFace({
  name,
  imageSrc,
  imageSrcSet,
  sizes,
  initialClassName,
}: {
  name: string;
  imageSrc: string | null;
  imageSrcSet: string | null;
  sizes: string;
  initialClassName: string;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <>
      <span
        aria-hidden="true"
        className={`absolute inset-0 flex items-center justify-center font-bold text-white ${initialClassName}`}
        style={{ background: fyd.gradient.identity }}
      >
        {initial}
      </span>
      {imageSrc && (
        <img
          src={imageSrc}
          srcSet={imageSrcSet ?? undefined}
          sizes={sizes}
          alt=""
          aria-hidden="true"
          loading="lazy"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Interaction state: CLOSED / PEEK / WORKSPACE for one claim id.     */
/* ------------------------------------------------------------------ */

/** Interaction phase for one claim id: CLOSED / PEEK / WORKSPACE. */
export type ClaimPhase = "closed" | "peek" | "workspace";

/**
 * useClaim: the GLYPH -> PEEK -> WORKSPACE state machine for one claim
 * id, coordinated through the shared one-expanded registry
 * (./expansion).
 *
 * Contract: hover and focus never downgrade a workspace; the first
 * click after hover never undoes the open it just caused; blur/focus
 * moves that leave the control close with the same forgiving delay as
 * hover leave. The workspace opens only on explicit intent (Ask FYD
 * engaged, Contact/Owner action, second trigger tap, peer-jump
 * open-request).
 */
export function useClaim(claimId: string, onCollapse?: () => void) {
  const [phase, setPhase] = React.useState<ClaimPhase>("closed");
  const phaseRef = React.useRef<ClaimPhase>("closed");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = React.useCallback((next: ClaimPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const collapse = React.useCallback(() => {
    clearTimer();
    set("closed");
    // Release the slot only when we hold it. A collapse triggered by a
    // peer's broadcast must not rebroadcast: claimExpanded notifies
    // synchronously, so rebroadcasting before marking closed recurses
    // without bound (stack overflow on relationship navigation).
    if (currentExpandedId() === claimId) claimExpanded(null);
    onCollapse?.();
  }, [clearTimer, set, claimId, onCollapse]);

  React.useEffect(() => clearTimer, [clearTimer]);

  // One-expanded invariant: a peer claim supersedes us.
  React.useEffect(
    () =>
      subscribeExpanded((expanded) => {
        if (expanded !== claimId && phaseRef.current !== "closed") collapse();
      }),
    [claimId, collapse],
  );

  /** Hover (or keyboard focus) opens the peek preview. Never downgrades a workspace. */
  const hoverOpen = React.useCallback(() => {
    clearTimer();
    if (phaseRef.current === "closed") {
      set("peek");
      claimExpanded(claimId);
    }
  }, [claimId, clearTimer, set]);

  /** Hover leave closes the peek after the forgiving delay; the workspace ignores it. */
  const hoverLeave = React.useCallback(
    (focusInside: () => boolean) => {
      if (phaseRef.current !== "peek") return;
      clearTimer();
      timerRef.current = setTimeout(() => {
        if (phaseRef.current === "peek" && !focusInside()) collapse();
      }, COLLAPSE_DELAY_MS);
    },
    [collapse, clearTimer],
  );

  /** Open the workspace sheet. Explicit intent only. Idempotent. */
  const workspaceOpen = React.useCallback(() => {
    clearTimer();
    set("workspace");
    claimExpanded(claimId);
  }, [claimId, clearTimer, set]);

  /**
   * The trigger button: PEEK -> WORKSPACE on the second click (the
   * first click never undoes what hover just did); WORKSPACE ->
   * CLOSED. Touch devices go CLOSED -> PEEK on the first tap.
   */
  const triggerClick = React.useCallback(() => {
    const phase = phaseRef.current;
    if (phase === "peek") workspaceOpen();
    else if (phase === "workspace") collapse();
    else {
      clearTimer();
      set("peek");
      claimExpanded(claimId);
    }
  }, [claimId, clearTimer, collapse, workspaceOpen, set]);

  /** Blur/focus moves that leave the control close with the forgiving delay. */
  const requestClose = React.useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => collapse(), COLLAPSE_DELAY_MS);
  }, [clearTimer, collapse]);

  const requestCloseSoon = React.useCallback(
    (focusInside: () => boolean) => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        if (!focusInside()) collapse();
      }, COLLAPSE_DELAY_MS);
    },
    [clearTimer, collapse],
  );

  return {
    open: phase !== "closed",
    phase,
    hoverOpen,
    hoverLeave,
    workspaceOpen,
    triggerClick,
    collapse,
    requestClose,
    requestCloseSoon,
    clearTimer,
  };
}

/* ------------------------------------------------------------------ */
/* Follow receipt: minimal confirmation, then the persistent state.   */
/* ------------------------------------------------------------------ */

/**
 * Pure: a server-confirmed false -> true transition earns the receipt.
 * Initial load (null -> anything) never does; repeated true never does.
 */
export function shouldShowFollowReceipt(
  prev: boolean | null,
  next: boolean | null,
): boolean {
  return prev === false && next === true;
}

const ACTION_BTN =
  "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-bold text-white transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";

/**
 * Capability-gated follow toggle. Disabled (but visible) until server
 * state loads. On a server-confirmed false -> true transition it shows
 * the minimal receipt, then settles into the persistent Following state.
 * The toggle is never presented as gateway-journaled (see
 * ./use-object-actions: the homepage has no viewer identity).
 */
export function FollowButton({
  objectId,
  name,
  websiteUrl,
  entry,
  light,
}: {
  objectId: string;
  name: string;
  websiteUrl: string | null;
  /** Entry variant: the compact action row inside the peek card. */
  entry?: boolean;
  /** Light tone for the light card surfaces. */
  light?: boolean;
}) {
  const { following, toggleFollow } = useObjectActions(objectId, websiteUrl);
  const [receipt, setReceipt] = React.useState(false);
  const prevRef = React.useRef<boolean | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
  React.useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = following;
    if (shouldShowFollowReceipt(prev, following)) {
      setReceipt(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setReceipt(false), RECEIPT_MS);
    }
  }, [following]);

  const base = light
    ? "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold text-[#1A1729] transition-colors border border-[#E5E0D5] bg-white hover:border-[rgba(201,162,39,0.7)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CD6]"
    : `${ACTION_BTN} border border-white/15 bg-white/10`;
  const cls = light ? `${base} w-full` : entry ? `${base} w-full` : base;

  if (receipt) {
    return (
      <span
        role="status"
        className={
          light
            ? "inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full border border-[#E5E0D5] bg-white px-3 text-center text-xs font-bold text-[#1A1729]"
            : "inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 text-center text-xs font-bold text-white"
        }
      >
        <UserCheck size={14} aria-hidden="true" />
        <span>DONE: you&apos;re following {name}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={following === null}
      aria-pressed={!!following}
      aria-label={following ? `Following ${name}` : `Follow ${name}`}
      onClick={(e) => {
        e.stopPropagation();
        void toggleFollow();
      }}
      className={cls}
    >
      {following ? <UserCheck size={14} aria-hidden="true" /> : <UserPlus size={14} aria-hidden="true" />}
      <span>{following ? "Following" : "Follow"}</span>
    </button>
  );
}

/** Capability-gated like toggle. Disabled (but visible) until server state loads. */
export function LikeButton({
  objectId,
  name,
  websiteUrl,
  entry,
  light,
}: {
  objectId: string;
  name: string;
  websiteUrl: string | null;
  /** Entry variant: the compact action row inside the peek card. */
  entry?: boolean;
  /** Light tone for the light card surfaces. */
  light?: boolean;
}) {
  const { liked, toggleLike } = useObjectActions(objectId, websiteUrl);
  const base = light
    ? "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold text-[#1A1729] transition-colors border border-[#E5E0D5] bg-white hover:border-[rgba(201,162,39,0.7)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CD6]"
    : `${ACTION_BTN} border border-white/15 bg-white/10`;
  const cls = light ? `${base} w-full` : entry ? `${base} w-full` : base;
  return (
    <button
      type="button"
      disabled={liked === null}
      aria-pressed={!!liked}
      aria-label={liked ? `Unlike ${name}` : `Like ${name}`}
      onClick={(e) => {
        e.stopPropagation();
        void toggleLike();
      }}
      className={cls}
    >
      <Heart size={14} aria-hidden="true" fill={liked ? "currentColor" : "none"} />
      <span>{liked ? "Liked" : "Like"}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Projection fetch: surfaces are object-graph backed.                */
/* ------------------------------------------------------------------ */

export type ProjectionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; projection: ObjectProjection; siteId: string };

/**
 * Loads the real object projection from GET /api/fyd/objects/[objectId]
 * (name, kind, facts, service refs, people, capabilities, sample
 * questions, provenance). Fails closed: error -> unavailable message,
 * never invented content.
 */
export function useObjectProjection(objectId: string): ProjectionState {
  const [state, setState] = React.useState<ProjectionState>({ status: "loading" });
  React.useEffect(() => {
    // No object selected (e.g. the mobile sheet before a tap): stay idle,
    // never issue a junk request for an empty id.
    if (!objectId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/fyd/objects/${encodeURIComponent(objectId)}`, {
      headers: { accept: "application/json" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`objects route ${res.status}`);
        return res.json() as Promise<{
          ok?: boolean;
          projection?: ObjectProjection;
          siteId?: string;
        }>;
      })
      .then((body) => {
        if (cancelled) return;
        if (!body.ok || !body.projection) {
          setState({ status: "error", message: "object unavailable" });
          return;
        }
        setState({
          status: "ok",
          projection: body.projection,
          siteId: body.siteId ?? objectId,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "fetch failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [objectId]);
  return state;
}

function factKnown(f: Fact): boolean {
  return f.evidence.state !== "unknown";
}
function refKnown(r: RelatedRef): boolean {
  return r.evidence.state !== "unknown";
}

/* ------------------------------------------------------------------ */
/* MarginObject: one slot in the margin rail.                         */
/* ------------------------------------------------------------------ */

/**
 * One object in the margin object layer: GLYPH -> PEEK -> WORKSPACE,
 * positioned in document space.
 *
 * - REST: the small quiet glyph (40px).
 * - Hover/focus/tap opens the peek (identity + one-line description +
 *   2-4 actions + Ask FYD entry). Transient: leave closes it.
 * - Intentional interaction (Ask FYD engaged, Contact action, second
 *   trigger tap, peer-jump open-request) opens the workspace sheet.
 * - Escape / outside pointerdown / blur-outside closes; focus returns
 *   to the trigger.
 *
 * @param slotStyle document-space origin of the rest slot (left/top
 *   computed by the layer) plus the slot's size.
 * @param peekStyle document-space offset from the slot origin for the
 *   peek popover (clamped by the layer for PEEK_W x PEEK_H via
 *   flipCardX; the popover itself is content-sized).
 * @param contextActive the viewer's current object (in-view anchor):
 *   the glyph subtly shows a "Viewing: {name}" pill.
 * @param rail the margin rail side; the context pill grows inward from it.
 * @param motionProfile the Circle's MotionTokens profile (default
 *   CIRCLE_MOTION); reduced motion always collapses to instant.
 * @param askContext page context wired into Ask FYD.
 * @param viewer VisitorContext: "visitor" by default; "owner-demo"
 *   injects the labeled DEMO owner capabilities.
 */
export function MarginObject({
  descriptor,
  slotStyle,
  peekStyle,
  restD = REST_D,
  contextActive = false,
  rail = "right",
  motionProfile,
  askContext,
  viewer = { role: "visitor" },
}: {
  descriptor: MarginObjectDescriptor;
  slotStyle?: React.CSSProperties;
  peekStyle?: React.CSSProperties;
  restD?: number;
  contextActive?: boolean;
  rail?: "left" | "right";
  motionProfile?: MotionTokens;
  askContext?: AskPageContext;
  viewer?: ViewerContext;
}) {
  const { objectId, name, imageSrc, imageSrcSet, websiteUrl } = descriptor;
  // ViewportCapabilities drives the spec seam (density, pointer, hover,
  // reduced motion) and the motion signal: nothing reads
  // window.innerWidth directly, and no feature depends on hover.
  const viewport = useViewportCapabilities();
  const rm = viewport.reducedMotion;
  const circleMotion = React.useMemo(
    () => resolveCircleMotion(motionProfile ?? CIRCLE_MOTION, rm),
    [motionProfile, rm],
  );
  // The projection is fetched only once the glyph is engaged: collapsed,
  // it does almost zero runtime work (no fetch, no chat, no layout shift).
  const { open, phase, hoverOpen, hoverLeave, workspaceOpen, triggerClick, collapse, requestCloseSoon, clearTimer } =
    useClaim(objectId);
  const proj = useObjectProjection(open ? objectId : "");
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const openedVia = React.useRef<"pointer" | "keyboard" | "unknown">("unknown");
  const suppressFocusOpen = React.useRef(false);
  const [workspaceTab, setWorkspaceTab] = React.useState<"ask" | "evidence" | "contact" | "related" | "owner">("ask");
  const [workspaceQuestion, setWorkspaceQuestion] = React.useState<string | undefined>(undefined);

  const spec: PresentationSpec = React.useMemo(
    () =>
      buildPresentationSpec({
        projection: proj.status === "ok" ? proj.projection : null,
        descriptor: { objectId, name, websiteUrl },
        viewer,
        surface: {
          surface: phase === "workspace" ? "workspace" : "peek",
          viewport,
        },
      }),
    [proj, objectId, name, websiteUrl, viewer, phase, viewport],
  );
  const siteId = proj.status === "ok" ? proj.siteId : objectId;

  const openWorkspace = React.useCallback(
    (tab: "ask" | "evidence" | "contact" | "related" | "owner", question?: string) => {
      // EXPAND semantics: the peek's identity row and the workspace
      // header share a view-transition name, so the avatar/logo + title
      // persist through the expand. Progressive enhancement: without
      // support (or with reduced motion) this is a plain state update.
      transitionViews(() => {
        setWorkspaceTab(tab);
        setWorkspaceQuestion(question);
        workspaceOpen();
      });
    },
    [workspaceOpen],
  );

  React.useEffect(() => {
    if (phase === "closed") {
      setWorkspaceQuestion(undefined);
    }
  }, [phase]);

  React.useEffect(
    () => subscribeOpenRequest((id) => id === objectId && workspaceOpen()),
    [objectId, workspaceOpen],
  );

  // Context highlight: a quiet outline on the object-associated page
  // content while the workspace is open. Attribute-only, fully
  // reversible, no layout shift (outline never affects layout).
  React.useEffect(() => {
    if (phase !== "workspace") return;
    const el = document.querySelector(
      `[data-object-anchor="${CSS.escape(descriptor.anchorKey)}"]`,
    );
    if (!(el instanceof HTMLElement)) return;
    el.setAttribute("data-fyd-anchor-active", "true");
    return () => {
      el.removeAttribute("data-fyd-anchor-active");
    };
  }, [phase, descriptor.anchorKey]);

  const focusInside = React.useCallback(
    () => !!wrapRef.current?.contains(document.activeElement),
    [],
  );

  const tryFocusFirstAction = React.useCallback(() => {
    const peek = wrapRef.current?.querySelector('[data-fyd-surface="peek"]');
    const first = peek?.querySelector<HTMLElement>(
      "button:not([disabled]), a[href], input, [tabindex]:not([tabindex='-1'])",
    );
    if (first) first.focus({ preventScroll: true });
  }, []);

  React.useEffect(() => {
    if (phase === "peek" && openedVia.current !== "keyboard") tryFocusFirstAction();
  }, [phase, tryFocusFirstAction]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        suppressFocusOpen.current = true;
        collapse();
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element;
      // The workspace sheet lives in its own portal: clicks inside it
      // are not outside clicks.
      if (target.closest?.('[data-fyd-surface="workspace"]')) return;
      if (!wrapRef.current?.contains(e.target as Node)) collapse();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, collapse]);

  const handleFocus = React.useCallback(
    (e: React.FocusEvent) => {
      if (suppressFocusOpen.current) {
        suppressFocusOpen.current = false;
        return;
      }
      if (wrapRef.current?.contains(e.target as Node)) {
        if (!wrapRef.current.contains(e.relatedTarget as Node)) {
          openedVia.current = "keyboard";
          hoverOpen();
        }
      }
    },
    [hoverOpen],
  );

  const handleBlur = React.useCallback(
    (e: React.FocusEvent) => {
      if (e.target === triggerRef.current) openedVia.current = "unknown";
      if (!wrapRef.current?.contains(e.relatedTarget as Node)) {
        requestCloseSoon(() => focusInside());
      }
    },
    [requestCloseSoon, focusInside],
  );

  const handleWorkspaceClose = React.useCallback(() => {
    collapse();
    triggerRef.current?.focus({ preventScroll: true });
  }, [collapse]);

  return (
    <div
      ref={wrapRef}
      data-testid="margin-object"
      data-object-id={objectId}
      className="pointer-events-auto"
      style={{ ...slotStyle, position: "absolute" }}
      onMouseEnter={() => {
        openedVia.current = "pointer";
        hoverOpen();
      }}
      onMouseLeave={() => hoverLeave(focusInside)}
      onFocus={clearTimer}
      onBlur={handleBlur}
    >
      <motion.button
        ref={triggerRef}
        type="button"
        aria-label={`${name}. Expand to show details.`}
        aria-expanded={open || undefined}
        aria-haspopup="dialog"
        aria-hidden={open || undefined}
        tabIndex={open ? -1 : 0}
        data-testid="object-circle-trigger"
        data-fyd-surface="glyph"
        onClick={(e) => {
          e.stopPropagation();
          triggerClick();
        }}
        onFocus={(e) => {
          // A suppressed focus (e.g. focus returned to the trigger after
          // Escape) must never reopen: consume the flag and stop, so the
          // shared handleFocus below does not see it cleared and re-open.
          if (suppressFocusOpen.current) {
            suppressFocusOpen.current = false;
            return;
          }
          openedVia.current = "keyboard";
          hoverOpen();
          handleFocus(e);
        }}
        /* Hover response: the glyph grows slightly (100-180ms). */
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        animate={{ opacity: phase !== "closed" ? 0 : 1, scale: phase !== "closed" ? 0.7 : 1 }}
        transition={
          rm ? instantTx : { duration: circleMotion.appearDuration, ease: "easeOut" }
        }
        className="relative block cursor-pointer overflow-hidden rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        style={{
          width: restD,
          height: restD,
          /* Quiet rest state: thin subtle identity ring, no glow. */
          boxShadow: fyd.shadow.restRing,
        }}
      >
        <ObjectFace
          name={name}
          imageSrc={imageSrc}
          imageSrcSet={imageSrcSet}
          sizes={`${restD}px`}
          initialClassName="text-xl"
        />
      </motion.button>

      {/*
        Context-aware Circle: when the viewer is reading this object's
        anchor, the resting glyph subtly names the context. The pill
        grows inward from the rail so it never clips the viewport edge.
        Decorative (the trigger label already names the object).
      */}
      {contextActive && !open && (
        <span
          data-testid="object-context-pill"
          aria-hidden="true"
          className="pointer-events-none absolute whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold"
          style={{
            top: restD + 6,
            ...(rail === "left" ? { left: -4 } : { right: -4 }),
            background: "#FBFAF7",
            color: "#6b7280",
            borderColor: "rgba(201,162,39,0.4)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
          }}
        >
          Viewing: {name}
        </span>
      )}

      {phase === "peek" && (
        <div
          data-testid="object-peek-wrap"
          style={{ ...peekStyle, position: "absolute", zIndex: 61 }}
        >
          <PeekCard
            spec={spec}
            id={`fyd-peek-${objectId}`}
            initialFocus={openedVia.current === "keyboard" ? "ask" : "none"}
            loading={proj.status === "loading"}
            transitionId={identityTransitionName(objectId)}
            onClose={collapse}
            onAsk={(question) => openWorkspace("ask", question)}
            onAction={(action) => {
              if (action.kind === "contact") openWorkspace("contact");
              else if (action.kind === "ask") openWorkspace("ask");
            }}
            actionOverride={(action) => {
              if (action.kind === "follow")
                return (
                  <FollowButton
                    objectId={objectId}
                    name={name}
                    websiteUrl={websiteUrl}
                    entry
                    light
                  />
                );
              if (action.kind === "like")
                return (
                  <LikeButton
                    objectId={objectId}
                    name={name}
                    websiteUrl={websiteUrl}
                    entry
                    light
                  />
                );
              return null;
            }}
          />
          {proj.status === "error" && (
            <p
              role="status"
              className="mt-2 text-[12px]"
              style={{ color: "rgba(26,23,41,0.6)" }}
            >
              Object details unavailable right now.
            </p>
          )}
        </div>
      )}

      {phase === "workspace" &&
        createPortal(
          <WorkspaceSheet
            spec={spec}
            siteId={siteId}
            initialQuestion={workspaceQuestion}
            initialTab={workspaceTab}
            transitionId={identityTransitionName(objectId)}
            onClose={handleWorkspaceClose}
            pageContext={askContext}
          />,
          document.body,
        )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ClusterSlot: constellation of member mini-circles.                 */
/* ------------------------------------------------------------------ */

/**
 * A cluster slot: the packed constellation of member mini-circles
 * (staggered 3-per-row rows from ./star-layout), never one big "+N" hero
 * bubble. Tapping a member opens that member's peek semantics. Scales
 * to many members via wrapping rows.
 */
export function ClusterSlot({
  clusterId,
  members,
  slotStyle,
  peekStyleFor,
  align = "right",
  askContext,
  motionProfile,
  viewer = { role: "visitor" },
}: {
  clusterId: string;
  members: MarginObjectDescriptor[];
  slotStyle?: React.CSSProperties;
  /** Document-space-clamped peek offset for a member's peek popover. */
  peekStyleFor: (member: MarginObjectDescriptor) => React.CSSProperties | undefined;
  /** Rail side the constellation grows from. */
  align?: "left" | "right";
  /** Page context wired into Ask FYD. */
  askContext?: AskPageContext;
  /** The Circle's MotionTokens profile. */
  motionProfile?: MotionTokens;
  viewer?: ViewerContext;
}) {
  const [selected, setSelected] = React.useState<MarginObjectDescriptor | null>(null);
  const layout = React.useMemo(() => starLayoutFor(members.length), [members.length]);

  React.useEffect(
    () =>
      subscribeOpenRequest((id) => {
        const member = members.find((m) => m.objectId === id);
        if (member) setSelected(member);
      }),
    [members],
  );

  const restD = REST_D;
  const top = (restD - layout.height) / 2;

  return (
    <div
      data-testid="margin-cluster"
      data-cluster-id={clusterId}
      data-member-ids={members.map((m) => m.objectId).join(" ")}
      className="pointer-events-auto"
      style={{ ...slotStyle, position: "absolute" }}
    >
      <div
        role="group"
        aria-label={`${members.length} nearby objects`}
        style={{
          position: "absolute",
          top,
          ...(align === "right" ? { right: 0 } : { left: 0 }),
          width: layout.width,
          height: layout.height,
        }}
      >
        {members.map((m, i) => {
          const cell = layout.cells[i] ?? { x: 0, y: 0 };
          return (
            <button
              key={m.objectId}
              type="button"
              data-object-id={m.objectId}
              onClick={() => setSelected(m)}
              aria-label={`Open ${m.name}`}
              className="absolute cursor-pointer overflow-hidden rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{
                left: cell.x,
                top: cell.y,
                width: STAR_MINI_D,
                height: STAR_MINI_D,
                boxShadow: fyd.shadow.restRing,
              }}
            >
              <ObjectFace
                name={m.name}
                imageSrc={m.imageSrc}
                imageSrcSet={m.imageSrcSet}
                sizes="72px"
                initialClassName="text-sm"
              />
            </button>
          );
        })}
      </div>

      {selected && (
        <ClusterMemberCard
          key={selected.objectId}
          descriptor={selected}
          peekStyle={peekStyleFor(selected)}
          onClose={() => setSelected(null)}
          askContext={askContext}
          motionProfile={motionProfile}
          viewer={viewer}
        />
      )}
    </div>
  );
}

/** A cluster member's peek popover, dismissed by close / Escape / outside. */
function ClusterMemberCard({
  descriptor,
  peekStyle,
  onClose,
  askContext,
  motionProfile,
  viewer,
}: {
  descriptor: MarginObjectDescriptor;
  peekStyle: React.CSSProperties | undefined;
  onClose: () => void;
  askContext?: AskPageContext;
  motionProfile?: MotionTokens;
  viewer?: ViewerContext;
}) {
  const { workspaceOpen } = useClaim(descriptor.objectId, onClose);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const proj = useObjectProjection(descriptor.objectId);
  const viewport = useViewportCapabilities();
  const [workspaceTab, setWorkspaceTab] = React.useState<"ask" | "evidence" | "contact" | "related" | "owner">("ask");
  const [workspaceQuestion, setWorkspaceQuestion] = React.useState<string | undefined>(undefined);
  const [workspace, setWorkspace] = React.useState(false);

  const spec: PresentationSpec = React.useMemo(
    () =>
      buildPresentationSpec({
        projection: proj.status === "ok" ? proj.projection : null,
        descriptor: {
          objectId: descriptor.objectId,
          name: descriptor.name,
          websiteUrl: descriptor.websiteUrl,
        },
        viewer: viewer ?? { role: "visitor" },
        surface: {
          surface: workspace ? "workspace" : "peek",
          viewport,
        },
      }),
    [proj, descriptor, viewer, workspace, viewport],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        claimExpanded(null);
        onClose();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element;
      if (target.closest?.('[data-fyd-surface="workspace"]')) return;
      if (!cardRef.current?.contains(e.target as Node)) {
        claimExpanded(null);
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  const openWorkspace = (tab: typeof workspaceTab, question?: string) => {
    transitionViews(() => {
      setWorkspaceTab(tab);
      setWorkspaceQuestion(question);
      setWorkspace(true);
      workspaceOpen();
    });
  };

  if (workspace) {
    return createPortal(
      <WorkspaceSheet
        spec={spec}
        siteId={proj.status === "ok" ? proj.siteId : descriptor.objectId}
        initialQuestion={workspaceQuestion}
        initialTab={workspaceTab}
        transitionId={identityTransitionName(descriptor.objectId)}
        onClose={() => {
          setWorkspace(false);
          claimExpanded(null);
          onClose();
        }}
        pageContext={askContext}
      />,
      document.body,
    );
  }

  return (
    <div
      ref={cardRef}
      style={{ ...peekStyle, position: "absolute", zIndex: 61 }}
    >
      <PeekCard
        spec={spec}
        id={`fyd-peek-${descriptor.objectId}`}
        loading={proj.status === "loading"}
        transitionId={identityTransitionName(descriptor.objectId)}
        onClose={() => {
          claimExpanded(null);
          onClose();
        }}
        onAsk={(question) => openWorkspace("ask", question)}
        onAction={(action) => {
          if (action.kind === "contact") openWorkspace("contact");
          else if (action.kind === "ask") openWorkspace("ask");
        }}
        actionOverride={(action) => {
          if (action.kind === "follow")
            return (
              <FollowButton
                objectId={descriptor.objectId}
                name={descriptor.name}
                websiteUrl={descriptor.websiteUrl}
                entry
                light
              />
            );
          if (action.kind === "like")
            return (
              <LikeButton
                objectId={descriptor.objectId}
                name={descriptor.name}
                websiteUrl={descriptor.websiteUrl}
                entry
                light
              />
            );
          return null;
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* BackButton: shared by the mobile sheet.                            */
/* ------------------------------------------------------------------ */

/** Back to the object list inside the mobile sheet. */
export function BackButton({
  onBack,
  label,
  light,
}: {
  onBack: () => void;
  label: string;
  /** Light tone for the light card surfaces. */
  light?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onBack}
      className={
        light
          ? "inline-flex items-center gap-1 text-sm font-semibold text-neutral-500 underline-offset-4 hover:text-[#1A1729] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CD6]"
          : "inline-flex items-center gap-1 text-sm font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      }
    >
      <ChevronLeft size={16} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
