"use client";

import { useEffect, useRef } from "react";

interface ObjectOverlayProps {
  object: {
    id: string;
    title: string;
    description?: string;
    schema: string;
    visibility: string;
    fields?: Record<string, unknown>;
    provenance?: { kind: string; ref: string };
  };
  siteId: string;
  onClose: () => void;
}

/**
 * ObjectOverlay: rich object experience as an overlay.
 *
 * Mobile: bottom sheet.
 * Desktop: centered modal.
 *
 * Contains: object identity, description, evidence/provenance,
 * actions, Ask FYD, Open full object.
 *
 * Scroll preservation: saves window.scrollY on mount, restores on unmount.
 * The page behind does not scroll while the overlay is open.
 */
export function ObjectOverlay({ object, siteId, onClose }: ObjectOverlayProps) {
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

        {/* Object identity */}
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

        {/* Evidence / Provenance */}
        {provenance && (
          <div
            style={{
              fontSize: "13px",
              color: "#666",
              background: "#f5f5f5",
              borderRadius: "8px",
              padding: "12px",
              marginBottom: "16px",
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

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "20px" }}>
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
