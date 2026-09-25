"use client";

/**
 * /fyd: the FYD onboarding entry point.
 *
 * PASTE URL -> FYD UNDERSTANDS IT -> GENERATED PREVIEW -> USER SEES VALUE
 * -> CLAIM/SAVE/CUSTOMIZE -> AUTHENTICATE.
 *
 * Registration is never placed before value: the preview is anonymous and
 * the claim flow only appears after the user has seen the preview. Demo
 * owner mode, when enabled, is visibly labeled as demo/testing and is
 * never presented as real authentication.
 */
import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";

interface PageEvidence {
  title: string | null;
  description: string | null;
  headings: string[];
  phone: string | null;
  email: string | null;
  address: string | null;
  services: string[];
  hours: string[];
  social: string[];
}

interface Preview {
  resourceId: string;
  sourceUrl: string;
  finalUrl: string;
  fetchedAt: string;
  claimState: "observed";
  evidence: PageEvidence;
  crawl: { pagesFetched: number; bytesUsed: number; cacheHit: boolean };
}

interface ClaimEvent {
  at: string;
  actor: string;
  type: string;
  detail: string;
}

interface Claim {
  resourceId: string;
  state: "observed" | "claimed" | "verified-controlled";
  sourceUrl: string | null;
  claimedBy: { actorLabel: string; kind: string; authNote: string } | null;
  verification: { method: string; verifiedBy: string; basis: string; proofNote: string } | null;
  history: ClaimEvent[];
}

interface Identity {
  kind: string;
  actorLabel: string;
  authNote: string;
}

interface VerifyMethod {
  method: string;
  implemented: boolean;
  label: string;
  description: string;
}

type Outcome =
  | { ok: true; preview: Preview }
  | { ok: false; code: string; message: string; retryAfterMs?: number };

const panel: CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: 16,
  marginTop: 16,
  maxWidth: 720,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 16,
  borderRadius: 6,
  border: "1px solid #bbb",
  boxSizing: "border-box",
};

const buttonStyle: CSSProperties = {
  padding: "10px 18px",
  fontSize: 16,
  borderRadius: 6,
  border: "none",
  background: "#222",
  color: "#fff",
  cursor: "pointer",
};

async function postJson(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function getJson(path: string) {
  const res = await fetch(path);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

export default function FydOnboardingPage() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);
  const [methods, setMethods] = useState<VerifyMethod[]>([]);
  const [basis, setBasis] = useState("");
  const [method, setMethod] = useState("operator-attestation");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    getJson("/api/fyd/claims/identity").then(({ json }) => {
      setIdentity((json.identity as Identity | null) ?? null);
    });
    getJson("/api/fyd/claims/verification-methods").then(({ json }) => {
      setMethods((json.methods as VerifyMethod[]) ?? []);
    });
  }, []);

  const refreshClaim = useCallback(async (resourceId: string) => {
    const { status, json } = await getJson(
      "/api/fyd/claims/" + encodeURIComponent(resourceId),
    );
    if (status === 200) setClaim(json.claim as Claim);
    else setClaim(null);
  }, []);

  const runPreview = useCallback(async () => {
    setBusy(true);
    setNote(null);
    setClaim(null);
    try {
      const { json } = await postJson("/api/fyd/onboarding/preview", { url });
      setOutcome(json as Outcome);
      if ((json as Outcome).ok) {
        await refreshClaim((json as Extract<Outcome, { ok: true }>).preview.resourceId);
      }
    } catch {
      setOutcome({ ok: false, code: "fetch-failed", message: "The preview request failed." });
    } finally {
      setBusy(false);
    }
  }, [url, refreshClaim]);

  const runClaim = useCallback(async () => {
    const preview = outcome && outcome.ok ? outcome.preview : null;
    if (!preview) return;
    setBusy(true);
    setNote(null);
    const { status, json } = await postJson(
      "/api/fyd/claims/" + encodeURIComponent(preview.resourceId) + "/claim",
      { sourceUrl: preview.finalUrl },
    );
    if (status === 200) {
      setClaim(json.claim as Claim);
      setNote("Saved. This resource is now claimed in demo mode.");
    } else {
      setNote(String(json.message ?? "Claiming failed."));
    }
    setBusy(false);
  }, [outcome]);

  const runVerify = useCallback(async () => {
    const preview = outcome && outcome.ok ? outcome.preview : null;
    if (!preview) return;
    setBusy(true);
    setNote(null);
    const { status, json } = await postJson(
      "/api/fyd/claims/" + encodeURIComponent(preview.resourceId) + "/verify",
      { method, basis },
    );
    if (status === 200) {
      setClaim(json.claim as Claim);
      setNote("Control verified via " + method + ".");
      setBasis("");
    } else {
      setNote(String(json.message ?? "Verification failed."));
    }
    setBusy(false);
  }, [outcome, method, basis]);

  const runRelease = useCallback(async () => {
    const preview = outcome && outcome.ok ? outcome.preview : null;
    if (!preview) return;
    setBusy(true);
    setNote(null);
    const { status, json } = await postJson(
      "/api/fyd/claims/" + encodeURIComponent(preview.resourceId) + "/release",
      {},
    );
    if (status === 200) {
      setClaim(json.claim as Claim);
      setNote("Claim released. The resource is public evidence only again.");
    } else {
      setNote(String(json.message ?? "Release failed."));
    }
    setBusy(false);
  }, [outcome]);

  const preview = outcome && outcome.ok ? outcome.preview : null;
  const failure = outcome && !outcome.ok ? outcome : null;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 4 }}>FYD</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Paste a URL. FYD reads what is publicly there and shows you what it understood. No account needed.
      </p>

      <div style={{ ...panel, marginTop: 8 }}>
        <label htmlFor="fyd-url" style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
          Business website URL
        </label>
        <input
          id="fyd-url"
          style={inputStyle}
          placeholder="https://example.com/"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runPreview();
          }}
        />
        <div style={{ marginTop: 12 }}>
          <button style={buttonStyle} onClick={runPreview} disabled={busy || !url.trim()}>
            {busy ? "Reading..." : "Preview what FYD sees"}
          </button>
        </div>
        {failure && (
          <p style={{ color: "#a00", marginTop: 12 }}>
            {failure.message}
            {failure.code === "rate-limited" && failure.retryAfterMs
              ? " Try again in about " + Math.ceil(failure.retryAfterMs / 1000) + " seconds."
              : null}
          </p>
        )}
      </div>

      {preview && (
        <div style={panel}>
          <h2 style={{ marginTop: 0 }}>{preview.evidence.title ?? "Untitled page"}</h2>
          {preview.evidence.description && <p>{preview.evidence.description}</p>}
          <dl>
            {preview.evidence.phone && (
              <>
                <dt style={{ fontWeight: 600 }}>Phone</dt>
                <dd>{preview.evidence.phone}</dd>
              </>
            )}
            {preview.evidence.email && (
              <>
                <dt style={{ fontWeight: 600 }}>Email</dt>
                <dd>{preview.evidence.email}</dd>
              </>
            )}
            {preview.evidence.address && (
              <>
                <dt style={{ fontWeight: 600 }}>Address</dt>
                <dd>{preview.evidence.address}</dd>
              </>
            )}
            {preview.evidence.hours.length > 0 && (
              <>
                <dt style={{ fontWeight: 600 }}>Hours</dt>
                <dd>{preview.evidence.hours.join("; ")}</dd>
              </>
            )}
          </dl>
          {preview.evidence.services.length > 0 && (
            <>
              <h3>Services seen on the page</h3>
              <ul>
                {preview.evidence.services.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          <p style={{ color: "#777", fontSize: 13 }}>
            Read from {preview.finalUrl}
            {preview.crawl.cacheHit ? " (served from a recent preview)" : ""}.
          </p>
        </div>
      )}

      {preview && (
        <div style={panel}>
          <h2 style={{ marginTop: 0 }}>Claim / Save</h2>
          <p>
            Status:{" "}
            <strong>
              {claim ? claim.state.toUpperCase().replace("-", " ") : "OBSERVED"}
            </strong>
          </p>
          {identity === undefined && <p>Checking claim availability...</p>}
          {identity === null && (
            <p>
              Claiming is not available right now: no sign-in is wired up. The preview above
              is saved as public evidence only, with no ownership claimed.
            </p>
          )}
          {identity && identity.kind === "demo-owner" && (
            <p style={{ background: "#fff4d6", padding: 8, borderRadius: 6 }}>
              Demo owner mode: testing only. This is not real authentication and confers no
              production ownership.
            </p>
          )}
          {claim?.claimedBy && (
            <p>
              Claimed by {claim.claimedBy.actorLabel}. {claim.claimedBy.authNote}
            </p>
          )}
          {claim?.verification && (
            <p>
              Verified via {claim.verification.method} by {claim.verification.verifiedBy}:{" "}
              {claim.verification.basis} {claim.verification.proofNote}
            </p>
          )}

          {(!claim || claim.state === "observed") && identity && (
            <button style={buttonStyle} onClick={runClaim} disabled={busy}>
              {busy ? "Saving..." : "Claim / Save this resource"}
            </button>
          )}

          {claim && claim.state === "claimed" && (
            <div style={{ marginTop: 12 }}>
              <h3>Verify control</h3>
              <label style={{ display: "block", marginBottom: 4 }}>
                Method
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  style={{ ...inputStyle, marginTop: 4 }}
                >
                  {methods.map((m) => (
                    <option key={m.method} value={m.method} disabled={!m.implemented}>
                      {m.label}
                      {m.implemented ? "" : " (not built yet)"}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "block", marginTop: 8 }}>
                Basis for the verification
                <textarea
                  value={basis}
                  onChange={(e) => setBasis(e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, marginTop: 4 }}
                  placeholder="How do you know you control this resource?"
                />
              </label>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button style={buttonStyle} onClick={runVerify} disabled={busy || !basis.trim()}>
                  {busy ? "Verifying..." : "Verify control"}
                </button>
                <button
                  style={{ ...buttonStyle, background: "#777" }}
                  onClick={runRelease}
                  disabled={busy}
                >
                  Release claim
                </button>
              </div>
            </div>
          )}

          {claim && claim.state === "verified-controlled" && (
            <div style={{ marginTop: 12 }}>
              <button style={{ ...buttonStyle, background: "#777" }} onClick={runRelease} disabled={busy}>
                Release claim
              </button>
            </div>
          )}

          {note && <p style={{ marginTop: 12 }}>{note}</p>}

          {claim && (claim.history ?? []).length > 0 && (
            <>
              <h3>History</h3>
              <ul>
                {(claim.history ?? []).map((h, i) => (
                  <li key={i}>
                    <strong>{h.type}</strong> by {h.actor}: {h.detail}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </main>
  );
}
