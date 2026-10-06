"use client";

/**
 * Ask FYD visitor widget (client component).
 *
 * Renders the question input for the AskFYD section on a generated site and
 * posts to /api/fyd/ask. States: idle, loading, answered, error. Answers
 * render with a collapsed "Why this?" disclosure listing each citation's
 * source, basis, and last-checked date.
 *
 * PROD-9: the response answer-class polarity renders as a badge above
 * the answer: "Cannot answer" (DENIAL) or "Corrected premise"
 * (PREMISE_REJECTED). Normal answers (ANSWER) show no badge. The
 * "missing detail" hint shows only on DENIAL, never on a premise
 * rejection (the corrected premise is the answer, not a gap to fill).
 * Generic: no business-specific copy or logic. The section heading/copy stay
 * in the renderer; this component only owns the interactive Q&A.
 *
 * Mobile: 320px safe, no horizontal overflow; input and button are at least
 * 44px tall, the Why this? toggle at least 24px.
 */
import { useState } from "react";
import type { FYDThemeTokens } from "../sitespec/types";
import type { AskFydCitation } from "../ask/visitor-answer";

type AskStatus = "idle" | "loading" | "answered" | "error";

interface AskApiResponse {
  ok: boolean;
  answer?: string;
  refusal?: boolean;
  /** PROD-9: answer-class polarity for visual distinction. */
  responseClass?: "ANSWER" | "DENIAL" | "PREMISE_REJECTED";
  citations?: AskFydCitation[];
  error?: string;
}

export interface AskFydWidgetProps {
  /** Public site slug, threaded from the page (e.g. "happy-place"). */
  siteId?: string;
  theme: FYDThemeTokens;
  inputId?: string;
}

export function AskFydWidget({ siteId, theme, inputId = "ask-fyd-question" }: AskFydWidgetProps) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<AskStatus>("idle");
  const [answer, setAnswer] = useState("");
  const [refusal, setRefusal] = useState(false);
  const [responseClass, setResponseClass] = useState<"ANSWER" | "DENIAL" | "PREMISE_REJECTED">(
    "ANSWER",
  );
  const [citations, setCitations] = useState<AskFydCitation[]>([]);
  const [error, setError] = useState("");

  const configured = typeof siteId === "string" && siteId.length > 0;
  const busy = status === "loading";
  const canAsk = configured && !busy && question.trim().length > 0;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const q = question.trim();
    if (!configured || busy || q.length === 0) return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/fyd/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId, question: q, mode: "visitor" }),
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
      setResponseClass(
        data.responseClass === "DENIAL" || data.responseClass === "PREMISE_REJECTED"
          ? data.responseClass
          : "ANSWER",
      );
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
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row" aria-label="Ask FYD">
        <label htmlFor={inputId} className="sr-only">
          Ask a question about this business
        </label>
        <input
          id={inputId}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            configured ? "What do you want to know?" : "Ask FYD is not available on this page"
          }
          disabled={!configured || busy}
          maxLength={2000}
          className="min-h-[44px] flex-1 rounded border border-border-soft bg-background px-4 py-3 text-base text-ink"
        />
        <button
          type="submit"
          disabled={!canAsk}
          className="min-h-[44px] rounded px-6 py-3 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: theme.accent, color: theme.accentForeground }}
        >
          {busy ? "Asking..." : "Ask FYD"}
        </button>
      </form>

      {!configured && (
        <p className="mt-3 text-sm text-background/70">
          Ask FYD is not available on this page yet.
        </p>
      )}

      <div aria-live="polite" className="mt-4">
        {busy && <p className="text-sm text-background/70">Looking that up...</p>}
        {status === "error" && (
          <p role="alert" className="text-sm font-medium text-background">
            {error}
          </p>
        )}
        {status === "answered" && (
          <div>
            {responseClass === "DENIAL" && (
              <p
                className="mt-2 inline-block rounded-full border border-dashed px-3 py-1 text-xs font-semibold uppercase tracking-wide text-background/70"
                aria-label="Answer class: denial"
              >
                Cannot answer
              </p>
            )}
            {responseClass === "PREMISE_REJECTED" && (
              <p
                className="mt-2 inline-block rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                style={{ borderColor: theme.accent, color: theme.accent }}
                aria-label="Answer class: premise rejected"
              >
                Corrected premise
              </p>
            )}
            {paragraphs.map((p, i) => (
              <p key={i} className="mt-2 text-base leading-relaxed text-background">
                {p}
              </p>
            ))}
            {refusal && citations.length === 0 && responseClass === "DENIAL" && (
              <p className="mt-2 text-sm text-background/70">
                FYD only answers from what the site shows. If you own this business, you can add
                the missing detail and ask again.
              </p>
            )}
            {citations.length > 0 && (
              <details className="mt-3">
                <summary className="inline-block min-h-[24px] cursor-pointer py-1 text-sm text-background underline">
                  Why this?
                </summary>
                <ul className="mt-2 space-y-2">
                  {citations.map((c) => (
                    <li key={c.n} className="text-sm leading-relaxed text-background">
                      <span className="font-semibold">
                        [{c.n}] {c.label}
                      </span>
                      <span className="block break-words text-xs opacity-80">Source: {c.source}</span>
                      <span className="block text-xs opacity-80">Basis: {c.basis}</span>
                      {c.lastChecked ? (
                        <span className="block text-xs opacity-80">
                          Last checked: {c.lastChecked}
                        </span>
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
