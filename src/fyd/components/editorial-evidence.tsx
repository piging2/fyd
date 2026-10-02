"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicPreview } from "./projection-preview";

/* Evidence as REAL product state: the chain is built from the same public
 * projection the live preview below reads — CLAIM -> SUPPORT SET -> SOURCE
 * -> OBSERVED AT -> VERDICT. No demo-specific evidence model. When the
 * projection is unreachable, the chain says UNKNOWN instead of guessing.
 * Reuses the FYD evidence binding (record.title / record.source /
 * capturedAt, "a website statement, not independent verification").
 */

const verdictLegend = [
  {
    label: "Supported",
    meaning: "Independent observations agree. PING answers directly and cites them.",
  },
  {
    label: "Partial",
    meaning:
      "Some support, but thin, stale, or one-sided. PING answers with the caveat attached.",
  },
  {
    label: "Conflicting",
    meaning:
      "Observations disagree. PING shows the disagreement instead of quietly picking a winner.",
  },
  {
    label: "Unknown",
    meaning:
      "No usable evidence. PING says it does not know, and says what would resolve it.",
  },
];

type ChainStage = {
  label: string;
  title: string;
  body: string;
};

export function EvidenceChain({ endpoint }: { endpoint: string }) {
  const [preview, setPreview] = useState<PublicPreview | null>(null);
  const [failed, setFailed] = useState(false);
  const [stage, setStage] = useState(0);
  const [legend, setLegend] = useState(1);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!/^\/api\/[a-z0-9-]+$/.test(endpoint)) {
      setFailed(true);
      return;
    }
    const abort = new AbortController();
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          fetch(endpoint, { signal: abort.signal })
            .then(async (r) => {
              if (!r.ok) throw Error();
              return r.json();
            })
            .then((body) => {
              const first = body.previews?.[0];
              if (!first || !first.records?.length) throw Error();
              setPreview(first);
            })
            .catch((e) => {
              if (e.name !== "AbortError") setFailed(true);
            });
        }
      },
      { rootMargin: "300px" },
    );
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      abort.abort();
    };
  }, [endpoint]);

  const record = preview?.records[0];
  const stages: ChainStage[] = failed || !record
    ? [
        {
          label: "Claim",
          title: "No claim to show.",
          body: "The public projection is unreachable right now, so there is no claim to inspect. PING reports UNKNOWN instead of inventing one.",
        },
        {
          label: "Support set",
          title: "Unknown.",
          body: "Without the projection, the support set cannot be established.",
        },
        {
          label: "Source",
          title: "Unknown.",
          body: "Without the projection, the source cannot be established.",
        },
        {
          label: "Observed at",
          title: "Unknown.",
          body: "Without the projection, the observation time cannot be established.",
        },
        {
          label: "Verdict",
          title: "UNKNOWN.",
          body: "No usable evidence either way. The honest verdict is UNKNOWN — the same verdict PING returns when it cannot reach its own records.",
        },
      ]
    : [
        {
          label: "Claim",
          title: "What PING holds, in one sentence.",
          body: `\u201c${record.title}.\u201d Held about ${preview!.name}. A claim is a sentence the system will stand behind — with its verdict attached.`,
        },
        {
          label: "Support set",
          title: "One published statement.",
          body: "The public projection carries one sighting of this service: the business's own published record. Thin, but real — and labeled as such.",
        },
        {
          label: "Source",
          title: "The ground the observation stands on.",
          body: `${record.source}. Follow it and you leave PING for the business's own site. A claim never floats free of its source.`,
        },
        {
          label: "Observed at",
          title: "When the projection last read it.",
          body: `${(preview!.capturedAt ?? "").slice(0, 10) || "date not recorded"}. Stale reads are labeled stale, never silently refreshed.`,
        },
        {
          label: "Verdict",
          title: "PARTIAL.",
          body: "A website statement, not independent verification. PING answers from it — with the caveat attached to the answer.",
        },
      ];

  const active = stages[Math.min(stage, stages.length - 1)];
  return (
    <div className="pg-evidence-chain" ref={root}>
      <div className="pg-evidence-head">
        <p className="ed-label">Why PING believes anything</p>
        <h3>Every claim carries its chain.</h3>
        <p className="pg-evidence-sub">
          This chain is live: it reads the same public projection as the
          business preview below. Follow a claim down to its source and its
          verdict — including when the answer is UNKNOWN.
        </p>
      </div>
      {!preview && !failed ? (
        <p className="pg-evidence-loading" role="status">
          Reading the public projection…
        </p>
      ) : (
        <>
          <ol className="pg-evidence-stages" aria-label="The evidence chain">
            {stages.map((s, i) => (
              <li key={s.label} data-active={stage === i}>
                <button
                  type="button"
                  aria-pressed={stage === i}
                  onClick={() => setStage(i)}
                >
                  <span className="pg-evidence-num" aria-hidden="true">
                    0{i + 1}
                  </span>
                  <span className="pg-evidence-stage-label">{s.label}</span>
                  {i < stages.length - 1 && (
                    <span className="pg-evidence-arrow" aria-hidden="true">
                      →
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
          <div
            className="pg-evidence-detail"
            aria-live="polite"
            aria-atomic="true"
          >
            <p className="ed-label">
              0{stage + 1} / {active.label} · Why this?
            </p>
            <p className="pg-evidence-detail-title">{active.title}</p>
            <p>{active.body}</p>
          </div>
        </>
      )}
      <div className="pg-evidence-verdict">
        <p className="ed-label">The four verdicts PING can return</p>
        <div
          className="pg-evidence-verdicts"
          role="group"
          aria-label="Verdict states"
        >
          {verdictLegend.map((v, i) => (
            <button
              key={v.label}
              type="button"
              aria-pressed={legend === i}
              onClick={() => setLegend(i)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="pg-evidence-verdict-line" aria-live="polite">
          <strong>{verdictLegend[legend].label}.</strong>{" "}
          {verdictLegend[legend].meaning}
        </p>
      </div>
      <p className="pg-evidence-bridge">
        {record
          ? `Showing the live chain for \u201c${record.title}\u201d — every service in the preview below carries its own. Open \u201cWhy does FYD know this?\u201d on any of them.`
          : "When the projection loads, its records carry this same chain — open \u201cWhy does FYD know this?\u201d on any service below."}
      </p>
    </div>
  );
}
