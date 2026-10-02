"use client";
import { useEffect, useState } from "react";
import type { EditorialRecord } from "./editorial-model";
import { PrimitiveArtwork } from "./primitive-artwork";

/* Knowledge explorer as a tiny story, EXPLANATION -> INTERACTIVE STATE,
 * followed by the Ask PING payoff: evidence-bounded interrogation of the
 * same object. Starts constrained (one object, nothing else) and expands
 * only on interaction: relationships, evidence, lineage, then what a new
 * observation would change, then the questions the object can actually
 * answer. No hairball graph. Deliberately independent of
 * EditorialAtlas: that file carries another session's uncommitted work
 * and is left untouched.
 */

const storySteps = [
  { label: "Object", hint: "Start with one object. Pick any record below." },
  {
    label: "Relationships",
    hint: "See what it connects to — and what each connection means.",
  },
  {
    label: "Evidence",
    hint: "See what backs it up: the published source behind the record.",
  },
  {
    label: "Lineage",
    hint: "See where it came from: source, capture, record.",
  },
  {
    label: "New observation",
    hint: "See how a new sighting would change what PING understands.",
  },
];

const statusLabel = (status?: string) =>
  status === "available"
    ? "Available"
    : status === "future"
      ? "Direction"
      : status === "in-development"
        ? "In development"
        : "Published";

interface Rel {
  from: string;
  to: string;
  label: string;
}

interface Related {
  label: string;
  outgoing: boolean;
  other?: EditorialRecord;
}

function relatedFor(
  record: EditorialRecord,
  records: EditorialRecord[],
  relationships: Rel[],
): Related[] {
  return relationships
    .filter((r) => r.to === record.id || r.from === record.id)
    .map((r) => ({
      label: r.label,
      outgoing: r.from === record.id,
      other: records.find((o) => o.id === (r.to === record.id ? r.from : r.to)),
    }))
    .filter((r) => r.other)
    .slice(0, 3);
}

export function KnowledgeStory({
  records,
  relationships,
  selectedId,
  onSelect,
}: {
  records: EditorialRecord[];
  relationships: Rel[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const nodes = records.filter((r) => r.kind !== "article").slice(0, 5);
  const [story, setStory] = useState(0);
  const record = nodes.find((r) => r.id === selectedId) ?? nodes[0];
  const [rel, setRel] = useState(0);
  useEffect(() => setRel(0), [record?.id]);
  if (!record) return null;
  const related = relatedFor(record, records, relationships);
  const activeRel = related[Math.min(rel, Math.max(0, related.length - 1))];
  return (
    <div className="pg-knowledge-story">
      <div className="pg-knowledge-head">
        <span className="pg-knowledge-art" aria-hidden="true">
          <PrimitiveArtwork concept="knowledge" phase={2} eager />
        </span>
        <div>
          <p className="ed-label">From connected idea to inspectable record</p>
          <p className="pg-knowledge-lede">
            The artwork above is the idea. Below is the machinery, one step at
            a time.
          </p>
        </div>
      </div>
      <ol className="pg-story-rail" aria-label="A tiny story of understanding">
        {storySteps.map((s, i) => (
          <li key={s.label} data-active={story === i}>
            <button
              type="button"
              aria-pressed={story === i}
              onClick={() => setStory(i)}
            >
              <span className="pg-story-num" aria-hidden="true">
                0{i + 1}
              </span>
              <span>{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="pg-story-hint" aria-live="polite">
        {storySteps[story].hint}
      </p>
      <div className="pg-knowledge-body">
        <div
          className="pg-knowledge-nodes"
          role="group"
          aria-label="Choose a record"
        >
          {nodes.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={r.id === record.id}
              onClick={() => onSelect(r.id)}
            >
              <small>{r.kind}</small>
              <strong>{r.title}</strong>
            </button>
          ))}
        </div>
        <div className="pg-knowledge-record" aria-live="polite" aria-atomic="true">
          <div className="ed-record-meta">
            <span className="ed-label">{record.kind}</span>
            <span className="ed-status">{statusLabel(record.status)}</span>
          </div>
          <h3>{record.title}</h3>
          <p>{record.description}</p>
          {story >= 1 && (
            <div className="pg-reveal">
              <p className="ed-label">Relationships</p>
              {related.length ? (
                <>
                  <ul className="pg-knowledge-relations">
                    {related.map((r, i) => (
                      <li key={i} data-active={r === activeRel}>
                        <button
                          type="button"
                          aria-pressed={r === activeRel}
                          onClick={() => setRel(i)}
                        >
                          <span>{r.label.replace(/_/g, " ")}</span>
                          <strong>{r.other?.title}</strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {activeRel && (
                    <div
                      className="pg-knowledge-why"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      <p className="ed-label">
                        Why does PING believe this relationship exists?
                      </p>
                      <dl>
                        <div>
                          <dt>Type</dt>
                          <dd>{activeRel.label.replace(/_/g, " ")}</dd>
                        </div>
                        <div>
                          <dt>Direction</dt>
                          <dd>
                            {activeRel.outgoing
                              ? `${record.title} → ${activeRel.other?.title}`
                              : `${activeRel.other?.title} → ${record.title}`}
                          </dd>
                        </div>
                        <div>
                          <dt>Evidence</dt>
                          <dd>
                            Recorded in the published object graph. Finer
                            provenance for this relationship is not
                            published — unknown, not assumed.
                          </dd>
                        </div>
                        <div>
                          <dt>Related status</dt>
                          <dd>{statusLabel(activeRel.other?.status)}</dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </>
              ) : (
                <p className="pg-knowledge-empty">
                  No recorded relationships for this object yet.
                </p>
              )}
            </div>
          )}
          {story >= 2 && (
            <details className="ed-source pg-reveal">
              <summary>Why does PING hold this record?</summary>
              <p>
                This is a published website statement. It is not independent
                verification or a live runtime reading.
              </p>
              <code>{record.source}</code>
              {record.href && (
                <a href={record.href}>Read the published source ↗</a>
              )}
            </details>
          )}
          {story >= 3 && (
            <p className="pg-lineage pg-reveal">
              <span className="ed-label">Lineage</span> Observed from{" "}
              <code>{record.source}</code>
              {record.date ? (
                <> · published {record.date.slice(0, 10)}</>
              ) : (
                <> · publish date not recorded</>
              )}
            </p>
          )}
          {story >= 4 && (
            <div className="pg-new-observation pg-reveal">
              <p className="ed-label">
                Illustrated — what a new observation would do
              </p>
              <p>
                A new sighting of {record.title} would join its support set:
                the evidence behind this record grows by one, its
                relationships are re-checked, and anything that quoted it
                carries the update forward. Understanding is never finished;
                it is re-derived.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Ask PING: evidence-bounded interrogation of the same object the inspector
 * is showing. Every answer is computed deterministically from the reached
 * record and relationships. Supported claims carry their evidence; partial
 * claims say what is thin; unsupported questions are refused honestly;
 * conflicting claims would be exposed, and the check runs every time.
 */

type Verdict = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "CONFLICT";
interface Claim {
  text: string;
  verdict: Verdict;
  evidence: string;
}

const askQuestions = [
  { id: "how", label: "How do you know?" },
  { id: "what", label: "What is it?" },
  { id: "unknown", label: "What is unknown?" },
] as const;
type AskId = (typeof askQuestions)[number]["id"];

function buildClaims(
  id: AskId,
  record: EditorialRecord,
  records: EditorialRecord[],
  relationships: Rel[],
): { claims: Claim[]; conflictNote: string | null } {
  const related = relatedFor(record, records, relationships);
  if (id === "what") {
    const claims: Claim[] = record.description
      ? [
          {
            text: record.description,
            verdict: "SUPPORTED",
            evidence: `Published record description · status: ${statusLabel(record.status)}`,
          },
        ]
      : [
          {
            text: `No published description for ${record.title}.`,
            verdict: "UNSUPPORTED",
            evidence: "The record carries no description. Nothing is inferred.",
          },
        ];
    return { claims, conflictNote: null };
  }
  if (id === "unknown") {
    const claims: Claim[] = related.map((r) => ({
      text: `Finer provenance for “${r.other?.title} ${r.label.replace(/_/g, " ")} ${record.title}”.`,
      verdict: "UNSUPPORTED",
      evidence: "Not published. Unknown, not assumed.",
    }));
    if (!record.date)
      claims.push({
        text: "Publish date of this record.",
        verdict: "UNSUPPORTED",
        evidence: "Not recorded in the published graph.",
      });
    claims.push({
      text: `Anything about ${record.title} beyond the published record.`,
      verdict: "UNSUPPORTED",
      evidence: "PING answers only from published evidence.",
    });
    return { claims, conflictNote: null };
  }
  // "how": grade every claim the object makes about itself.
  const claims: Claim[] = [
    {
      text: `PING holds a published record for ${record.title}.`,
      verdict: "SUPPORTED",
      evidence: `Published object record · status: ${statusLabel(record.status)}`,
    },
    ...related.map((r) => ({
      text: r.outgoing
        ? `${record.title} ${r.label.replace(/_/g, " ")} ${r.other?.title}.`
        : `${r.other?.title} ${r.label.replace(/_/g, " ")} ${record.title}.`,
      verdict: "PARTIAL" as Verdict,
      evidence:
        "Recorded in the published object graph. Finer provenance is not published, so the claim is held as partial, not certain.",
    })),
  ];
  // Conflict check: two different relationship labels between the same pair.
  const seen = new Map<string, string>();
  const conflicts: string[] = [];
  for (const r of related) {
    const pair = [record.id, r.other?.id ?? ""].sort().join("|");
    const label = r.label;
    const prev = seen.get(pair);
    if (prev && prev !== label)
      conflicts.push(
        `“${prev.replace(/_/g, " ")}” and “${label.replace(/_/g, " ")}” between the same two records.`,
      );
    else seen.set(pair, label);
  }
  const conflictNote =
    conflicts.length > 0
      ? null
      : "No conflicting published claims found for this object. The check ran over its recorded relationships.";
  const conflictClaims: Claim[] = conflicts.map((c) => ({
    text: `Conflicting claims: ${c}`,
    verdict: "CONFLICT",
    evidence: "Two published claims disagree. This needs a human look.",
  }));
  return { claims: [...claims, ...conflictClaims], conflictNote };
}

export function AskPing({
  record,
  records,
  relationships,
}: {
  record: EditorialRecord;
  records: EditorialRecord[];
  relationships: Rel[];
}) {
  const [q, setQ] = useState<AskId>("how");
  const { claims, conflictNote } = buildClaims(q, record, records, relationships);
  return (
    <div className="pg-ask">
      <p className="ed-label">Ask PING</p>
      <p className="pg-ask-lede">
        Interrogate {record.title}. Every answer is bounded by the published
        record and its relationships. What is not evidenced is said so.
      </p>
      <div
        className="pg-ask-questions"
        role="group"
        aria-label={`Questions about ${record.title}`}
      >
        {askQuestions.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={q === s.id}
            onClick={() => setQ(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="pg-ask-legend">
        SUPPORTED: published evidence · PARTIAL: recorded, thin provenance ·
        UNSUPPORTED: no evidence · CONFLICT: claims disagree
      </p>
      <ul
        className="pg-ask-claims"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`Answer about ${record.title}`}
      >
        {claims.map((c, i) => (
          <li key={i}>
            <span
              className={`pg-verdict pg-verdict-${c.verdict.toLowerCase()}`}
              aria-label={`Verdict: ${c.verdict}`}
            >
              {c.verdict}
            </span>
            <div>
              <p className="pg-ask-claim">{c.text}</p>
              <p className="pg-ask-evidence">{c.evidence}</p>
            </div>
          </li>
        ))}
      </ul>
      {conflictNote && <p className="pg-ask-none">{conflictNote}</p>}
    </div>
  );
}

export function KnowledgeSection({
  records,
  relationships,
}: {
  records: EditorialRecord[];
  relationships: Rel[];
}) {
  const nodes = records.filter((r) => r.kind !== "article").slice(0, 5);
  const [selectedId, setSelectedId] = useState(
    nodes.find((r) => r.kind === "product")?.id ?? nodes[0]?.id ?? "",
  );
  const record = nodes.find((r) => r.id === selectedId) ?? nodes[0];
  if (!record) return null;
  return (
    <>
      <KnowledgeStory
        records={records}
        relationships={relationships}
        selectedId={record.id}
        onSelect={setSelectedId}
      />
      <AskPing record={record} records={records} relationships={relationships} />
    </>
  );
}
