"use client";

/**
 * AskPingPanel: Ask PING UI backed by the server-side bounded context
 * builder and the deterministic evidence-backed answer composer.
 *
 * Renders: the answer (every factual sentence cites evidence as [n]),
 * clickable evidence refs, related objects, suggested actions, and, when
 * the composer drafts one, a PROPOSAL card showing the EXACT digest.
 * Approving submits through the governed path as the viewer identity.
 * Agents propose; they cannot publish.
 */

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AskAnswer, AskEvidenceRef, AskProposal } from "@/lib/ping/types";
import { ActionButtons } from "./action-buttons";
import { schemaLabel } from "./object-preview";

interface AskPingPanelProps {
  targetObjectId?: string | null;
  initialPrefill?: string | null;
  onChanged?: () => void;
  className?: string;
}

function EvidenceList({ refs }: { refs: AskEvidenceRef[] }) {
  if (refs.length === 0) return null;
  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-accent/50">Evidence</h4>
      <ol className="mt-2 space-y-1.5">
        {refs.map((ref, i) => (
          <li key={`${ref.kind}:${ref.id}:${i}`} className="text-sm">
            <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-accent/70">
              {i + 1}
            </span>
            {ref.kind === "object" ? (
              <Link
                href={`/node/${encodeURIComponent(ref.id)}`}
                className="text-ping-violet hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
              >
                {ref.label}
              </Link>
            ) : (
              <span className="text-accent/80">{ref.label}</span>
            )}
            {ref.detail && <span className="block pl-7 text-xs text-accent/50">{ref.detail}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ProposalCard({
  proposal,
  onApproved,
}: {
  proposal: AskProposal;
  onApproved: () => void;
}) {
  const [state, setState] = React.useState<"idle" | "approving" | "approved" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [eventId, setEventId] = React.useState<string | null>(null);

  const approve = async () => {
    setState("approving");
    setError(null);
    try {
      const res = await fetch("/api/ping/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (json as { error?: { message?: string } } | null)?.error?.message ?? "Approval failed.";
        throw new Error(msg);
      }
      setEventId((json as { eventId?: string }).eventId ?? null);
      setState("approved");
      onApproved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
      setState("error");
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-ping-violet/40 bg-ping-violet/5 p-4" aria-label="Draft proposal">
      <h4 className="text-sm font-semibold text-accent">
        Draft proposal: {proposal.kind === "object_update" ? "update object" : "create object"}
      </h4>
      <p className="mt-1 text-sm text-accent/70">{proposal.note}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-medium text-accent/60">Schema:</dt>
          <dd className="text-accent/90">{schemaLabel(proposal.schema)}</dd>
        </div>
        {proposal.targetObjectId && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-accent/60">Target:</dt>
            <dd>
              <Link
                href={`/node/${encodeURIComponent(proposal.targetObjectId)}`}
                className="text-ping-violet hover:underline"
              >
                <code className="rounded bg-surface-2 px-1">{proposal.targetObjectId.slice(0, 16)}</code>
              </Link>
            </dd>
          </div>
        )}
        {Object.entries(proposal.changes).map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-accent/60">{k}:</dt>
            <dd className="min-w-0 flex-1 break-words text-accent/90">{v}</dd>
          </div>
        ))}
      </dl>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-accent/60 hover:text-accent">
          Exact digest ({proposal.digestAlgorithm})
        </summary>
        <code className="mt-1 block break-all rounded bg-surface-2 p-2 font-mono text-xs text-accent/80">
          {proposal.digest}
        </code>
      </details>
      {state === "approved" ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-forest" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Approved and submitted{eventId ? ` (event ${eventId.slice(0, 12)})` : ""}. The gateway governs the write.
        </p>
      ) : (
        <button
          type="button"
          onClick={approve}
          disabled={state === "approving"}
          className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet disabled:opacity-50"
        >
          {state === "approving" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Approve exact proposal
        </button>
      )}
      {state === "error" && error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-accent/50">
        Approving submits this exact proposal as your identity. Nothing is published without your approval.
      </p>
    </div>
  );
}

export function AskPingPanel({ targetObjectId = null, initialPrefill = null, onChanged, className }: AskPingPanelProps) {
  const [question, setQuestion] = React.useState(initialPrefill ?? "");
  const [answer, setAnswer] = React.useState<AskAnswer | null>(null);
  const [status, setStatus] = React.useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (initialPrefill) setQuestion(initialPrefill);
  }, [initialPrefill]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = question.trim();
    if (!q || status === "loading") return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/ping/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, targetObjectId }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (json as { error?: { message?: string } } | null)?.error?.message ?? "Ask PING failed.";
        throw new Error(msg);
      }
      setAnswer(json as AskAnswer);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ask PING failed.");
      setStatus("error");
    }
  };

  return (
    <section aria-label="Ask PING" className={cn("rounded-xl border border-border/40 bg-surface p-4", className)}>
      <h3 className="text-base font-semibold text-accent">Ask PING</h3>
      <p className="mt-0.5 text-xs text-accent/60">
        Answers come from PING evidence only. Every factual sentence cites its source.
      </p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label htmlFor="ask-ping-input" className="sr-only">
          Your question
        </label>
        <input
          ref={inputRef}
          id="ask-ping-input"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={targetObjectId ? "Ask about this object..." : "Ask about PING objects..."}
          maxLength={2000}
          className="min-h-[44px] flex-1 rounded-lg border border-border-soft bg-background px-3 text-sm text-accent placeholder:text-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
        />
        <button
          type="submit"
          disabled={status === "loading" || !question.trim()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet disabled:opacity-50"
        >
          {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          Ask
        </button>
      </form>

      {status === "error" && error && (
        <p className="mt-3 flex items-start gap-2 text-sm text-red-700" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {answer && (
        <div className="mt-4">
          <div className="space-y-3">
            {answer.answer.split("\n\n").map((para, i) => (
              <p key={i} className="text-sm leading-relaxed text-accent/90">
                {para}
              </p>
            ))}
          </div>
          {answer.partial && (
            <p className="mt-2 text-xs italic text-accent/50">
              Partial answer: some of the question had no supporting evidence.
            </p>
          )}
          <EvidenceList refs={answer.evidenceRefs} />
          {answer.relatedObjects.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-accent/50">Related objects</h4>
              <ul className="mt-2 space-y-1">
                {answer.relatedObjects.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/node/${encodeURIComponent(o.id)}`}
                      className="text-sm text-ping-violet hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
                    >
                      {o.title}
                    </Link>
                    <span className="ml-2 text-xs text-accent/50">{schemaLabel(o.schema)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {answer.suggestedActions.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-accent/50">Suggested actions</h4>
              <ActionButtons
                actions={answer.suggestedActions}
                onAsk={(prefill, objectId) => {
                  if (prefill) setQuestion(prefill);
                  inputRef.current?.focus();
                  void objectId;
                }}
                onChanged={onChanged}
                className="mt-2"
              />
            </div>
          )}
          {answer.proposal && <ProposalCard proposal={answer.proposal} onApproved={() => onChanged?.()} />}
        </div>
      )}
    </section>
  );
}
