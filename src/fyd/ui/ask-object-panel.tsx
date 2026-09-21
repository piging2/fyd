/**
 * AskObjectPanel: visitor Ask FYD for one object Node.
 *
 * Posts to POST /api/fyd/ask with the object's site id. Evidence-bounded:
 * answers cite their sources; when the pipeline has no supporting evidence
 * it refuses honestly instead of guessing. Never hallucinates business
 * information.
 */

"use client";

import { useState } from "react";
import type { AskFydCitation } from "../ask/visitor-answer";

type AskStatus = "idle" | "loading" | "answered" | "error";

interface AskApiResponse {
  ok: boolean;
  answer?: string;
  refusal?: boolean;
  citations?: AskFydCitation[];
  error?: string;
}

export function AskObjectPanel({
  siteId,
  objectName,
  sampleQuestions,
}: {
  siteId: string;
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
    try {
      const res = await fetch("/api/fyd/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId, question: query, mode: "visitor" }),
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

  return (
    <div>
      <div className="flex flex-wrap gap-2" aria-label="Sample questions">
        {sampleQuestions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void ask(q)}
            disabled={busy}
            className="min-h-[44px] rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
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
        className="mt-4 flex flex-col gap-3 sm:flex-row"
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
          className="min-h-[44px] flex-1 rounded-lg border border-stone-300 bg-white px-4 py-3 text-base text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
        />
        <button
          type="submit"
          disabled={busy || question.trim().length === 0}
          className="min-h-[44px] rounded-lg bg-amber-600 px-6 py-3 text-base font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
        >
          {busy ? "Asking..." : "Ask"}
        </button>
      </form>

      <div aria-live="polite" className="mt-4">
        {busy && <p className="text-sm text-stone-500">Looking that up...</p>}
        {status === "error" && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        {status === "answered" && (
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            {paragraphs.map((p, i) => (
              <p key={i} className="mt-2 text-base leading-relaxed text-stone-800 first:mt-0">
                {p}
              </p>
            ))}
            {refusal && (
              <p className="mt-2 text-sm text-stone-500">
                FYD only answers from what it can verify about this business. If you own this
                business, you can add the missing detail and ask again.
              </p>
            )}
            {citations.length > 0 && (
              <details className="mt-3">
                <summary className="inline-block min-h-[24px] cursor-pointer py-1 text-sm text-stone-600 underline decoration-dotted underline-offset-2">
                  Why this?
                </summary>
                <ul className="mt-2 space-y-2">
                  {citations.map((c) => (
                    <li key={c.n} className="text-sm leading-relaxed text-stone-700">
                      <span className="font-semibold">
                        [{c.n}] {c.label}
                      </span>
                      <span className="block break-words text-xs text-stone-500">Source: {c.source}</span>
                      <span className="block text-xs text-stone-500">Basis: {c.basis}</span>
                      {c.lastChecked ? (
                        <span className="block text-xs text-stone-500">Last checked: {c.lastChecked}</span>
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
