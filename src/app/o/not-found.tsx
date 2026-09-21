/**
 * Object 404. Generic and object-neutral: no PING marketing chrome, no
 * customer-specific content. Rendering this under /o keeps the root
 * marketing not-found boundary out of the object flight payload.
 */

import Link from "next/link";

export const metadata = {
  title: { absolute: "Object not found | FYD" },
  robots: { index: false },
};

export default function ObjectNotFound() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f6f4ee",
        color: "#3d3831",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#e8e2d4",
            display: "grid",
            placeItems: "center",
            fontSize: 24,
            margin: "0 auto 16px",
          }}
        >
          ?
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 650, margin: "0 0 8px" }}>
          This object could not be found
        </h1>
        <p style={{ fontSize: 14, opacity: 0.75, margin: "0 0 20px", lineHeight: 1.6 }}>
          The link may be wrong, or the object may have been removed.
        </p>
        <Link
          href="/o"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            borderRadius: 999,
            background: "#3d3831",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Browse objects
        </Link>
      </div>
    </div>
  );
}
