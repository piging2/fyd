"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { WhyThis } from "../ui/why-this";
import { whyThisStepsFor } from "../object/why-this-steps";
import { verifyPresentationBinding } from "../sitespec/graph";
import { coarsenAddress } from "../sitespec/field-visibility";
import type { ObjectGraph } from "../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

interface ObjectOverlayProps {
  object: PingObject;
  /** Public graph: facts, relationships, and neighbor titles resolve here. */
  graph: ObjectGraph;
  siteId: string;
  onClose: () => void;
}

/**
 * Facts the overlay never shows raw: internal bookkeeping, claim-kind
 * markers, arrays that belong to dedicated surfaces, and title/
 * description (rendered as identity). Everything else is a candidate for
 * the compact fact list, binding-gated below.
 */
const FACT_DENYLIST: ReadonlySet<string> = new Set([
  "title",
  "description",
  "claimKind",
  "conflicts",
  "socials",
  "site_name",
  "locale",
  "type",
  "updated_time",
  "platform",
]);

/** Humanize a field name for display: "address_locality" -> "Address locality". */
function humanizeField(name: string): string {
  const spaced = name.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Humanize a predicate: "works_for" -> "Works for". */
function humanizePredicate(predicate: string): string {
  return humanizeField(predicate);
}

/**
 * Compact bound facts for the overlay (mobile-objects lane).
 *
 * Generic: walks the object's own fields, keeps short scalar values,
 * drops the denylist, and reads every value through the STRONG binding
 * verifier (direct classification): no binding, no fact. Address-bearing
 * fields follow the conservative default: coarsened, never raw (the
 * same coarsenAddress the projection layer applies). Capped so the
 * sheet stays compact.
 */
export function overlayFacts(
  object: PingObject,
  graph: ObjectGraph,
  maxFacts = 6,
): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  for (const [name, raw] of Object.entries(object.fields ?? {})) {
    if (facts.length >= maxFacts) break;
    if (FACT_DENYLIST.has(name)) continue;
    if (typeof raw !== "string" && !Array.isArray(raw)) continue;
    const verdict = verifyPresentationBinding(
      { objectId: object.id, field: name, classification: "direct" },
      graph,
    );
    if (!verdict.ok) continue;
    let value = verdict.value.trim();
    if (value.length === 0 || value.length > 160) continue;
    if (name.toLowerCase().includes("address")) {
      value = coarsenAddress(value);
    }
    facts.push({ label: humanizeField(name), value });
  }
  return facts;
}

export interface OverlayRelationship {
  predicateLabel: string;
  neighborId: string;
  neighborTitle: string;
  neighborSchema: string;
  /** True when this object is the relationship subject. */
  outgoing: boolean;
}

/**
 * Compact relationships for the overlay (mobile-objects lane).
 *
 * Generic: active relationships touching this object, neighbor identity
 * read through the binding verifier (no binding, no neighbor), neighbor
 * links point back at /o/<id> so the overlay itself is the traversal
 * surface (the site client intercepts those hrefs and swaps the open
 * object). Deterministic: id-sorted, capped.
 */
export function overlayRelationships(
  object: PingObject,
  graph: ObjectGraph,
  maxRels = 8,
): OverlayRelationship[] {
  const byId = new Map(graph.objects.map((o) => [o.id, o]));
  const rels: OverlayRelationship[] = [];
  const active = graph.relationships
    .filter((r) => r.status === "active")
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of active) {
    if (rels.length >= maxRels) break;
    const outgoing = r.subject === object.id;
    const neighborId = outgoing ? r.object : r.object === object.id ? r.subject : null;
    if (!neighborId) continue;
    const neighbor = byId.get(neighborId);
    if (!neighbor || neighbor.visibility !== "public") continue;
    const titleVerdict = verifyPresentationBinding(
      { objectId: neighbor.id, field: "title", classification: "direct" },
      graph,
    );
    if (!titleVerdict.ok) continue;
    rels.push({
      predicateLabel: humanizePredicate(r.predicate),
      neighborId: neighbor.id,
      neighborTitle: titleVerdict.value,
      neighborSchema: neighbor.schema,
      outgoing,
    });
  }
  return rels;
}

/**
 * ObjectOverlay: the compact object experience as an overlay.
 *
 * Mobile: bottom sheet.
 * Desktop: centered modal.
 *
 * Contains: object identity + type, useful fields (binding-verified),
 * relationships (traversable /o/ links), evidence / WHY THIS drill-down,
 * capabilities (the actions that actually work here), Ask FYD entry,
 * Open full object.
 *
 * WHY THIS honesty note (batch-rerun lane finding 3): the evidenceRef
 * behind these objects is a claim hash, not a byte-span locator, so the
 * drill-down names the source and the extraction method and states the
 * claim status. It never implies drill-to-source-bytes.
 *
 * Scroll preservation: saves window.scrollY on mount, restores on unmount.
 * The page behind does not scroll while the overlay is open.
 */
export function ObjectOverlay({ object, graph, siteId, onClose }: ObjectOverlayProps) {
  const savedScroll = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Save scroll position.
    savedScroll.current = window.scrollY;
    // Lock body scroll.
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the sheet for accessibility.
    sheetRef.current?.focus();

    // Escape to close.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKey);
      // Restore exact scroll position.
      window.scrollTo(0, savedScroll.current);
    };
  }, [onClose]);

  const detailHref = `/o/${encodeURIComponent(object.id)}`;
  const askHref = `/o/${encodeURIComponent(object.id)}#ask`;

  const provenance = object.provenance;
  const schemaLabel = object.schema.replace("ping.social.", "").replace("@1", "");
  const facts = overlayFacts(object, graph);
  const relationships = overlayRelationships(object, graph);
  const whySteps = whyThisStepsFor(object);

  const sectionLabel: CSSProperties = {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#666",
    marginBottom: "8px",
    fontWeight: 600,
  };

  return (
    <div
      className="fyd-object-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={object.title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={(e) => {
        // Click backdrop to close.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.5)",
        }}
      />
      {/* Sheet / Modal */}
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="fyd-object-sheet"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#fff",
          borderRadius: "16px 16px 0 0",
          padding: "24px",
          outline: "none",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            border: "1px solid #e0e0e0",
            background: "#fff",
            fontSize: "18px",
            cursor: "pointer",
          }}
        >
          ×
        </button>

        {/* Object identity + type */}
        <div style={{ marginBottom: "16px", paddingRight: "48px" }}>
          <div
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#666",
              marginBottom: "4px",
            }}
          >
            {schemaLabel}
          </div>
          <h2 style={{ fontSize: "24px", fontWeight: 600, margin: 0 }}>
            {object.title}
          </h2>
        </div>

        {/* Description */}
        {object.description && (
          <p style={{ fontSize: "16px", lineHeight: 1.5, color: "#333", marginBottom: "16px" }}>
            {object.description}
          </p>
        )}

        {/* Useful fields */}
        {facts.length > 0 && (
          <div style={{ marginBottom: "16px" }} data-testid="overlay-facts">
            <div style={sectionLabel}>Details</div>
            <dl style={{ margin: 0, display: "grid", gap: "8px" }}>
              {facts.map((f) => (
                <div key={f.label} style={{ display: "flex", gap: "8px", fontSize: "14px" }}>
                  <dt style={{ color: "#666", minWidth: "7rem", flexShrink: 0 }}>{f.label}</dt>
                  <dd style={{ margin: 0, color: "#1a1a1a", wordBreak: "break-word" }}>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Relationships */}
        {relationships.length > 0 && (
          <div style={{ marginBottom: "16px" }} data-testid="overlay-relationships">
            <div style={sectionLabel}>Related</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "8px" }}>
              {relationships.map((r) => (
                <li key={r.predicateLabel + ":" + r.neighborId} style={{ fontSize: "14px" }}>
                  <span style={{ color: "#666" }}>{r.predicateLabel}: </span>
                  <a
                    href={`/o/${encodeURIComponent(r.neighborId)}`}
                    style={{ color: "#1a1a1a", fontWeight: 600 }}
                  >
                    {r.neighborTitle}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Evidence / WHY THIS */}
        <div style={{ marginBottom: "16px" }} data-testid="overlay-evidence">
          <div style={sectionLabel}>Evidence</div>
          {whySteps.length > 0 ? (
            <WhyThis claim={object.title} steps={whySteps} />
          ) : null}
          {provenance && (
            <div
              style={{
                fontSize: "13px",
                color: "#666",
                background: "#f5f5f5",
                borderRadius: "8px",
                padding: "12px",
                marginTop: whySteps.length > 0 ? "12px" : 0,
              }}
            >
              <strong>Source:</strong> {provenance.kind}
              {provenance.ref && (
                <span style={{ display: "block", marginTop: "4px", wordBreak: "break-all" }}>
                  {provenance.ref}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Capabilities / actions */}
        <div style={{ marginBottom: "8px" }} data-testid="overlay-actions">
          <div style={sectionLabel}>Do more with this object</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "4px" }}>
          <a
            href={askHref}
            style={{
              display: "block",
              textAlign: "center",
              padding: "14px",
              background: "#1a1a1a",
              color: "#fff",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Ask FYD about this
          </a>
          <a
            href={detailHref}
            style={{
              display: "block",
              textAlign: "center",
              padding: "14px",
              background: "#fff",
              color: "#1a1a1a",
              border: "1px solid #1a1a1a",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Open full object
          </a>
        </div>
      </div>
      <style>{`
        @media (min-width: 768px) {
          .fyd-object-overlay {
            align-items: center !important;
            padding: 24px;
          }
          .fyd-object-sheet {
            border-radius: 16px !important;
            max-height: 85vh !important;
          }
        }
      `}</style>
    </div>
  );
}
