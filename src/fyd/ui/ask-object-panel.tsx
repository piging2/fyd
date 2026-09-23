/**
 * AskObjectPanel: visitor Ask FYD for one object Node.
 *
 * Posts to POST /api/fyd/ask with the object's site id, and with the
 * object id when known (object-targeted questions: the pipeline answers
 * from that object's evidence graph). Evidence-bounded: answers cite
 * their sources; when the pipeline has no supporting evidence it refuses
 * honestly instead of guessing. Never hallucinates business information.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { fyd, fydMirrorCard } from "./object-layer/fyd-tokens";
import type { AskFydCitation } from "../ask/visitor-answer";
import type { AskPageContext } from "./object-layer/types";

type AskStatus = "idle" | "loading" | "answered" | "error";

interface AskApiResponse {
  ok: boolean;
  answer?: string;
  refusal?: boolean;
  citations?: AskFydCitation[];
  error?: string;
}

/**
 * Pure: the POST /api/fyd/ask body. objectId is included only when known,
 * so the pipeline can target the question at this object's evidence graph.
 * pageContext is included when the caller has it (the Circle layer passes
 * the visible object ids and the viewer's current object); the route
 * currently reads only known fields and ignores extras, so this is a
 * forward-compatible client contract the pipeline can adopt.
 */
export function askRequestBody(
  siteId: string,
  objectId: string | undefined,
  question: string,
  pageContext?: AskPageContext,
): { siteId: string; objectId?: string; question: string; mode: "visitor"; pageContext?: AskPageContext } {
  return {
    siteId,
    ...(objectId ? { objectId } : {}),
    question,
    mode: "visitor",
    ...(pageContext &&
    (pageContext.contextObjectId || pageContext.visibleObjectIds.length > 0)
      ? { pageContext }
      : {}),
  };
}

export function AskObjectPanel({
  siteId,
  objectId,
  objectName,
  sampleQuestions,
  dark,
  compact,
  pageContext,
  initialQuestion,
}: {
  siteId: string;
  /** PING object id (e.g. "happy-place"); sent when known so the answer
   * is targeted at this object. Omitted when unknown. */
  objectId?: string;
  objectName: string;
  sampleQuestions: string[];
  /** Dark variant for the expanded object rich card (light by default). */
  dark?: boolean;
  /** Compact card layout: the panel renders inside a ~300px oval where a
   * viewport-driven sm:flex-row would squeeze the question input. Stacks
   * the form vertically so the input keeps full width. Portal surfaces
   * leave this unset and keep the responsive row. */
  compact?: boolean;
  /** Page context from the Circle layer (visible objects + the viewer's
   * current object); sent with the ask request when present. */
  pageContext?: AskPageContext;
  /** A question engaged from the peek: asked once automatically on mount
   * so the workspace opens mid-conversation. */
  initialQuestion?: string;
}) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<AskStatus>("idle");
  const [answer, setAnswer] = useState("");
  const [refusal, setRefusal] = useState(false);
  const [citations, setCitations] = useState<AskFydCitation[]>([]);
  const [error, setError] = useState("");

  const busy = status === "loading";

  // A peek-engaged question starts the conversation on mount. Once only:
  // re-renders must not re-ask.
  const initialAskedRef = useRef(false);
  useEffect(() => {
    if (initialAskedRef.current) return;
    const q = (initialQuestion ?? "").trim();
    if (q.length === 0) return;
    initialAskedRef.current = true;
    void ask(q);
  }, [initialQuestion]);

  async function ask(q: string) {
    const query = q.trim();
    if (!query || busy) return;
    setQuestion(query);
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/fyd/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(askRequestBody(siteId, objectId, query, pageContext)),
      });
      let data: AskApiResponse | null = null;
      try {
        data = (await res.json()) as AskApiResponse;
      } catch {
        data = null;
      }
      if (!res.ok || !data || !data.ok) {
        setStatus("error");
        setError(data?.error ?? "Ask FYD could not answer right now. Please try again.");
        return;
      }
      setAnswer(data.answer ?? "");
      setRefusal(data.refusal === true);
      setCitations(Array.isArray(data.citations) ? data.citations : []);
      setStatus("answered");
    } catch {
      setStatus("error");
      setError("Could not reach Ask FYD. Check your connection and try again.");
    }
  }

  const paragraphs = answer
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Dark variant: the same structure on the rich card's dark surface.
  const qBtn = dark
    ? "min-h-[44px] rounded-full border bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    : "min-h-[44px] rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600";
  // Dark sample chips carry the quiet FYD gold edge.
  const qBtnStyle = dark ? { border: fyd.border.goldSoft } : undefined;
  const inputCls = dark
    ? "min-h-[44px] w-full min-w-0 flex-1 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-base text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    : "min-h-[44px] w-full min-w-0 flex-1 rounded-full border border-stone-300 bg-white px-5 py-3 text-base text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600";
  // Compact card: the ~300px oval leaves ~200px of input text area, but the
  // placeholder ("What do you want to know?") measures ~225px at text-base.
  // Slightly smaller text and tighter padding keep the full placeholder
  // visible; portal surfaces keep text-base.
  const compactInputCls = inputCls.replace("px-5", "px-4").replace("text-base", "text-sm");

  const submitCls = dark
    ? "min-h-[44px] rounded-full border px-6 py-3 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    : "min-h-[44px] rounded-full bg-amber-600 px-6 py-3 text-base font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2";
  const submitStyle = dark
    ? {
        background: "rgba(255,255,255,0.9)",
        color: fyd.surface.depth,
        border: fyd.border.gold,
      }
    : undefined;

  return (
    <div>
      <div className="flex flex-wrap gap-2" aria-label="Sample questions">
        {sampleQuestions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void ask(q)}
            disabled={busy}
            className={qBtn}
            style={qBtnStyle}
          >
            {q}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className={
          compact ? "mt-4 flex w-full flex-col gap-3" : "mt-4 flex flex-col gap-3 sm:flex-row"
        }
        aria-label={"Ask about " + objectName}
      >
        <label htmlFor="ask-object-input" className="sr-only">
          Ask a question about {objectName}
        </label>
        <input
          id="ask-object-input"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What do you want to know?"
          disabled={busy}
          maxLength={2000}
          className={compact ? compactInputCls : inputCls}
        />
        <button
          type="submit"
          disabled={busy || question.trim().length === 0}
          className={compact ? submitCls + " w-full" : submitCls}
          style={submitStyle}
        >
          {busy ? "Asking..." : "Ask"}
        </button>
      </form>

      <div aria-live="polite" className="mt-4">
        {busy && <p className={dark ? "text-sm text-white/60" : "text-sm text-stone-500"}>Looking that up...</p>}
        {status === "error" && (
          <p role="alert" className={dark ? "text-sm font-medium text-red-300" : "text-sm font-medium text-red-700"}>
            {error}
          </p>
        )}
        {status === "answered" && (
          <div
            className={dark ? "border p-4" : "rounded-[28px] border border-stone-200 bg-white p-4"}
            style={
              dark
                ? {
                    borderRadius: 28,
                    border: fyd.border.goldSoft,
                    background: fydMirrorCard,
                  }
                : undefined
            }
          >
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className={
                  dark
                    ? "mt-2 text-base leading-relaxed text-white/90 first:mt-0"
                    : "mt-2 text-base leading-relaxed text-stone-800 first:mt-0"
                }
              >
                {p}
              </p>
            ))}
            {refusal && (
              <p className={dark ? "mt-2 text-sm text-white/60" : "mt-2 text-sm text-stone-500"}>
                FYD only answers from what it can verify about this business. If you own this
                business, you can add the missing detail and ask again.
              </p>
            )}
            {citations.length > 0 && (
              <details className="mt-3">
                <summary
                  className={
                    dark
                      ? "inline-block min-h-[24px] cursor-pointer py-1 text-sm text-white/70 underline decoration-dotted underline-offset-2"
                      : "inline-block min-h-[24px] cursor-pointer py-1 text-sm text-stone-600 underline decoration-dotted underline-offset-2"
                  }
                >
                  Why this?
                </summary>
                <ul className="mt-2 space-y-2">
                  {citations.map((c) => (
                    <li
                      key={c.n}
                      className={dark ? "text-sm leading-relaxed text-white/80" : "text-sm leading-relaxed text-stone-700"}
                    >
                      <span className="font-semibold">
                        [{c.n}] {c.label}
                      </span>
                      <span className={dark ? "block break-words text-xs text-white/50" : "block break-words text-xs text-stone-500"}>Source: {c.source}</span>
                      <span className={dark ? "block text-xs text-white/50" : "block text-xs text-stone-500"}>Basis: {c.basis}</span>
                      {c.lastChecked ? (
                        <span className={dark ? "block text-xs text-white/50" : "block text-xs text-stone-500"}>Last checked: {c.lastChecked}</span>
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
  );
}
