/**
 * /quote-journey — SERVICE OBJECTS for the isolated quote journey (TEST PLANE).
 *
 * Not linked from any public navigation. Renders the test tenant's
 * published service catalog as service objects, each with a real
 * REQUEST QUOTE button that opens the real form. Server component:
 * the catalog is read server-side only.
 *
 * Not connected to any real business, the public demo, or the
 * production journal (CEO 2026-10-11).
 */

import { QuoteForm } from "./_components/quote-form";
import {
  QUOTE_JOURNEY_BLURBS,
  QUOTE_JOURNEY_CATALOG,
  QUOTE_JOURNEY_SITE_ID,
} from "@/app/api/fyd/inquiry/catalog";

export const metadata = {
  title: "Quote journey (test plane)",
  robots: "noindex",
};

export const dynamic = "force-dynamic";

export default function QuoteJourneyPage() {
  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "#fffbeb",
          border: "1px solid #f59e0b",
          borderRadius: 8,
          padding: 12,
          marginBottom: 24,
          fontSize: 14,
        }}
      >
        <strong>TEST PLANE.</strong> Isolated quote-journey proving ground for
        tenant <code>{QUOTE_JOURNEY_SITE_ID}</code>. Not a real business, not
        the public demo, not the production journal. Submissions stay on this
        server; nothing is emailed or messaged anywhere.
      </div>

      <h1 style={{ fontSize: 32, margin: "0 0 8px" }}>Request a quote</h1>
      <p style={{ color: "#475569", marginTop: 0 }}>
        Pick a service, press <strong>Request quote</strong>, fill the form,
        and receive a durable receipt. Retrying with the same request replays
        the stored receipt instead of creating a duplicate.
      </p>

      <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
        {QUOTE_JOURNEY_CATALOG.map((service) => (
          <section
            key={service.id}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 20,
              background: "#fff",
            }}
          >
            <h2 style={{ fontSize: 20, margin: "0 0 6px" }}>{service.label}</h2>
            <p style={{ color: "#475569", margin: "0 0 4px", fontSize: 14 }}>
              {QUOTE_JOURNEY_BLURBS[service.id] ?? ""}
            </p>
            <p style={{ color: "#94a3b8", margin: 0, fontSize: 12 }}>
              Service object: <code>{service.id}</code>
            </p>
            <QuoteForm
              siteId={QUOTE_JOURNEY_SITE_ID}
              serviceId={service.id}
              serviceLabel={service.label}
            />
          </section>
        ))}
      </div>
    </main>
  );
}
