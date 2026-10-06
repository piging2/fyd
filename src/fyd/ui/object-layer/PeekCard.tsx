"use client";

/**
 * FYD Peek: STATE 2. The compact object preview.
 *
 * Rectangular popover, max ~400px. Identity, type, one-line
 * description, 2-4 contextually valid actions, and the Ask FYD entry
 * ("What do you want to know?" + up to 3 contextual suggestions).
 * Content-budgeted: never scrolls.
 *
 * Grammar: the neutral FYD shell (./fyd-shell). One quiet border, one
 * quiet shadow, radius 16. FYD identity is the glyph mark + the royal
 * Ask FYD action, nothing else. Actions come from the PresentationSpec
 * (capability-derived, priority-ordered); the peek renders the first
 * 2-4. Ask FYD never opens a chatbot here: engaging a question calls
 * onAsk, and the caller opens the workspace sheet where conversation
 * has room.
 */

import * as React from "react";
import { ObjectIdentityMark } from "../../presentation/object-identity-mark";
import type { ObjectPresentationIdentity } from "../../presentation/identity";
import { shell, shellSurface, type ShellColorScheme } from "./fyd-shell";
import {
  peekActionsFor,
  type PresentationSpec,
  type SpecAction,
} from "./presentation-spec";

/** Short-description display budget: one sentence, roughly 80-140 chars. */
export const PEEK_DESC_MAX = 140;
/** Peek popover max width (px). Directive: approximately 360-420. */
export const PEEK_W = 400;

/**
 * Loading skeleton block. The pulse keyframes live in the layer
 * stylesheet (disabled under prefers-reduced-motion); the animation
 * name here must match.
 */
function Skeleton({ width, height }: { width: string | number; height: number }) {
  return (
    <div
      aria-hidden="true"
      data-fyd-skeleton
      style={{
        width,
        height,
        borderRadius: 6,
        background: "rgba(26,23,41,0.08)",
        animation: "fyd-skeleton 1.2s ease-in-out infinite",
      }}
    />
  );
}

/**
 * Set view-transition-name imperatively: React's CSSProperties type
 * does not carry the property on every TS lib, and setProperty is
 * exact. Applied to the identity row so the avatar/logo + title
 * persist across the peek -> workspace transition.
 */
function useTransitionName(transitionId: string | undefined) {
  return React.useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        if (transitionId) el.style.setProperty("view-transition-name", transitionId);
        else el.style.removeProperty("view-transition-name");
      }
    },
    [transitionId],
  );
}

/**
 * Pure: truncate to the description budget at a word boundary.
 * Deterministic; no layout measurement.
 */
export function truncateDesc(text: string, max = PEEK_DESC_MAX): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.5 ? cut.slice(0, at) : cut).trimEnd() + "…";
}

/** The small FYD glyph mark: gold edge, royal tint, initials. */
export function FydGlyphMark({
  name,
  objectId,
  identity,
  size = 28,
}: {
  name: string;
  objectId?: string;
  identity?: ObjectPresentationIdentity;
  size?: number;
}) {
  if (objectId || identity) return <ObjectIdentityMark identity={identity} object={{ id: objectId ?? "", name }} size={size} decorative />;
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        color: "#4C1D95",
        background: "linear-gradient(135deg,#F3EFFF 0%,#E4D9FB 100%)",
        border: "1.5px solid #C9A227",
      }}
    >
      {initials}
    </span>
  );
}

function ActionButton({
  action,
  primary,
  scheme,
  onPress,
}: {
  action: SpecAction;
  primary: boolean;
  scheme: ShellColorScheme;
  onPress: (action: SpecAction) => void;
}) {
  const dark = scheme === "dark";
  const inner = (
    <span className="truncate">{action.label}</span>
  );
  const style: React.CSSProperties = primary
    ? {
        background: "#7C5CD6",
        color: "#FFFFFF",
        border: "1px solid #7C5CD6",
        minHeight: shell.touchTarget,
      }
    : {
        background: "transparent",
        color: dark ? shell.surface.inkOnDark : shell.surface.ink,
        border: dark
          ? "1px solid rgba(244,241,234,0.22)"
          : "1px solid rgba(26,23,41,0.16)",
        minHeight: shell.touchTarget,
      };
  if (action.kind === "website" && action.href) {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex flex-1 items-center justify-center rounded-[10px] px-3 text-[14px] font-semibold"
        style={style}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onPress(action)}
      className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-[10px] px-3 text-[14px] font-semibold"
      style={style}
    >
      {inner}
    </button>
  );
}

export function PeekCard({
  spec,
  onAction,
  onAsk,
  onClose,
  scheme = "light",
  initialFocus = "none",
  actionOverride,
  loading = false,
  transitionId,
  id,
}: {
  spec: PresentationSpec;
  onAction: (action: SpecAction) => void;
  /** A question was engaged: the caller opens the workspace sheet. */
  onAsk: (question: string) => void;
  onClose: () => void;
  scheme?: ShellColorScheme;
  initialFocus?: "ask" | "none";
  /**
   * Replace the default button for an action kind (e.g. render the
   * real Follow/Like toggles in place). Return null for the default.
   */
  actionOverride?: (action: SpecAction) => React.ReactNode | null;
  /**
   * The projection is still loading: render skeleton blocks instead of
   * description/actions/suggestions. Identity (name from the
   * descriptor) renders immediately.
   */
  loading?: boolean;
  /**
   * Shared identity name for the peek -> workspace view transition
   * (see ./view-transitions). The workspace header uses the same
   * name; the avatar/logo + title persist through the expand.
   */
  transitionId?: string;
  id?: string;
}) {
  const surf = shellSurface(scheme);
  const actions = peekActionsFor(spec);
  const askAction = actions.find((a) => a.kind === "ask") ?? null;
  const otherActions = actions.filter((a) => a.kind !== "ask");
  const [question, setQuestion] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const identityRef = useTransitionName(transitionId);

  React.useEffect(() => {
    if (initialFocus === "ask") inputRef.current?.focus();
  }, [initialFocus]);

  const submit = React.useCallback(
    (q: string) => {
      const query = q.trim();
      if (query.length === 0) return;
      onAsk(query);
    },
    [onAsk],
  );

  return (
    <div
      ref={rootRef}
      id={id}
      role="dialog"
      aria-modal="false"
      aria-label={`${spec.name} preview`}
      data-fyd-surface="peek"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="fyd-peek"
      style={{
        width: "100%",
        maxWidth: PEEK_W,
        background: surf.bg,
        color: surf.ink,
        border: surf.border,
        borderRadius: shell.radius.peek,
        boxShadow: shell.elevation.peek,
        padding: shell.spacing.peekPad,
        isolation: "isolate",
      }}
    >
      {/* Identity row: glyph mark + name + kind. */}
      <div ref={identityRef} className="flex items-center gap-2.5">
        <FydGlyphMark identity={spec.identity} objectId={spec.objectId} name={spec.name} size={30} />
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-semibold"
            style={{ fontSize: shell.type.name, color: surf.ink }}
          >
            {spec.name}
          </p>
          {spec.kindLabel && (
            <p
              className="truncate"
              style={{ fontSize: shell.type.caption, color: surf.inkSoft }}
            >
              {spec.kindLabel}
            </p>
          )}
        </div>
        {spec.ownerDemo && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide"
            style={{
              background: "#FEF3C7",
              color: "#92400E",
              border: "1px solid #F59E0B",
            }}
          >
            DEMO
          </span>
        )}
      </div>

      {/* One-line description, or its skeleton while loading. */}
      {loading && !spec.shortDescription ? (
        <div className="mt-2" aria-hidden="true">
          <Skeleton width="100%" height={14} />
        </div>
      ) : (
        spec.shortDescription && (
          <p
            className="mt-2"
            style={{
              fontSize: shell.type.desc,
              lineHeight: 1.45,
              color: surf.inkSoft,
            }}
          >
            {truncateDesc(spec.shortDescription)}
          </p>
        )
      )}

      {/* Actions: Ask FYD first, then Website/Contact/Follow/Like within
          the density budget. Skeleton pills while loading. */}
      {loading && actions.length === 0 ? (
        <div className="mt-3 flex gap-2" aria-hidden="true">
          <Skeleton width={96} height={shell.touchTarget} />
          <Skeleton width={72} height={shell.touchTarget} />
          <Skeleton width={72} height={shell.touchTarget} />
        </div>
      ) : (
        actions.length > 0 && (
        <div className="mt-3 flex gap-2">
          {askAction && (
            <ActionButton
              action={askAction}
              primary
              scheme={scheme}
              onPress={() => inputRef.current?.focus()}
            />
          )}
          {otherActions.map((a) => {
            const override = actionOverride?.(a);
            if (override) return <React.Fragment key={a.kind}>{override}</React.Fragment>;
            return (
              <ActionButton
                key={a.kind}
                action={a}
                primary={false}
                scheme={scheme}
                onPress={onAction}
              />
            );
          })}
        </div>
        )
      )}

      {/* Ask FYD entry: "What do you want to know?" + suggestions. */}
      {askAction && (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
        >
          <label
            htmlFor={id ? `${id}-ask` : undefined}
            className="font-medium"
            style={{ fontSize: shell.type.caption, color: surf.inkSoft }}
          >
            What do you want to know?
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              ref={inputRef}
              id={id ? `${id}-ask` : undefined}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about this place…"
              autoComplete="off"
              className="min-h-[44px] min-w-0 flex-1 rounded-[10px] px-3 text-[14px]"
              style={{
                border: surf.border,
                background: scheme === "dark" ? "rgba(244,241,234,0.06)" : "#FFFFFF",
                color: surf.ink,
              }}
            />
            <button
              type="submit"
              disabled={question.trim().length === 0}
              aria-label="Ask FYD"
              className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[10px] text-[16px] font-bold disabled:cursor-default disabled:opacity-40"
              style={{ background: "#7C5CD6", color: "#FFFFFF" }}
            >
              →
            </button>
          </div>
          {spec.suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {spec.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="cursor-pointer rounded-full px-2.5 py-1.5 text-left"
                  style={{
                    fontSize: shell.type.caption,
                    color: surf.inkSoft,
                    border: surf.border,
                    background: "transparent",
                    minHeight: 40,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
