"use client";
import { ObjectIdentityMark } from "../presentation/object-identity-mark";

/**
 * GlobalAskDock: the ONE small FYD assistant for the entire PING homepage.
 *
 * Circle-Only Product Reset (2026-09-22): there are not N assistants, one
 * per Circle. There is exactly one of these. It understands which Circle
 * the user is currently interacting with: hovering or selecting a Circle
 * updates `context` (via PortalHost's onContextChange), and the Circle's
 * "Ask FYD" orbit control opens the dock with that circle as context.
 *
 * The dock is deliberately small: a floating circular trigger plus a
 * compact panel (input, answer, collapsed "Why this?" citations). It never
 * dominates the interface. Circle is discovery; this dock is intelligence.
 *
 * Q&A pattern harvested from src/fyd/components/ask-fyd-widget.tsx
 * (states, refusal copy, citation disclosure, 44px targets, 320px-safe),
 * re-skinned for the PING homepage tokens. Posts to POST /api/fyd/ask
 * with { siteId, objectId, question, mode: "visitor" }: evidence-bounded,
 * anonymous, public objects only. Fail closed: transport or server failure
 * never invents an answer.
 */

import * as React from "react";
import { MessageCircleQuestion, X } from "lucide-react";
import type { AskFydCitation } from "@/fyd/ask/visitor-answer";
import { cn } from "@/lib/utils";

export interface AskDockContext {
  /** Tenant for the trusted-path Ask route (/api/fyd/ask/[siteId]). */
  siteId: string;
  /** The circle's PING object id, sent as the question's object scope. */
  objectId: string;
  name: string;
}

interface GlobalAskDockProps {
  /** The circle currently holding attention, or null when none does. */
  context: AskDockContext | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AskStatus = "idle" | "loading" | "answered" | "error";

interface AskApiResponse {
  ok: boolean;
  answer?: string;
  refusal?: boolean;
  citations?: AskFydCitation[];
  error?: string;
}

const NO_EVIDENCE_COPY = "I don't have evidence for that yet.";

export function GlobalAskDock({ context, open, onOpenChange }: GlobalAskDockProps) {
  const [question, setQuestion] = React.useState("");
  const [status, setStatus] = React.useState<AskStatus>("idle");
  const [answer, setAnswer] = React.useState("");
  const [refusal, setRefusal] = React.useState(false);
  const [citations, setCitations] = React.useState<AskFydCitation[]>([]);
  const [error, setError] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  // Guards against late responses: every submit bumps requestRef; only the
  // latest request for the current context may write state.
  const requestRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);
  const wasOpenRef = React.useRef(false);

  const configured = context !== null;
  const busy = status === "loading";
  const canAsk = configured && !busy && question.trim().length > 0;

  // A new context resets the conversation: answers belong to the identity
  // they were asked about, never carried across identities.
  const contextKey = context ? `${context.siteId}:${context.objectId}` : null;
  React.useEffect(() => {
    // A new identity invalidates any in-flight answer: abort the network
    // request and bump the request id so a late response is discarded.
    abortRef.current?.abort();
    abortRef.current = null;
    requestRef.current += 1;
    setQuestion("");
    setStatus("idle");
    setAnswer("");
    setRefusal(false);
    setCitations([]);
    setError("");
  }, [contextKey]);

  // Abort any in-flight request on unmount.
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // Focus the input when the dock opens; Escape closes it. When the dock
  // closes, restore focus to the invoking trigger control.
  React.useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        triggerRef.current?.focus({ preventScroll: true });
      }
      return;
    }
    wasOpenRef.current = true;
    inputRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const q = question.trim();
    if (!configured || busy || q.length === 0 || !context) return;
    // One in-flight request at a time: abort the previous answer attempt.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = (requestRef.current += 1);
    const askedObjectId = context.objectId;
    const askedKey = contextKey;
    setStatus("loading");
    setError("");
    // True only while this request is still the latest for the same identity.
    // Guards against A-resolves-after-B overwrites when identities change.
    const stillCurrent = () =>
      requestRef.current === requestId && contextKey === askedKey;
    try {
      // Trusted path: the tenant comes from the route path, the object
      // scope from the body. Evidence-bounded, visitor-safe, no grants.
      const res = await fetch("/api/fyd/ask/" + encodeURIComponent(context.siteId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: q,
          objectId: askedObjectId,
          mode: "visitor",
        }),
        signal: controller.signal,
      });
      let data: AskApiResponse | null = null;
      try {
        data = (await res.json()) as AskApiResponse;
      } catch {
        data = null;
      }
      if (!stillCurrent()) return;
      if (!res.ok || !data || !data.ok) {
        setStatus("error");
        setError(data?.error ?? "Ask FYD could not answer right now. Please try again.");
        return;
      }
      setAnswer(data.answer ?? "");
      setRefusal(data.refusal === true);
      setCitations(Array.isArray(data.citations) ? data.citations : []);
      setStatus("answered");
    } catch (err) {
      // Aborted requests are superseded, never errors: state was already reset.
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!stillCurrent()) return;
      setStatus("error");
      setError("Could not reach Ask FYD. Check your connection and try again.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  const paragraphs = answer
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <>
      {/* Floating trigger: one small circle, bottom-right, gold on ink. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-label={open ? "Close Ask FYD" : "Ask FYD"}
        className={cn(
          "fixed bottom-6 right-6 z-[70] flex h-14 w-14 items-center justify-center rounded-full",
          "bg-deep text-honey shadow-[0_10px_28px_rgba(0,0,0,0.45)]",
          "outline-none transition-transform focus-visible:ring-2 focus-visible:ring-honey focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "motion-safe:hover:scale-105 motion-safe:active:scale-95",
        )}
        style={{ boxShadow: "0 0 0 1px rgba(201,162,39,0.55), 0 10px 28px rgba(0,0,0,0.45)" }}
      >
        {open ? (
          <X className="h-6 w-6" aria-hidden="true" />
        ) : (
          <MessageCircleQuestion className="h-6 w-6" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Ask FYD"
          className="fixed bottom-24 right-6 z-[70] w-[320px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-border-soft bg-surface shadow-[0_24px_70px_rgba(0,0,0,0.35)]"
        >
          <div className="border-b border-border-soft/60 px-4 pb-3 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-accent">
                Ask <span className="text-honey">FYD</span>
              </h2>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close Ask FYD"
                className="flex h-9 w-9 items-center justify-center rounded-full text-accent/60 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1 text-xs text-accent/70" aria-live="polite">
              {context ? (
                <>
                  <ObjectIdentityMark object={{ id: context.objectId, name: context.name }} size={24} decorative className="inline-block align-middle mr-1" />
                  Asking about <strong className="text-accent">{context.name}</strong>
                </>
              ) : (
                "Hover a Circle to choose who to ask about."
              )}
            </p>
          </div>

          <div className="px-4 py-3">
            <form onSubmit={onSubmit} aria-label="Ask FYD">
              <label htmlFor="global-ask-input" className="sr-only">
                {context ? `Ask a question about ${context.name}` : "Ask a question"}
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  id="global-ask-input"
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={configured ? "What do you want to know?" : "Pick a Circle first"}
                  disabled={!configured || busy}
                  maxLength={2000}
                  className="min-h-[44px] min-w-0 flex-1 rounded-full border border-border-soft bg-background px-4 text-sm text-text placeholder:text-text-muted/70 focus:outline-none focus:ring-2 focus:ring-honey disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!canAsk}
                  className="min-h-[44px] shrink-0 rounded-full bg-honey px-4 text-sm font-semibold text-honey-foreground hover:bg-honey-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Asking..." : "Ask"}
                </button>
              </div>
            </form>

            <div aria-live="polite" className="mt-3 max-h-64 overflow-y-auto">
              {busy && <p className="text-sm text-accent/70">Looking that up...</p>}
              {status === "error" && (
                <p role="alert" className="text-sm font-medium text-accent">
                  {error}
                </p>
              )}
              {status === "answered" && (
                <div>
                  {paragraphs.length > 0 ? (
                    paragraphs.map((p, i) => (
                      <p key={i} className="mt-2 text-sm leading-relaxed text-accent">
                        {p}
                      </p>
                    ))
                  ) : (
                    <p className="mt-2 text-sm leading-relaxed text-accent">{NO_EVIDENCE_COPY}</p>
                  )}
                  <p className="mt-2 text-xs font-medium text-forest">
                    {refusal || paragraphs.length === 0
                      ? "Nothing invented: no evidence found."
                      : "Answered from verified business evidence."}
                  </p>
                  {citations.length > 0 && (
                    <details className="mt-2">
                      <summary className="inline-block min-h-[24px] cursor-pointer py-1 text-xs text-ping-violet underline">
                        Why this?
                      </summary>
                      <ul className="mt-1 space-y-2">
                        {citations.map((c) => (
                          <li key={c.n} className="text-xs leading-relaxed text-accent/80">
                            <span className="font-semibold">
                              [{c.n}] {c.label}
                            </span>
                            <span className="block break-words opacity-80">Source: {c.source}</span>
                            <span className="block opacity-80">Basis: {c.basis}</span>
                            {c.lastChecked ? (
                              <span className="block opacity-80">Last checked: {c.lastChecked}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
