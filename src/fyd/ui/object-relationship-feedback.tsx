"use client";
import type { useObjectRelationship } from "./use-object-relationship";

type Relationship = ReturnType<typeof useObjectRelationship>;
export function ObjectRelationshipFeedback({ follow, like }: { follow?: Relationship; like?: Relationship }) {
  const available = [{ label: "Follow", value: follow }, { label: "Like", value: like }].filter((item) => item.value);
  if (!available.length) return null;
  return <div className="px-3 py-2 text-[11px] leading-relaxed" data-fyd-relationship-feedback>
    <p className="opacity-75">Private demo preferences · this browser</p>
    {available.map(({ label, value }) => value && value.status !== "ready" && <div key={label}>
      <p role="status">{label}: {value.message}</p>
      {value.status === "retryable-error" && <button type="button" onClick={() => void value.retry()}
        className="min-h-11 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-honey">Retry {label.toLowerCase()}</button>}
    </div>)}
  </div>;
}
