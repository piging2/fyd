"use client";

/**
 * QuoteForm — the real quote-request form (test plane).
 *
 * Posts to POST /api/fyd/inquiry with a client-generated idempotency key.
 * Retries REPLAY the stored receipt (same key): decision replay, never
 * mutation replay. Server-side validation is authoritative; client checks
 * are a courtesy.
 */

import { useState } from "react";

function newIdempotencyKey(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

interface Receipt {
  receiptId: string;
  inquiryRef: string;
  siteId: string;
  serviceId: string;
  serviceLabel: string;
  receivedAt: string;
}

export function QuoteForm({
  siteId,
  serviceId,
  serviceLabel,
  startOpen = false,
}: {
  siteId: string;
  serviceId: string;
  serviceLabel: string;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [replayed, setReplayed] = useState(false);

  async function submit(idempotencyKey: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/fyd/inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId,
          serviceId,
          visitorName: name,
          visitorContact: contact,
          visitorMessage: message,
          idempotencyKey,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        code?: string;
        reason?: string;
        replayed?: boolean;
        receipt?: Receipt;
      };
      if (!data.ok || !data.receipt) {
        setError(
          `${res.status} ${data.code ?? "error"}: ${data.reason ?? "submission failed"}`,
        );
        return;
      }
      setReceipt(data.receipt);
      setReplayed(data.replayed === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network error");
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div
        role="status"
        style={{
          marginTop: 12,
          padding: 16,
          borderRadius: 8,
          background: "#ecfdf5",
          border: "1px solid #6ee7b7",
        }}
      >
        <strong>Quote request received.</strong>
        <div style={{ marginTop: 8, fontSize: 14 }}>
          <div>Service: {receipt.serviceLabel}</div>
          <div>
            Receipt: <code>{receipt.receiptId}</code>
          </div>
          <div>Reference: {receipt.inquiryRef}</div>
          <div>Received: {receipt.receivedAt}</div>
          {replayed && (
            <div style={{ marginTop: 6, color: "#065f46" }}>
              This is the stored receipt for your earlier request — the
              retry created nothing new.
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => key && submit(key)}
          style={{ marginTop: 12, padding: "8px 14px", cursor: "pointer" }}
        >
          {busy ? "Retrying…" : "Retry with the same request (idempotency proof)"}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setKey((k) => k ?? newIdempotencyKey());
        }}
        style={{
          marginTop: 12,
          padding: "10px 18px",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Request quote
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const k = key ?? newIdempotencyKey();
        setKey(k);
        void submit(k);
      }}
      style={{
        marginTop: 12,
        padding: 16,
        borderRadius: 8,
        background: "#f8fafc",
        border: "1px solid #cbd5e1",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 600 }}>Request a quote: {serviceLabel}</div>
      <label style={{ display: "grid", gap: 4, fontSize: 14 }}>
        Your name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
          style={{ padding: 8 }}
        />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 14 }}>
        Email or phone
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com or your phone number"
          style={{ padding: 8 }}
        />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 14 }}>
        Tell us about the job (10–2000 characters)
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={10}
          maxLength={2000}
          rows={4}
          style={{ padding: 8 }}
        />
      </label>
      {error && (
        <div role="alert" style={{ color: "#b91c1c", fontSize: 14 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          disabled={busy}
          style={{ padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}
        >
          {busy ? "Sending…" : "Send quote request"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{ padding: "10px 14px", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
      <div style={{ fontSize: 12, color: "#64748b" }}>
        Test plane: nothing leaves this server. Your details are stored
        tenant-private and never appear in any public view.
      </div>
    </form>
  );
}
