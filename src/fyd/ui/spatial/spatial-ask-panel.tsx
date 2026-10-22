"use client";

/**
 * SpatialAskPanel: the spatial presentation of the ONE Ask FYD chat,
 * scoped to one focused object.
 *
 * Canonical chat consolidation (2026-10-22): this panel no longer owns a
 * private fetch or a hardcoded tenant. Like every FYD ask surface it
 * talks to the pipeline only through the canonical client
 * (@/fyd/ask/ask-client) and the trusted-path route
 * POST /api/fyd/ask/[siteId]; the tenant arrives as the `siteId` prop
 * from the portal that owns the snapshot context. Evidence bounded:
 * answers cite sources; refusal is rendered honestly instead of
 * guessing. Structure mirrors the canonical AskObjectPanel; the spatial
 * skin (dark portal styling) is presentation only.
 */

import { useState } from "react";
import type { AskFydCitation } from "../../ask/visitor-answer";
import { askFydQuestion } from "../../ask/ask-client";

type AskStatus = "idle" | "loading" | "answered" | "error";

export function SpatialAskPanel({
  siteId,
  objectId,
  objectName,
  sampleQuestions,
}: {
  /** Tenant slug for the trusted-path route (the snapshot's site). */
  siteId: string;
  /** Graph object id, or undefined to ask about the site's business object. */
  objectId?: string;
  objectName: string;
  sampleQuestions: string[];
}) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<AskStatus>("idle");
  const [answer, setAnswer] = useState("");
  const [refusal, setRefusal] = useState(false);
  const [citations, setCitations] = useState<AskFydCitation[]>([]);
  const [error, setError] = useState("");

  const busy = status === "loading";

  async function ask(q: string) {
    const query = q.trim();
    if (!query || busy) return;
    setQuestion(query);
    setStatus("loading");
    setError("");
    let data;
    try {
      data = await askFydQuestion({
        siteId,
        objectId,
        question: query,
        mode: "visitor",
      });
    } catch {
      setStatus("error");
      setError("Could not reach Ask FYD. Check your connection and try again.");
      return;
    }
    if (!data.ok) {
      setStatus("error");
      setError(
        data.transportError
          ? "Could not reach Ask FYD. Check your connection and try again."
          : (data.error ?? "Ask FYD could not answer right now. Please try again."),
      );
      return;
    }
    setAnswer(data.answer ?? "");
    setRefusal(data.refusal === true);
    setCitations(Array.isArray(data.citations) ? data.citations : []);
    setStatus("answered");
  }

  const paragraphs = answer
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <div className="mx-auto w-full max-w-md px-6">
      <p className="text-center text-sm font-semibold text-purple-100">
        Asking about {objectName}
      </p>
      {sampleQuestions.length > 0 && (
        <div
          className="mt-3 flex flex-wrap justify-center gap-2"
          aria-label="Sample questions"
        >
          {sampleQuestions.slice(0, 3).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void ask(q)}
              disabled={busy}
              className="min-h-[44px] rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs text-purple-50 hover:bg-white/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              {q}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="mt-3 flex flex-col gap-2"
        aria-label={"Ask about " + objectName}
      >
        <label htmlFor="spatial-ask-input" className="sr-only">
          Ask a question about {objectName}
        </label>
        <input
          id="spatial-ask-input"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What do you want to know?"
          disabled={busy}
          maxLength={2000}
          className="min-h-[44px] w-full rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-purple-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        />
        <button
          type="submit"
          disabled={busy || question.trim().length === 0}
          className="min-h-[44px] rounded-full bg-amber-400 px-6 py-2 text-sm font-semibold text-purple-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
        >
          {busy ? "Asking..." : "Ask"}
        </button>
      </form>
      <div aria-live="polite" className="mt-3 text-left">
        {busy && <p className="text-xs text-purple-200">Looking that up...</p>}
        {status === "error" && (
          <p role="alert" className="text-xs font-medium text-red-200">
            {error}
          </p>
        )}
        {status === "answered" && (
          <div className="rounded-2xl border border-white/15 bg-black/30 p-4">
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className="mt-2 text-sm leading-relaxed text-purple-50 first:mt-0"
              >
                {p}
              </p>
            ))}
            {refusal && (
              <p className="mt-2 text-xs text-purple-200">
                FYD only answers from what it can verify. If you own this
                business, you can add the missing detail and ask again.
              </p>
            )}
            {citations.length > 0 && (
              <details className="mt-3">
                <summary className="inline-block min-h-[24px] cursor-pointer py-1 text-xs text-purple-200 underline decoration-dotted underline-offset-2">
                  Why this?
                </summary>
                <ul className="mt-2 space-y-2">
                  {citations.map((c) => (
                    <li
                      key={c.n}
                      className="text-xs leading-relaxed text-purple-100"
                    >
                      <span className="font-semibold">
                        [{c.n}] {c.label}
                      </span>
                      <span className="block break-words text-purple-200/80">
                        Source: {c.source}
                      </span>
                      <span className="block text-purple-200/80">
                        Basis: {c.basis}
                      </span>
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
