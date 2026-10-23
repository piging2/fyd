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
import { useEffect, useRef, useState } from "react";
import type { FYDThemeTokens } from "../sitespec/types";
import { resolveThemeRoles } from "../sitespec/theme-roles";
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
  kind?: string;
  answerCheckpoint?: string;
}

export interface AskFydWidgetProps {
  /** Public site slug, threaded from the page (e.g. "happy-place"). */
  siteId?: string;
  pageCheckpoint?: string;
  theme: FYDThemeTokens;
  inputId?: string;
  prompts?: string[];
  initialQuestion?: string;
  questionSequence?: number;
}

export function AskFydWidget({ siteId, pageCheckpoint, theme, inputId = "ask-fyd-question", prompts = ["What services do they offer?", "How do I contact them?", "Where are they located?"], initialQuestion, questionSequence }: AskFydWidgetProps) {
  // Item 4: text positions bind token roles, never raw accent/ink.
  const roles = resolveThemeRoles(theme);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<AskStatus>("idle");
  const [answer, setAnswer] = useState("");
  const [refusal, setRefusal] = useState(false);
  const [responseClass, setResponseClass] = useState<"ANSWER" | "DENIAL" | "PREMISE_REJECTED">(
    "ANSWER",
  );
  const [citations, setCitations] = useState<AskFydCitation[]>([]);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const generation = useRef(0);
  const scope = `${siteId ?? ''}:${pageCheckpoint ?? ''}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const previousScope = useRef(scope);
  const staleCopy = "Business information changed. Refresh this view.";
  const questionKey = `fyd-refresh-question:${siteId ?? ''}`;

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(questionKey);
      if (saved !== null) { setQuestion(saved); sessionStorage.removeItem(questionKey); }
    } catch { /* Unavailable browser storage never changes the answer boundary. */ }
  }, [questionKey]);
  useEffect(() => {
    if (previousScope.current === scope) return;
    previousScope.current = scope;
    generation.current++;
    setAnswer(""); setCitations([]); setStatus("idle"); setError(""); setStale(false);
  }, [scope]);
  useEffect(() => () => { generation.current++; }, []);

  const configured = typeof siteId === "string" && siteId.length > 0;
  const busy = status === "loading";
  const canAsk = configured && !busy && !stale && question.trim().length > 0;

  useEffect(() => {
    if (initialQuestion) {
      generation.current++;
      setQuestion(initialQuestion); setStatus("idle"); setAnswer(""); setCitations([]);
    }
  }, [initialQuestion, questionSequence]);

  async function ask(value: string): Promise<void> {
    const q = value.trim();
    if (!configured || stale || q.length === 0) return;
    const requestGeneration = ++generation.current;
    const requestScope = scope;
    const isCurrent = () => generation.current === requestGeneration && currentScope.current === requestScope;
    setStatus("loading");
    setError("");
    setAnswer(""); setCitations([]);
    try {
      const res = await fetch(`/api/fyd/ask/${encodeURIComponent(siteId!)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId, question: q, mode: "visitor", pageCheckpoint }),
      });
      let data: AskApiResponse | null = null;
      try {
        data = (await res.json()) as AskApiResponse;
      } catch {
        data = null;
      }
      if (!isCurrent()) return;
      if (data?.kind === "stale_view" || (data?.ok && pageCheckpoint && data.answerCheckpoint !== pageCheckpoint)) {
        setStale(true); setStatus("error"); setError(staleCopy); return;
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
      if (!isCurrent()) return;
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
      <form onSubmit={(e) => { e.preventDefault(); void ask(question); }} className="mt-6 flex flex-col gap-3 sm:flex-row" aria-label="Ask FYD">
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
          disabled={!configured}
          maxLength={2000}
          className="min-h-[44px] flex-1 rounded border border-border-soft bg-background px-4 py-3 text-base text-ink"
        />
        <button
          type="submit"
          disabled={!canAsk}
          className="min-h-[44px] rounded px-6 py-3 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: theme.accent, color: roles.onAccent }}
        >
          {busy ? "Asking..." : "Ask FYD"}
        </button>
      </form>

      {!configured && (
        <p className="mt-3 text-sm text-background/70">
          Ask FYD is not available on this page yet.
        </p>
      )}
      {configured && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Suggested questions">
          {prompts.map(prompt => <button key={prompt} type="button" disabled={stale}
            className="min-h-[44px] rounded-full border border-current/30 px-4 py-2 text-sm text-background hover:bg-white/10 disabled:opacity-50"
            onClick={() => { setQuestion(prompt); void ask(prompt); }}>{prompt}</button>)}
        </div>
      )}

      <div aria-live="polite" className="mt-4">
        {busy && <p className="text-sm text-background/70">Looking that up...</p>}
        {status === "error" && (
          <p role="alert" className="text-sm font-medium text-background">
            {error}
          </p>
        )}
        {stale && <button type="button" className="min-h-[44px] underline" onClick={() => {
          try { sessionStorage.setItem(questionKey, question); } catch { return; }
          window.location.reload();
        }}>Refresh this view</button>}
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
                style={{ borderColor: roles.accentDecorative, color: roles.accentText, background: roles.surface }}
                aria-label="Answer class: premise rejected"
              >
                Corrected premise
              </p>
            )}
            {paragraphs.map((p, i) => (
              <p key={i} className="mt-2 text-base leading-relaxed text-background">
                {p.replace(/\s*\[\d+\]/g, "")}
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
                <summary className="inline-flex min-h-[44px] cursor-pointer items-center py-1 text-sm text-background underline">
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
                      {c.provenance?.origin === "owner" && <>
                        <span className="block text-xs">FYD uses your correction: {c.provenance.effectiveValue}</span>
                        <span className="block text-xs">Original observation: {c.provenance.originalObservation ?? "No value recorded"}</span>
                        {c.provenance.sourceDrifted && <span className="block text-xs">The source changed to {c.provenance.currentObservation ?? "no recorded value"}. Your correction still applies.</span>}
                      </>}
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
