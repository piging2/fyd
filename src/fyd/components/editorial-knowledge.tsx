"use client";
import { useEffect, useState } from "react";
import type { EditorialRecord } from "./editorial-model";
import { PrimitiveArtwork } from "./primitive-artwork";

/* Knowledge explorer as a tiny story, EXPLANATION -> INTERACTIVE STATE.
 * Starts constrained (one object, nothing else) and expands only on
 * interaction: relationships, evidence, lineage, then what a new
 * observation would change. No hairball graph. The knowledge artwork
 * opens the explorer so the visual grammar carries straight into the
 * interactive state. Deliberately independent of EditorialAtlas: that
 * file carries another session's uncommitted work and is left untouched.
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

export function KnowledgeStory({
  records,
  relationships,
}: {
  records: EditorialRecord[];
  relationships: { from: string; to: string; label: string }[];
}) {
  const nodes = records.filter((r) => r.kind !== "article").slice(0, 5);
  const [selected, setSelected] = useState(
    nodes.find((r) => r.kind === "product")?.id ?? nodes[0]?.id,
  );
  const [story, setStory] = useState(0);
  const record = nodes.find((r) => r.id === selected) ?? nodes[0];
  const [rel, setRel] = useState(0);
  useEffect(() => setRel(0), [record?.id]);
  if (!record) return null;
  const related = relationships
    .filter((r) => r.to === record.id || r.from === record.id)
    .map((r) => ({
      label: r.label,
      outgoing: r.from === record.id,
      other: records.find((o) => o.id === (r.to === record.id ? r.from : r.to)),
    }))
    .filter((r) => r.other)
    .slice(0, 3);
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
              onClick={() => setSelected(r.id)}
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
