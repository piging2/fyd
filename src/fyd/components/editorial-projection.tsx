"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicPreview } from "./projection-preview";

/* FYD as projection, not a second truth: the chain SOURCE -> OBSERVATION
 * -> EVIDENCE -> OBJECT -> RELATIONSHIPS -> SITE SPEC -> FYD, read from the
 * same live public projection the evidence chain inspects. Owner
 * customization is authorized presentation, never rewritten truth.
 * Fail closed: every stage reads UNKNOWN when the projection is
 * unreachable, the same verdict PING returns for its own records.
 */

interface ChainLink {
  label: string;
  value: string;
  note: string;
  href?: string;
}

const UNKNOWN = (label: string): ChainLink => ({
  label,
  value: "Unknown",
  note: "The projection is unreachable, so this stage cannot be established.",
});

export function ProjectionChain({ endpoint }: { endpoint: string }) {
  const [preview, setPreview] = useState<PublicPreview | null>(null);
  const [failed, setFailed] = useState(false);
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
  const stages: ChainLink[] =
    failed || !preview || !record
      ? [
          UNKNOWN("Source"),
          UNKNOWN("Observation"),
          UNKNOWN("Evidence"),
          UNKNOWN("Object"),
          UNKNOWN("Relationships"),
          UNKNOWN("Site spec"),
          UNKNOWN("FYD"),
        ]
      : [
          {
            label: "Source",
            value: record.source,
            note: "Where the record was read from.",
          },
          {
            label: "Observation",
            value: (preview.capturedAt ?? "").slice(0, 10) || "date not recorded",
            note: "When this snapshot was taken.",
          },
          {
            label: "Evidence",
            value: "Verified public projection",
            note: `Boundary check passed · checkpoint ${preview.checkpoint.slice(0, 16)}…`,
          },
          {
            label: "Object",
            value: record.title,
            note: "The PING object. One source of truth.",
          },
          {
            label: "Relationships",
            value: "In the PING object graph",
            note: "Inspect them where they live, not in a copy.",
            href: "#understanding",
          },
          {
            label: "Site spec",
            value: "Renders records, never rewrites them",
            note: "Owner edits change presentation, never the record.",
          },
          {
            label: "FYD",
            value: preview.name,
            note: "The live projected page.",
            href: preview.href,
          },
        ];

  return (
    <div className="pg-projection-chain" ref={root}>
      <p className="ed-label">FYD is a projection, not a second truth</p>
      <ol aria-label="Projection chain: source to FYD page">
        {stages.map((s, i) => (
          <li key={s.label}>
            <span className="pg-chain-stage">{s.label}</span>
            {s.href ? (
              <a className="pg-chain-value" href={s.href}>
                {s.value}
                <span aria-hidden="true"> ↗</span>
              </a>
            ) : (
              <span className="pg-chain-value">{s.value}</span>
            )}
            <span className="pg-chain-note">{s.note}</span>
            {i < stages.length - 1 && (
              <span className="pg-chain-arrow" aria-hidden="true">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
