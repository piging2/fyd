"use client";
import { useState } from "react";

/* The evidence grammar as an explorable chain: CLAIM -> SUPPORT SET ->
 * OBSERVATION -> SOURCE, then the verdict, stated honestly. Illustrated
 * example; the live records below this section carry the same chain on
 * real data ("Why does FYD know this?" on any service).
 */

const stages = [
  {
    label: "Claim",
    title: "What PING believes, in one sentence.",
    body: "\u201cThe business offers weekend appointments.\u201d Belief and uncertainty travel together: every claim PING holds carries its verdict with it.",
  },
  {
    label: "Support set",
    title: "The observations that bear on the claim.",
    body: "3 observations from 2 sources. The set is the evidence — nothing hidden, nothing summarized away. Change the set and the verdict can change.",
  },
  {
    label: "Observation",
    title: "A single recorded sighting.",
    body: "\u201cSaturday hours listed on the services page.\u201d What was seen, where it was seen, and when — recorded before any interpretation.",
  },
  {
    label: "Source",
    title: "The ground the observation stands on.",
    body: "The business website, captured 2026-09-28. A claim never floats free of its source: follow any claim down far enough and you land here.",
  },
];

const verdicts = [
  {
    label: "Supported",
    meaning: "Independent observations agree.",
    doing: "PING answers directly, and cites the observations that agree.",
  },
  {
    label: "Partial",
    meaning: "Some support, but thin, stale, or one-sided.",
    doing: "PING answers with the caveat attached — the thinness is part of the answer.",
  },
  {
    label: "Conflicting",
    meaning: "Observations disagree with each other.",
    doing: "PING shows the disagreement instead of quietly picking a winner.",
  },
  {
    label: "Unknown",
    meaning: "No usable evidence either way.",
    doing: "PING says it does not know, and says what would resolve it.",
  },
];

export function EvidenceChain() {
  const [stage, setStage] = useState(0);
  const [verdict, setVerdict] = useState(1);
  const active = verdicts[verdict];
  return (
    <div className="pg-evidence-chain">
      <div className="pg-evidence-head">
        <p className="ed-label">Why PING believes anything</p>
        <h3>Every claim carries its chain.</h3>
        <p className="pg-evidence-sub">
          Follow a claim down: the support set, the observations, the source.
          Then the verdict, stated plainly — including when PING does not know.
          An illustrated example; the live records below carry the same chain.
        </p>
      </div>
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
      <div className="pg-evidence-detail" aria-live="polite" aria-atomic="true">
        <p className="ed-label">
          0{stage + 1} / {stages[stage].label}
        </p>
        <p className="pg-evidence-detail-title">{stages[stage].title}</p>
        <p>{stages[stage].body}</p>
      </div>
      <div className="pg-evidence-verdict">
        <p className="ed-label">The verdict on this claim</p>
        <div
          className="pg-evidence-verdicts"
          role="group"
          aria-label="Verdict states"
        >
          {verdicts.map((v, i) => (
            <button
              key={v.label}
              type="button"
              aria-pressed={verdict === i}
              onClick={() => setVerdict(i)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="pg-evidence-verdict-line" aria-live="polite">
          <strong>{active.label}.</strong> {active.meaning} {active.doing}
        </p>
      </div>
      <p className="pg-evidence-bridge">
        This is the chain behind every service in the live preview below — open
        <em> “Why does FYD know this?” </em> on any service to follow it on real
        records.
      </p>
    </div>
  );
}
