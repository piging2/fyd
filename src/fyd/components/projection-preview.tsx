"use client";
import { useEffect, useRef, useState } from "react";
import type { EditorialRecord } from "./editorial-model";
export interface PublicPreview {
  name: string;
  href: string;
  capturedAt: string;
  records: EditorialRecord[];
  checkpoint: string;
}
/** A read-only view of an existing public projection. Fail closed on unavailable data. */
export function ProjectionPreview({ endpoint }: { endpoint: string }) {
  const [data, setData] = useState<PublicPreview[] | null>(null);
  const [error, setError] = useState(false);
  const [site, setSite] = useState(0);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!/^\/api\/[a-z0-9-]+$/.test(endpoint)) {
      setError(true);
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
              if (!Array.isArray(body.previews) || !body.previews.length)
                throw Error();
              setData(body.previews);
            })
            .catch((e) => {
              if (e.name !== "AbortError") setError(true);
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
  const selected = data?.[site];
  const record = selected?.records[active];
  return (
    <div className="ed-live-preview" ref={root}>
      <div className="ed-preview-bar">
        <strong>
          FYD<span aria-hidden="true">↗</span>
        </strong>
        <span className="ed-label">Business understanding</span>
        <span className="ed-preview-readonly">Public · Read only</span>
      </div>
      {!data ? (
        <div className="ed-preview-loading" role="status">
          {error
            ? "The public preview is unavailable. Open FYD below to explore the current product."
            : "Loading the business’s public records…"}
        </div>
      ) : (
        <>
          <div className="ed-preview-selector" aria-label="Choose a business">
            {data.map((p, i) => (
              <button
                key={p.name}
                aria-pressed={site === i}
                onClick={() => {
                  setSite(i);
                  setActive(0);
                }}
              >
                {p.name}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          <div className="ed-preview-body">
            <div className="ed-service-list">
              <p className="ed-label">What this business does</p>
              {selected?.records.map((r, i) => (
                <button
                  key={r.id}
                  aria-pressed={active === i}
                  onClick={() => setActive(i)}
                >
                  <span className="ed-service-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{r.title}</span>
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
            <div className="ed-service-detail" aria-live="polite">
              {record ? (
                <>
                  <p className="ed-label">
                    Service · From the business website
                  </p>
                  <h3>{record.title}</h3>
                  <p>
                    {record.description ||
                      "This service is named in the business’s public record. Further details are not recorded."}
                  </p>
                  <details key={record.id} className="ed-source">
                    <summary>Why does FYD know this?</summary>
                    <p>
                      From the business website, through FYD’s public
                      projection. This is a website statement, not independent
                      verification.
                    </p>
                    <code>{record.source}</code>
                    <p>
                      Read from the public projection:{" "}
                      {selected?.capturedAt.slice(0, 10)}
                    </p>
                  </details>
                  <a className="ed-text-link" href={selected?.href}>
                    Explore the business and Ask FYD
                    <span aria-hidden="true">↗</span>
                  </a>
                </>
              ) : (
                <p>No public service records are available.</p>
              )}
            </div>
          </div>
          <div className="ed-preview-foot">
            <span>
              Actual public FYD records. Select a service to explore it.
            </span>
            <span>No business information is changed.</span>
          </div>
        </>
      )}
    </div>
  );
}
