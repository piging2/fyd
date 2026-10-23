"use client";

/**
 * /quote-journey/inbox — OWNER INBOX (TEST PLANE ONLY).
 *
 * Caller-key authenticated: paste the operator-provisioned key, load the
 * inbox for the isolated test tenant. Wrong/missing key -> typed deny,
 * zero records. Full inquiry records (including contact details) are
 * shown here because this surface is owner-only, never public.
 */

import { useState } from "react";

interface InquiryRecord {
  receiptId: string;
  inquiryRef: string;
  siteId: string;
  serviceId: string;
  serviceLabel: string;
  visitorName: string;
  visitorContact: string;
  visitorMessage: string;
  receivedAt: string;
  eventId: string;
  idempotencyKey: string | null;
}

const SITE_ID = "quote-journey-test";

export default function QuoteJourneyInboxPage() {
  const [callerKey, setCallerKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<InquiryRecord[] | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    setInquiries(null);
    try {
      const res = await fetch(
        `/api/fyd/inquiry/inbox?siteId=${encodeURIComponent(SITE_ID)}`,
        { headers: { "x-mc-caller-key": callerKey } },
      );
      const data = (await res.json()) as {
        ok: boolean;
        code?: string;
        reason?: string;
        inquiries?: InquiryRecord[];
      };
      if (!data.ok || !data.inquiries) {
        setError(
          `${res.status} ${data.code ?? "error"}: ${data.reason ?? "inbox load failed"}`,
        );
        return;
      }
      setInquiries(data.inquiries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 1100,
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
        <strong>TEST PLANE — OWNER ONLY.</strong> Inquiry inbox for tenant{" "}
        <code>{SITE_ID}</code>. Requires the operator-provisioned caller key.
        Contact details shown here are tenant-private and never appear in any
        public view.
      </div>

      <h1 style={{ fontSize: 28, margin: "0 0 16px" }}>Owner inbox</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 14, flex: 1 }}>
          Caller key
          <input
            type="password"
            value={callerKey}
            onChange={(e) => setCallerKey(e.target.value)}
            autoComplete="off"
            placeholder="x-mc-caller-key value"
            style={{ padding: 8 }}
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          style={{ padding: "8px 18px", alignSelf: "end", cursor: "pointer" }}
        >
          {busy ? "Loading…" : "Load inbox"}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ color: "#b91c1c", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {inquiries !== null && inquiries.length === 0 && (
        <p style={{ color: "#475569" }}>No inquiries yet.</p>
      )}

      {inquiries !== null && inquiries.length > 0 && (
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            fontSize: 14,
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #cbd5e1" }}>
              <th style={{ padding: 8 }}>Received</th>
              <th style={{ padding: 8 }}>Service</th>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Contact</th>
              <th style={{ padding: 8 }}>Message</th>
              <th style={{ padding: 8 }}>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {inquiries.map((i) => (
              <tr key={i.receiptId} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                  {i.receivedAt}
                </td>
                <td style={{ padding: 8 }}>{i.serviceLabel}</td>
                <td style={{ padding: 8 }}>{i.visitorName}</td>
                <td style={{ padding: 8 }}>{i.visitorContact}</td>
                <td style={{ padding: 8, maxWidth: 320 }}>{i.visitorMessage}</td>
                <td style={{ padding: 8 }}>
                  <code>{i.receiptId}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
