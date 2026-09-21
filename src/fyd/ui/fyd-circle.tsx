"use client";

/**
 * FydCircle: the true FYD circle. A literal circle with concentric expansion.
 * No rectangles, cards, or modals at any state.
 *
 * Visual states (all circular: border-radius 50%, overflow hidden):
 * - collapsed: a 48px <button>. Extremely cheap markup: background only.
 * - peek:      the same button scaled to ~88px via transform, revealing the
 *              name and category in a compact stack. Content fades in.
 * - expanded:  the circle grows to ~min(208px, 56vw) via transform. The
 *              interactive interior (facts, action row, ask entry) lives in a
 *              sibling overlay, so no interactive element ever nests inside
 *              the <button>.
 * - ask:       the interior swaps to a compact conversational UI, still
 *              inside the circle.
 *
 * Motion is transform + opacity only (240ms transform, 180ms opacity;
 * disabled under prefers-reduced-motion). The layout box never changes size,
 * so there is no layout thrash. Interior content is authored on a 48px
 * artboard (1em = circle diameter) and scales with the circle, which keeps
 * every state proportional without per-state pixel math.
 *
 * State transitions live in ./circle-machine.ts (pure, fail-closed). This
 * file owns timers (hover 250ms, blur 150ms), focus management, touch dedup,
 * and data fetching for ask/follow.
 */

import * as React from "react";
import type { CircleProjection, ObjectCapability } from "@/fyd/object/types";
import {
  circleReducer,
  INITIAL_CIRCLE_STATE,
  isCircleOpen,
} from "./circle-machine";

/* ---------------- constants ---------------- */

const BASE_PX = 48;
const PEEK_PX = 88;
const EXPANDED_PX = 208;
const EXPANDED_VW = 0.56; // expanded clamps to min(208px, 56vw)
const HOVER_GRACE_MS = 250;
const BLUR_GRACE_MS = 150;
const TOUCH_DEDUP_MS = 700;
const ANSWER_TRUNCATE = 280;
const NO_EVIDENCE_COPY = "I do not have evidence for that yet.";

/* ---------------- styles ----------------
 * Rendered in a <style> tag per instance so the component is SSR-safe and
 * needs no global stylesheet. Every visual state stays circular:
 * border-radius 50% on the circle, 999px pills for chips/inputs/buttons.
 * Nothing rectangular is ever rendered.
 */
const FYD_CIRCLE_CSS = [
  ".fydc-wrap{position:relative;width:48px;height:48px;flex:none}",
  ".fydc-circle{position:absolute;left:0;top:0;width:48px;height:48px;margin:0;border:0;padding:0;",
  "border-radius:50%;overflow:hidden;font-size:48px;line-height:1.25;font-family:inherit;color:#fff;",
  "transform-origin:center center;transition:transform 240ms cubic-bezier(.2,.7,.3,1),opacity 180ms ease;",
  "-webkit-tap-highlight-color:transparent}",
  "button.fydc-circle{cursor:pointer;background-color:transparent}",
  "button.fydc-circle:focus-visible{outline:2px solid #fff;outline-offset:3px}",
  ".fydc-dialog{cursor:default}",
  ".fydc-dialog:focus{outline:none}",
  ".fydc-bg{position:absolute;inset:0;border-radius:50%;background-size:cover;",
  "background-position:center;background-repeat:no-repeat}",
  ".fydc-scrim{position:absolute;inset:0;border-radius:50%;pointer-events:none;",
  "background:radial-gradient(circle at 50% 40%,rgba(8,6,16,.60) 0%,rgba(8,6,16,.34) 58%,rgba(8,6,16,.52) 100%)}",
  ".fydc-layer{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;",
  "justify-content:center;text-align:center;border-radius:50%;padding:.17em .20em;animation:fydc-in 180ms ease-out}",
  "@keyframes fydc-in{from{opacity:0}to{opacity:1}}",
  ".fydc-peek-name{display:block;max-width:100%;font-size:.150em;font-weight:700;",
  "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".fydc-peek-cat{display:block;max-width:100%;font-size:.105em;opacity:.85;",
  "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.04em}",
  ".fydc-x-name{display:block;max-width:100%;font-size:.082em;font-weight:700;",
  "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".fydc-x-tag{display:block;max-width:100%;font-size:.056em;opacity:.92;",
  "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.03em}",
  ".fydc-x-loc{display:block;max-width:100%;font-size:.047em;opacity:.75;",
  "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.045em}",
  ".fydc-facts{display:block;max-width:100%;margin:.055em 0 0;padding:0}",
  ".fydc-fact{display:block;max-width:100%;font-size:.045em;line-height:1.55;opacity:.9;",
  "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".fydc-actions{display:flex;align-items:center;justify-content:center;gap:.055em;margin-top:.075em;max-width:100%}",
  ".fydc-act{flex:none;width:.135em;height:.135em;border-radius:50%;border:1px solid rgba(255,255,255,.55);",
  "background:rgba(255,255,255,.12);color:#fff;display:inline-flex;align-items:center;justify-content:center;",
  "cursor:pointer;padding:0;text-decoration:none}",
  ".fydc-act svg{width:.068em;height:.068em}",
  ".fydc-act:disabled{opacity:.45;cursor:not-allowed}",
  '.fydc-act[aria-pressed="true"]{background:#fff;border-color:#fff;color:#111}',
  ".fydc-layer .fydc-act:focus-visible,.fydc-why:focus-visible,.fydc-chip:focus-visible,",
  ".fydc-back:focus-visible,.fydc-input:focus-visible{outline:2px solid #fff;outline-offset:2px}",
  ".fydc-why{background:none;border:0;padding:0;margin:.06em 0 0;color:#fff;font-size:.042em;",
  "font-family:inherit;opacity:.8;text-decoration:underline;cursor:pointer}",
  ".fydc-prov{display:block;max-width:100%;margin-top:.055em}",
  ".fydc-prov-label{display:block;font-size:.045em;font-weight:700}",
  ".fydc-prov-detail{display:block;max-width:100%;font-size:.042em;opacity:.85;line-height:1.5;",
  "margin-top:.03em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}",
  ".fydc-askrow{display:flex;align-items:center;gap:.04em;width:100%;margin-bottom:.06em}",
  ".fydc-input{flex:1 1 auto;min-width:0;height:.135em;border-radius:999px;",
  "border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.14);color:#fff;",
  "font-size:.055em;font-family:inherit;padding:0 .9em;outline:none}",
  ".fydc-input::placeholder{color:rgba(255,255,255,.6)}",
  ".fydc-submit{flex:none}",
  ".fydc-chips{display:flex;flex-direction:column;align-items:center;gap:.045em;width:100%;margin-top:.03em}",
  ".fydc-chip{border-radius:999px;border:1px solid rgba(255,255,255,.45);",
  "background:rgba(255,255,255,.10);color:#fff;font-size:.042em;font-family:inherit;",
  "padding:.45em 1em;max-width:94%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}",
  ".fydc-answer{display:block;max-width:100%;font-size:.050em;line-height:1.5;margin-top:.05em;",
  "overflow:hidden;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical}",
  ".fydc-status{display:block;font-size:.050em;opacity:.8;margin-top:.05em}",
  ".fydc-askfoot{display:flex;align-items:center;justify-content:center;gap:.10em;margin-top:.065em}",
  ".fydc-askfoot .fydc-why{margin-top:0}",
  ".fydc-back{border-radius:999px;border:1px solid rgba(255,255,255,.45);",
  "background:rgba(255,255,255,.10);color:#fff;font-size:.042em;font-family:inherit;",
  "padding:.45em 1.2em;cursor:pointer}",
  ".fydc-follow-na{border-radius:999px;border:1px solid rgba(255,255,255,.45);",
  "background:rgba(255,255,255,.08);color:#fff;font-size:.040em;font-family:inherit;",
  "padding:.45em .9em;white-space:nowrap;cursor:not-allowed;opacity:.75}",
  "@media (prefers-reduced-motion:reduce){.fydc-circle,.fydc-layer{transition:none!important;animation:none!important}}",
].join("\n");

/* ---------------- icons (inline SVG, no emoji) ---------------- */

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const IconChat = () => (
  <Icon>
    <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.4-1.2L3 20l1.2-5.1A8.5 8.5 0 1 1 21 11.5z" />
  </Icon>
);
const IconPhone = () => (
  <Icon>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 10a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />
  </Icon>
);
const IconMail = () => (
  <Icon>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </Icon>
);
const IconGlobe = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </Icon>
);
const IconPlus = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
const IconCheck = () => (
  <Icon>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
const IconSend = () => (
  <Icon>
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </Icon>
);

/* ---------------- capability -> action mapping (pure) ----------------
 * The action row renders ONLY from projection.capabilities. kind "view" is
 * ignored: there is no full page anymore. Tested directly in __tests__.
 */
export type CircleAction =
  | { kind: "ask" }
  | { kind: "follow" }
  | { kind: "call"; href: string; label: string }
  | { kind: "email"; href: string; label: string }
  | { kind: "website"; href: string; label: string };

export function circleActionsFor(
  capabilities: readonly ObjectCapability[]
): CircleAction[] {
  const actions: CircleAction[] = [];
  for (const c of capabilities) {
    if (c.kind === "ask") actions.push({ kind: "ask" });
    else if (c.kind === "call") actions.push({ kind: "call", href: c.href, label: c.label });
    else if (c.kind === "email") actions.push({ kind: "email", href: c.href, label: c.label });
    else if (c.kind === "website") actions.push({ kind: "website", href: c.href, label: c.label });
    else if (c.kind === "follow") actions.push({ kind: "follow" });
    // "view" ignored: there is no full page anymore
  }
  return actions;
}

/* ---------------- component ---------------- */

export interface FydCircleProps {
  projection: CircleProjection;
}

type FollowState = "unknown" | "on" | "off" | "unavailable";
type AskStatus = "idle" | "asking" | "answered" | "empty";

export function FydCircle({ projection }: FydCircleProps): React.ReactElement {
  const [machine, dispatch] = React.useReducer(circleReducer, INITIAL_CIRCLE_STATE);
  const open = isCircleOpen(machine);

  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const hoverTimer = React.useRef<number | null>(null);
  const blurTimer = React.useRef<number | null>(null);
  const hoverRef = React.useRef(false);
  const lastTouchRef = React.useRef(0);
  const suppressFocusPeekRef = React.useRef(false);
  const returnFocusRef = React.useRef(false);
  const askingRef = React.useRef(false);
  const followBusyRef = React.useRef(false);

  const [vw, setVw] = React.useState<number>(() =>
    typeof window === "undefined" ? 1024 : window.innerWidth
  );
  const [question, setQuestion] = React.useState("");
  const [askStatus, setAskStatus] = React.useState<AskStatus>("idle");
  const [answer, setAnswer] = React.useState("");
  const [followState, setFollowState] = React.useState<FollowState>("unknown");

  /* Viewport width feeds the min(208px, 56vw) expanded clamp. */
  React.useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* Pending grace timers never outlive the component. */
  React.useEffect(() => {
    return () => {
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
      if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
    };
  }, []);

  const scale =
    machine.state === "peek"
      ? PEEK_PX / BASE_PX
      : open
        ? Math.min(EXPANDED_PX, vw * EXPANDED_VW) / BASE_PX
        : 1;

  /* Tap outside collapses (touch dismissal path). */
  React.useEffect(() => {
    if (machine.state === "collapsed") return;
    const onPointerDown = (ev: PointerEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(ev.target as Node)) dispatch({ type: "tapOutside" });
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [machine.state]);

  /* Focus moves into the circle when it opens; Escape returns it to the button. */
  const wasOpenRef = React.useRef(open);
  React.useEffect(() => {
    if (open && !wasOpenRef.current) dialogRef.current?.focus({ preventScroll: true });
    if (!open && wasOpenRef.current && returnFocusRef.current) {
      returnFocusRef.current = false;
      suppressFocusPeekRef.current = true; // focusing the button must not peek
      buttonRef.current?.focus({ preventScroll: true });
    }
    wasOpenRef.current = open;
  }, [open ]);

  const actions = React.useMemo(
    () => circleActionsFor(projection.capabilities),
    [projection.capabilities]
  );
  const hasFollowCap = actions.some((a) => a.kind === "follow");

  /* Follow status is fetched once per object, only when the capability exists. */
  React.useEffect(() => {
    if (!hasFollowCap) return;
    let alive = true;
    fetch("/api/fyd/follow?objectId=" + encodeURIComponent(projection.id))
      .then((r) => r.json())
      .then((d) => {
        if (alive) setFollowState(d && d.ok && d.following ? "on" : "off");
      })
      .catch(() => {
        if (alive) setFollowState("unavailable");
      });
    return () => {
      alive = false;
    };
  }, [projection.id, hasFollowCap]);

  const recentlyTouched = () => Date.now() - lastTouchRef.current < TOUCH_DEDUP_MS;

  const onMouseEnter = () => {
    if (recentlyTouched()) return; // ignore emulated mouse events after touch
    hoverRef.current = true;
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    dispatch({ type: "hover" });
  };

  const onMouseLeave = () => {
    if (recentlyTouched()) return;
    hoverRef.current = false;
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      dispatch({ type: "unhover" });
    }, HOVER_GRACE_MS);
  };

  const onFocus = () => {
    if (blurTimer.current !== null) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    if (suppressFocusPeekRef.current) {
      suppressFocusPeekRef.current = false;
      return;
    }
    dispatch({ type: "focus" });
  };

  const onBlur = (ev: React.FocusEvent) => {
    const next = ev.relatedTarget as Node | null;
    if (next && wrapRef.current && wrapRef.current.contains(next)) return; // focus moved inside
    dispatch({ type: "blur" });
    if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
    blurTimer.current = window.setTimeout(() => {
      blurTimer.current = null;
      // If the pointer never left, focus loss alone does not collapse a hovered circle.
      dispatch(hoverRef.current ? { type: "focus" } : { type: "blurSettled" });
    }, BLUR_GRACE_MS);
  };

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      returnFocusRef.current = true;
      dispatch({ type: "key", key: "Escape" });
    }
  };

  /* Touch: first tap expands directly. The emulated click is deduped. */
  const onTouchStart = () => {
    lastTouchRef.current = Date.now();
    dispatch({ type: "tap" });
  };

  const onButtonClick = () => {
    if (recentlyTouched()) return;
    dispatch({ type: "tap" });
  };

  const submitQuestion = async (q: string) => {
    const query = q.trim();
    if (!query || askingRef.current) return;
    askingRef.current = true;
    setAskStatus("asking");
    try {
      const res = await fetch("/api/fyd/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: projection.id, question: query, mode: "visitor" }),
      });
      const data = await res.json();
      if (!data || data.ok !== true || data.refusal) {
        setAskStatus("empty");
        setAnswer("");
      } else {
        setAskStatus("answered");
        setAnswer(typeof data.answer === "string" ? data.answer : "");
      }
    } catch {
      // Fail closed: never invent business facts.
      setAskStatus("empty");
      setAnswer("");
    } finally {
      askingRef.current = false;
    }
  };

  const openAsk = () => {
    setQuestion("");
    setAskStatus("idle");
    setAnswer("");
    dispatch({ type: "askOpen" });
  };

  const closeAsk = () => {
    dispatch({ type: "askClose" });
    dialogRef.current?.focus({ preventScroll: true });
  };

  const toggleFollow = async () => {
    if (followBusyRef.current) return;
    if (followState !== "on" && followState !== "off") return;
    followBusyRef.current = true;
    const action = followState === "on" ? "unfollow" : "follow";
    try {
      const res = await fetch("/api/fyd/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectId: projection.id, action }),
      });
      const data = await res.json();
      // Fail closed: only a confirmed ok flips the toggle; anything else
      // lands on the disabled "unavailable" state, never a fake toggle.
      if (data && data.ok === true) setFollowState(action === "follow" ? "on" : "off");
      else setFollowState("unavailable");
    } catch {
      setFollowState("unavailable");
    } finally {
      followBusyRef.current = false;
    }
  };

  const renderAction = (a: CircleAction) => {
    if (a.kind === "ask") {
      return (
        <button
          key="ask"
          type="button"
          className="fydc-act"
          onClick={openAsk}
          aria-label={"Ask about " + name}
        >
          <IconChat />
        </button>
      );
    }
    if (a.kind === "follow") {
      if (followState === "unavailable") {
        return (
          <button
            key="follow"
            type="button"
            className="fydc-follow-na"
            disabled
            aria-label="Follow unavailable"
          >
            Follow unavailable
          </button>
        );
      }
      const on = followState === "on";
      return (
        <button
          key="follow"
          type="button"
          className="fydc-act"
          aria-pressed={on}
          aria-label={on ? "Following " + name + ". Select to unfollow." : "Follow " + name}
          disabled={followState === "unknown"}
          onClick={toggleFollow}
        >
          {on ? <IconCheck /> : <IconPlus />}
        </button>
      );
    }
    const icon =
      a.kind === "call" ? <IconPhone /> : a.kind === "email" ? <IconMail /> : <IconGlobe />;
    const extra =
      a.kind === "website" ? { target: "_blank" as const, rel: "noopener noreferrer" } : {};
    return (
      <a key={a.kind} className="fydc-act" href={a.href} aria-label={a.label} {...extra}>
        {icon}
      </a>
    );
  };

  const renderExpanded = () => (
    <div className="fydc-layer">
      <span className="fydc-x-name">{name}</span>
      <span className="fydc-x-tag">{projection.tagline}</span>
      {projection.locationLabel ? (
        <span className="fydc-x-loc">{projection.locationLabel}</span>
      ) : null}
      {machine.evidence ? (
        <div className="fydc-prov">
          <div className="fydc-prov-label">{projection.provenanceLabel}</div>
          <div className="fydc-prov-detail">{projection.provenanceDetail}</div>
        </div>
      ) : facts.length > 0 ? (
        <div className="fydc-facts">
          {facts.map((f, i) => (
            <span className="fydc-fact" key={i}>
              {f}
            </span>
          ))}
        </div>
      ) : null}
      {actions.length > 0 ? (
        <div className="fydc-actions">{actions.map(renderAction)}</div>
      ) : null}
      <button
        type="button"
        className="fydc-why"
        onClick={() => dispatch({ type: "evidenceToggle" })}
      >
        {machine.evidence ? "Hide" : "Why?"}
      </button>
    </div>
  );

  const renderAsk = () => (
    <div className="fydc-layer">
      <div className="fydc-askrow">
        <input
          className="fydc-input"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitQuestion(question);
            }
          }}
          placeholder={"Ask about " + name}
          aria-label={"Ask about " + name}
        />
        <button
          type="button"
          className="fydc-act fydc-submit"
          onClick={() => submitQuestion(question)}
          aria-label="Send question"
        >
          <IconSend />
        </button>
      </div>
      {machine.evidence ? (
        <div className="fydc-prov">
          <div className="fydc-prov-label">{projection.provenanceLabel}</div>
          <div className="fydc-prov-detail">{projection.provenanceDetail}</div>
        </div>
      ) : askStatus === "asking" ? (
        <div className="fydc-status">Thinking...</div>
      ) : askStatus === "answered" ? (
        <div className="fydc-answer">{shownAnswer}</div>
      ) : askStatus === "empty" ? (
        <div className="fydc-answer">{NO_EVIDENCE_COPY}</div>
      ) : samples.length > 0 ? (
        <div className="fydc-chips">
          {samples.map((q, i) => (
            <button
              key={i}
              type="button"
              className="fydc-chip"
              onClick={() => {
                setQuestion(q);
                submitQuestion(q);
              }}
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}
      <div className="fydc-askfoot">
        <button
          type="button"
          className="fydc-why"
          onClick={() => dispatch({ type: "evidenceToggle" })}
        >
          {machine.evidence ? "Hide" : "Why?"}
        </button>
        <button type="button" className="fydc-back" onClick={closeAsk}>
          Back
        </button>
      </div>
    </div>
  );

  const name = projection.name;
  const facts = projection.topFacts.slice(0, 3);
  const samples = projection.sampleQuestions.slice(0, 3);
  const shownAnswer =
    answer.length > ANSWER_TRUNCATE ? answer.slice(0, ANSWER_TRUNCATE - 3) + "..." : answer;
  const bg = projection.background;
  const bgStyle: React.CSSProperties =
    bg.kind === "image" ? { backgroundImage: 'url("' + bg.src + '")' } : { background: bg.css };
  const circleTransform = "scale(" + scale + ")";

  return (
    <div
      ref={wrapRef}
      className="fydc-wrap"
      style={open ? { zIndex: 30 } : undefined}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <style>{FYD_CIRCLE_CSS}</style>
      <button
        ref={buttonRef}
        type="button"
        className="fydc-circle"
        style={{ transform: circleTransform }}
        aria-label={name}
        aria-expanded={open}
        tabIndex={open ? -1 : 0}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onTouchStart={onTouchStart}
        onClick={onButtonClick}
      >
        <span className="fydc-bg" style={bgStyle} aria-hidden="true" />
        {machine.state === "peek" ? (
          <span className="fydc-layer" aria-hidden="true">
            <span className="fydc-scrim" />
            <span className="fydc-peek-name">{name}</span>
            {projection.category ? (
              <span className="fydc-peek-cat">{projection.category}</span>
            ) : null}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          ref={dialogRef}
          className="fydc-circle fydc-dialog"
          style={{ transform: circleTransform }}
          role="dialog"
          aria-label={name}
          tabIndex={-1}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onTouchStart={onTouchStart}
        >
          <span className="fydc-bg" style={bgStyle} aria-hidden="true" />
          <span className="fydc-scrim" aria-hidden="true" />
          {machine.state === "ask" ? renderAsk() : renderExpanded()}
        </div>
      ) : null}
    </div>
  );
}
