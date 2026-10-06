/**
 * IdentityObject: the PING object experience primitive.
 *
 * A compact 64px identity circle (business logo where rights-authorized,
 * else a deterministic gradient with initials) that expands into a
 * graph-derived identity card: identity header, summary, key facts,
 * relationships grouped by predicate (Services / People / External
 * identities / Location) as clickable rows, capability actions (Follow,
 * Ask FYD, Open Node, Website, Call), and evidence affordances.
 *
 * One component, fully data-driven over ObjectProjection: no
 * customer-specific JSX anywhere. Interaction state runs on the shared
 * circleReducer (collapsed / peek / expanded / ask).
 *
 * - Desktop (hover-capable): hover/focus opens an animated popover anchored
 *   to the circle (framer-motion springs); tap pins it. Close requires
 *   leaving both circle and popover (250ms grace), tapOutside, Escape, or
 *   the close button.
 * - Mobile (no hover): tap opens a bottom sheet (the proven ObjectCircle
 *   dialog pattern: scrim, Escape, focus return, scroll lock, 44px targets).
 *
 * Related objects open as live objects inside the expansion (fetched from
 * GET /api/fyd/objects/[objectId]); Back returns to the previous object.
 * Ask FYD posts to the trusted-path POST /api/fyd/ask/[siteId] and renders
 * the evidence-bounded answer or the honest refusal.
 */

"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { spring } from "@/motion/motionTokens";
import {
  circleReducer,
  INITIAL_CIRCLE_STATE,
  isCircleOpen,
} from "./circle-machine";
import { EvidenceStateLabel } from "./evidence-state";
import { WhyThis } from "./why-this";
import { FollowButton } from "./follow-button";
import type {
  ObjectProjection,
  RelatedRef,
} from "@/fyd/object/object-projection";
import type { AskFydCitation } from "@/fyd/ask/visitor-answer";
import { cn } from "@/lib/utils";
import { ObjectIdentityMark } from "../presentation/object-identity-mark";
import { resolveObjectPresentationIdentity } from "../presentation/identity";

/** Circle face resolved server-side through the rights-gated media seam. */
export type CircleFace =
  | { kind: "logo"; src: string; alt: string }
  | { kind: "gradient"; css: string };

/** Everything one IdentityObject needs: the enriched projection, its tenant,
 *  its face, and where Open Node goes. */
export interface ObjectHandle {
  siteId: string;
  projection: ObjectProjection;
  face: CircleFace;
  nodeHref: string;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Client-side deterministic gold/purple gradient for related objects (the
 *  server gradient seam is server-only). Same id always yields the same face. */
function gradientFaceFor(name: string, id: string): CircleFace {
  void name;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const purple = 262 + (h % 36);
  const gold = 36 + (h % 18);
  return {
    kind: "gradient",
    css:
      "radial-gradient(circle at 35% 30%, hsl(" +
      purple +
      " 55% 62%), hsl(" +
      gold +
      " 75% 52%))",
  };
}

function CircleFaceView({
  face,
  name,
  objectId,
  size,
}: {
  face: CircleFace;
  name: string;
  objectId: string;
  size: "lg" | "md";
}) {
  const identity = resolveObjectPresentationIdentity({ id: objectId, name,
    logo: face.kind === "logo" ? { src: face.src, alt: face.alt, digest: "", basis: "Authorized object face" } : null });
  if (identity.mark) return <ObjectIdentityMark identity={identity} size={size === "lg" ? 64 : 48} />;
  const dims = size === "lg" ? "h-16 w-16" : "h-12 w-12";
  if (face.kind === "logo") {
    return (
      <img
        src={face.src}
        alt={face.alt}
        loading="lazy"
        className={dims + " rounded-full bg-white object-cover"}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        dims,
        "flex shrink-0 items-center justify-center rounded-full font-bold text-white",
        size === "lg" ? "text-xl" : "text-base",
      )}
      style={{ background: face.css }}
    >
      {initialsFor(name)}
    </span>
  );
}

function RelationGroup({
  title,
  refs,
  caption,
  onSelect,
  loading,
}: {
  title: string;
  refs: RelatedRef[];
  caption?: string;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  if (refs.length === 0) return null;
  return (
    <section className="mt-4" aria-label={title}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h4>
      {caption ? (
        <p className="mt-1 text-[11px] leading-snug text-stone-400">{caption}</p>
      ) : null}
      <ul className="mt-2 space-y-1">
        {refs.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              disabled={loading}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700 disabled:opacity-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-stone-800">
                  {r.name}
                </span>
                <span className="block text-[11px] text-stone-500">
                  {r.kindLabel} · {r.relation}
                </span>
              </span>
              <EvidenceStateLabel state={r.evidence.state} />
              <span aria-hidden="true" className="text-lg leading-none text-stone-400">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

type LinkCap =
  | { kind: "call"; href: string; label: string }
  | { kind: "email"; href: string; label: string }
  | { kind: "website"; href: string; label: string };

function ActionRow({
  handle,
  isAsk,
  onAskToggle,
}: {
  handle: ObjectHandle;
  isAsk: boolean;
  onAskToggle: () => void;
}) {
  const p = handle.projection;
  const caps = p.capabilities;
  const has = (kind: string) => caps.some((c) => c.kind === kind);
  const linkCaps = caps.filter(
    (c): c is LinkCap =>
      c.kind === "call" || c.kind === "email" || c.kind === "website",
  );

  const btn =
    "inline-flex min-h-[44px] items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700 focus-visible:ring-offset-2 disabled:opacity-50";
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {has("follow") ? <FollowButton objectId={p.id} className={btn + " bg-purple-700 text-white hover:bg-purple-800"} /> : null}
      {has("ask") ? (
        <button
          type="button"
          onClick={onAskToggle}
          className={btn + " border border-purple-700 text-purple-800 hover:bg-purple-50"}
        >
          {isAsk ? "Back to details" : "Ask FYD"}
        </button>
      ) : null}
      <a href={handle.nodeHref} className={btn + " border border-stone-300 text-stone-700 hover:bg-stone-100"}>
        Open Node
      </a>
      {linkCaps.map((c) => (
        <a
          key={c.kind}
          href={c.href}
          className={btn + " border border-stone-300 text-stone-700 hover:bg-stone-100"}
        >
          {c.label}
        </a>
      ))}
    </div>
  );
}

type AskStatus = "idle" | "loading" | "answered" | "error";

function AskInline({
  siteId,
  objectId,
  objectName,
  sampleQuestions,
  onDone,
}: {
  siteId: string;
  objectId: string;
  objectName: string;
  sampleQuestions: string[];
  onDone: () => void;
}) {
  const [question, setQuestion] = React.useState("");
  const [status, setStatus] = React.useState<AskStatus>("idle");
  const [answer, setAnswer] = React.useState("");
  const [refusal, setRefusal] = React.useState(false);
  const [citations, setCitations] = React.useState<AskFydCitation[]>([]);
  const [unknowns, setUnknowns] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const busy = status === "loading";

  async function ask(q: string) {
    const query = q.trim();
    if (!query || busy) return;
    setQuestion(query);
    setStatus("loading");
    setError(null);
    setAnswer("");
    setRefusal(false);
    setCitations([]);
    setUnknowns([]);
    try {
      const res = await fetch("/api/fyd/ask/" + encodeURIComponent(siteId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: query, objectId, mode: "visitor" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok === false) {
        throw new Error((data && data.error) || "Ask failed");
      }
      setAnswer(typeof data.answer === "string" ? data.answer : "");
      setRefusal(data.refusal === true);
      setCitations(Array.isArray(data.citations) ? data.citations : []);
      setUnknowns(Array.isArray(data.unknowns) ? data.unknowns : []);
      setStatus("answered");
    } catch {
      setError("Ask FYD is unavailable right now. Please try again later.");
      setStatus("error");
    }
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-stone-900">
          Ask FYD about {objectName}
        </h4>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-purple-800 hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700"
        >
          Back to details
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-stone-400">
        Answers come only from this object&apos;s own record. When there is no
        evidence, FYD says so instead of guessing.
      </p>
      {sampleQuestions.length > 0 && status === "idle" ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sampleQuestions.slice(0, 3).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => ask(q)}
              disabled={busy}
              className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-left text-xs text-purple-900 hover:bg-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <label htmlFor="identity-ask-input" className="sr-only">
          Ask a question
        </label>
        <input
          id="identity-ask-input"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What services do they offer?"
          disabled={busy}
          className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-stone-300 px-3 text-sm text-stone-900 placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || question.trim().length === 0}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-purple-700 px-4 text-sm font-semibold text-white hover:bg-purple-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700 focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {busy ? "Asking" : "Ask"}
        </button>
      </form>
      {busy ? (
        <p className="mt-3 text-sm text-stone-500" role="status">
          Checking the record
        </p>
      ) : null}
      {status === "answered" ? (
        <div className="mt-3">
          {refusal ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {answer || "I do not have evidence for that yet."}
            </p>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
              {answer}
            </p>
          )}
          {citations.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {citations.map((c) => (
                <li key={c.n} className="text-[11px] text-stone-500">
                  <span className="font-semibold text-stone-600">[{c.n}]</span>{" "}
                  {c.label}
                  <span className="text-stone-400">
                    {" "}
                    · {c.claimClass} · {c.source}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {unknowns.length > 0 ? (
            <div className="mt-2">
              <p className="text-[11px] font-semibold text-stone-500">
                Not in the record:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-stone-500">
                {unknowns.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {status === "error" && error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ExpansionCard({
  handle,
  face,
  isAsk,
  canGoBack,
  onBack,
  onClose,
  onAskToggle,
  onSelectRelated,
  navLoading,
  navError,
}: {
  handle: ObjectHandle;
  face: CircleFace;
  isAsk: boolean;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onAskToggle: () => void;
  onSelectRelated: (id: string) => void;
  navLoading: boolean;
  navError: string | null;
}) {
  const p = handle.projection;
  const nonServiceFacts = p.facts.filter((f) => f.label !== "Service");
  const subline = [p.kindLabel, p.category?.value].filter(Boolean).join(" · ");

  return (
    <div className="rounded-2xl bg-gradient-to-br from-purple-800 via-purple-700 to-amber-400 p-[2px] shadow-2xl">
      <div className="rounded-[14px] bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          {canGoBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-purple-800 hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700"
            >
              <span aria-hidden="true">‹</span> Back
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={"Close details for " + p.name}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700"
          >
            <span aria-hidden="true" className="text-xl leading-none">×</span>
          </button>
        </div>

        <div className="flex items-start gap-3">
          <CircleFaceView face={face} objectId={p.id} name={p.name} size="md" />
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight text-stone-900">
              {p.name}
            </p>
            {subline ? (
              <p className="mt-0.5 text-xs text-stone-500">{subline}</p>
            ) : null}
            {p.location && p.location.value ? (
              <p className="mt-0.5 text-xs text-stone-500">{p.location.value}</p>
            ) : null}
          </div>
        </div>

        {isAsk ? (
          <AskInline
            siteId={handle.siteId}
            objectId={p.id}
            objectName={p.name}
            sampleQuestions={p.sampleQuestions}
            onDone={onAskToggle}
          />
        ) : (
          <>
            {p.summary && p.summary.value ? (
              <div className="mt-3">
                <p className="text-sm leading-relaxed text-stone-700">
                  {p.summary.value}
                </p>
                <div className="mt-1.5">
                  <EvidenceStateLabel
                    state={p.summary.evidence.state}
                    receipt={p.summary.evidence.receipt}
                    asOf={p.summary.evidence.asOf}
                  />
                </div>
                {p.summary.evidence.steps && p.summary.evidence.steps.length > 0 ? (
                  <WhyThis
                    claim={p.summary.value}
                    steps={p.summary.evidence.steps}
                    className="mt-2"
                  />
                ) : null}
              </div>
            ) : null}

            {nonServiceFacts.length > 0 ? (
              <dl className="mt-3 space-y-1.5 border-t border-stone-100 pt-3">
                {nonServiceFacts.map((f, i) => (
                  <div
                    key={f.label + ":" + i}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <dt className="shrink-0 text-stone-500">{f.label}</dt>
                    <dd className="text-right text-stone-800">{f.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <RelationGroup
              title="Services"
              refs={p.serviceRefs}
              onSelect={onSelectRelated}
              loading={navLoading}
            />
            <RelationGroup
              title="People"
              refs={p.people}
              caption="Names as claimed on the business website, not verified people."
              onSelect={onSelectRelated}
              loading={navLoading}
            />
            <RelationGroup
              title="External identities"
              refs={p.externalIdentities}
              onSelect={onSelectRelated}
              loading={navLoading}
            />
            <RelationGroup
              title="Location"
              refs={p.locationRef ? [p.locationRef] : []}
              onSelect={onSelectRelated}
              loading={navLoading}
            />

            {navLoading ? (
              <p className="mt-3 text-xs text-stone-500" role="status">
                Loading object
              </p>
            ) : null}
            {navError ? (
              <p className="mt-3 text-xs text-red-700" role="alert">
                {navError}
              </p>
            ) : null}

            <ActionRow handle={handle} isAsk={isAsk} onAskToggle={onAskToggle} />

            <div className="mt-4 border-t border-stone-100 pt-3">
              <p className="text-xs text-stone-500">{p.provenance.label}</p>
              {p.provenance.ref ? (
                <p className="mt-1 break-all text-[11px] leading-snug text-stone-400">
                  {p.provenance.ref}
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function IdentityObject({ handle }: { handle: ObjectHandle }) {
  const [machine, dispatch] = React.useReducer(circleReducer, INITIAL_CIRCLE_STATE);
  const [canHover, setCanHover] = React.useState(false);
  const [stack, setStack] = React.useState<ObjectHandle[]>([handle]);
  const [navLoading, setNavLoading] = React.useState(false);
  const [navError, setNavError] = React.useState<string | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const hoverTimer = React.useRef<number | null>(null);
  const blurTimer = React.useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  const current = stack[stack.length - 1] ?? handle;
  const p0 = handle.projection;
  const open = isCircleOpen(machine);
  const showPopover = canHover && (machine.state === "peek" || open);
  const showSheet = !canHover && open;

  React.useEffect(() => {
    setCanHover(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  // Collapse always returns the expansion to the identity object.
  React.useEffect(() => {
    if (machine.state === "collapsed") {
      setStack([handle]);
      setNavError(null);
    }
  }, [machine.state, handle]);

  const clearTimers = React.useCallback(() => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (blurTimer.current !== null) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }, []);

  React.useEffect(() => clearTimers, [clearTimers]);

  const onEnter = React.useCallback(() => {
    clearTimers();
    dispatch({ type: "hover" });
  }, [clearTimers]);

  const onLeave = React.useCallback(() => {
    clearTimers();
    // Peek is transient: leaving the circle AND the popover collapses it
    // after the grace period. Expanded (tapped) stays pinned until an
    // explicit close (tapOutside, Escape, close button).
    if (machine.state === "peek") {
      hoverTimer.current = window.setTimeout(() => {
        dispatch({ type: "unhover" });
      }, 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTimers, machine.state]);

  const onFocus = React.useCallback(() => {
    clearTimers();
    dispatch({ type: "focus" });
  }, [clearTimers]);

  const onBlur = React.useCallback(
    (e: React.FocusEvent) => {
      if (wrapperRef.current?.contains(e.relatedTarget as Node | null)) return;
      clearTimers();
      dispatch({ type: "blur" });
      blurTimer.current = window.setTimeout(() => {
        dispatch({ type: "blurSettled" });
      }, 150);
    },
    [clearTimers],
  );

  const activate = React.useCallback(() => {
    clearTimers();
    dispatch({ type: "tap" });
  }, [clearTimers]);

  const onTriggerKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      } else if (e.key === "Escape") {
        dispatch({ type: "key", key: "Escape" });
      }
    },
    [activate],
  );

  const close = React.useCallback(() => {
    clearTimers();
    dispatch({ type: "key", key: "Escape" });
    triggerRef.current?.focus();
  }, [clearTimers]);

  const onPopoverKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    },
    [close],
  );

  // Desktop pinned popover: a pointerdown outside the wrapper collapses it.
  React.useEffect(() => {
    if (!(canHover && machine.state === "expanded")) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node | null)) {
        dispatch({ type: "tapOutside" });
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [canHover, machine.state]);

  // Mobile sheet: scroll lock, Escape, focus return (proven dialog pattern).
  React.useEffect(() => {
    if (!showSheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [showSheet, close]);

  const selectRelated = React.useCallback(async (id: string) => {
    setNavLoading(true);
    setNavError(null);
    try {
      const res = await fetch("/api/fyd/objects/" + encodeURIComponent(id));
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok !== true || !data.projection || !data.siteId) {
        throw new Error("unavailable");
      }
      const projection = data.projection as ObjectProjection;
      const next: ObjectHandle = {
        siteId: data.siteId as string,
        projection,
        face: gradientFaceFor(projection.name, projection.id),
        nodeHref: "/o/" + encodeURIComponent(projection.id),
      };
      setStack((s) => [...s, next]);
    } catch {
      // Fail closed: stay on the current object, say so quietly.
      setNavError("That object is not available right now.");
    } finally {
      setNavLoading(false);
    }
  }, []);

  const goBack = React.useCallback(() => {
    setNavError(null);
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const onAskToggle = React.useCallback(() => {
    dispatch({ type: machine.state === "ask" ? "askClose" : "askOpen" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.state]);

  const contextLine = [p0.category?.value, p0.location?.value]
    .filter(Boolean)
    .join(" · ");

  const expansionKey = current.projection.id;
  const expansionProps = {
    handle: current,
    face: current.face,
    isAsk: machine.state === "ask",
    canGoBack: stack.length > 1,
    onBack: goBack,
    onClose: close,
    onAskToggle,
    onSelectRelated: selectRelated,
    navLoading,
    navError,
  };

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex flex-col items-center"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={activate}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          (open ? "Close details for " : "Show details for ") + p0.name
        }
        className="group flex flex-col items-center gap-1.5 rounded-2xl focus-visible:outline-none"
      >
        <span className={resolveObjectPresentationIdentity(p0).mark
          ? "block transition-transform duration-200 group-hover:scale-105 group-focus-visible:outline group-focus-visible:outline-purple-700"
          : "block rounded-full ring-2 ring-purple-700/50 ring-offset-2 transition-transform duration-200 group-hover:scale-105 group-focus-visible:ring-purple-700"}>
          <CircleFaceView face={handle.face} objectId={p0.id} name={p0.name} size="lg" />
        </span>
        <span className="w-24 text-center">
          <span className="block truncate text-xs font-semibold text-stone-900">
            {p0.name}
          </span>
          <span className="block text-[11px] text-stone-500">
            {p0.kindLabel}
          </span>
          <span className="block truncate text-[11px] text-stone-400">
            {contextLine || "Tap to expand"}
          </span>
        </span>
      </button>

      {/* Desktop: animated popover anchored to the circle. */}
      <AnimatePresence>
        {showPopover ? (
          <motion.div
            key={"popover:" + expansionKey}
            initial={{ opacity: 0, scale: 0.94, x: 14 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.96, x: 8 }}
            transition={reduceMotion ? { duration: 0 } : spring.gentle}
            onKeyDown={onPopoverKeyDown}
            role="dialog"
            aria-label={"Details for " + current.projection.name}
            className="absolute right-full top-0 z-40 mr-4 w-80 max-w-[calc(100vw-2rem)] origin-right"
          >
            <ExpansionCard key={expansionKey} {...expansionProps} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Mobile: bottom sheet. The fully accessible path on touch devices. */}
      {showSheet ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={close}
            aria-hidden="true"
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={"Details for " + current.projection.name}
            tabIndex={-1}
            className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl focus:outline-none sm:max-w-md sm:rounded-2xl"
          >
            <div className="px-4 pb-6 pt-2">
              <ExpansionCard key={expansionKey} {...expansionProps} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
