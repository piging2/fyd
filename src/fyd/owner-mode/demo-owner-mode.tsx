/**
 * H3 lane: DEMO OWNER MODE panel.
 *
 * "use client" because the attestation walkthrough is interactive demo
 * state (button -> gate -> verdict). Renders NOTHING unless the 
 * prop is true; the server resolves the dev-only gate (./gate.ts) once per
 * request and passes the resolved boolean down. The client never reads the
 * environment for this decision (hydration #418, 2026-09-25).
 *
 * The banner is deliberately conspicuous: striped hazard border and the
 * exact words "DEMO OWNER MODE - not real authentication". Nothing about
 * this panel may be mistaken for a login, a session, or real access
 * control. See ./gate.ts and ./capability.ts for the full disclaimers.
 */

"use client";

import { useState } from "react";
import {
  DEMO_OWNER_ACTOR,
  evaluateAllCapabilities,
  resolveDemoRelationship,
  type CapabilityVerdict,
} from "./capability";
import { attest, preconditionsFor } from "./attestation-gate";
import { CustomizePanel } from "./customize-panel";

const hazard =
  "repeating-linear-gradient(45deg, #3a2b00 0 16px, #14100a 16px 32px)";

interface AttestAttempt {
  label: string;
  result: ReturnType<typeof attest>;
}

export function DemoOwnerMode({
  siteId,
  enabled,
}: {
  siteId: string;
  /**
   * Resolved server-side (see ./gate.ts) and passed down as a prop.
   * The client MUST NOT independently read environment state for this
   * decision: NEXT_PUBLIC_* build-time inlining skew between the server
   * request-time value and the client bundle caused hydration #418
   * (2026-09-25). One resolution source, passed down. That is the whole
   * contract.
   */
  enabled: boolean;
}) {
  const [attempts, setAttempts] = useState<AttestAttempt[]>([]);

  // Dev-only gate: the entire panel (banner included) renders null unless
  // the server resolved demo-owner mode as enabled. There is no other way
  // to enable it, and the client never consults the environment itself.
  if (!enabled) return null;

  const actor = DEMO_OWNER_ACTOR;
  const relationship = resolveDemoRelationship(siteId, actor);
  const verdicts: CapabilityVerdict[] = evaluateAllCapabilities(
    actor,
    relationship,
  );
  const attestVerdict = verdicts.find(
    (v) => v.capability === "owner.attest-regen",
  );

  const runAttest = (withEvidence: boolean) => {
    if (!attestVerdict?.allowed) return;
    const evidence = withEvidence
      ? {
          approved_transition_id: "demo-transition-001",
          rendered_sitespec_hash: "demo-sitespec-hash",
          bindings_verified: true,
        }
      : {};
    const result = attest("regen-complete", evidence, undefined, () =>
      new Date().toISOString(),
    );
    setAttempts((prev) =>
      prev.concat([
        {
          label: withEvidence
            ? "Attest with evidence"
            : "Attest with NO evidence",
          result,
        },
      ]),
    );
  };

  return (
    <section
      aria-label="Demo owner mode"
      style={{ border: "6px solid transparent", borderImage: `${hazard} 1`, background: "#171208" }}
    >
      <div style={{ padding: "18px 22px" }}>
        <div
          style={{
            display: "inline-block",
            background: "#f5c518",
            color: "#171208",
            fontWeight: 800,
            letterSpacing: 1,
            padding: "6px 14px",
            fontSize: 15,
          }}
        >
          DEMO OWNER MODE - not real authentication
        </div>
        <p style={{ color: "#f5eeda", fontSize: 14, margin: "12px 0 0", maxWidth: 720 }}>
          Demo seam only: no identity is verified, no session exists, no
          credential is checked. The actor below is a label, the relationship
          is a hard-coded demo mapping, and every verdict shows its reason.
          Never confuse this panel with production access control.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 16 }}>
          <div
            style={{
              background: "#221b0e",
              border: "1px solid #6b5518",
              borderRadius: 8,
              padding: "12px 16px",
              minWidth: 260,
            }}
          >
            <div style={{ color: "#9c8a4d", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
              Actor
            </div>
            <div style={{ color: "#f5eeda", fontWeight: 700, marginTop: 4 }}>
              {actor.label}
            </div>
            <div style={{ color: "#9c8a4d", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginTop: 12 }}>
              Relationship to {siteId}
            </div>
            <div style={{ color: "#f5eeda", fontWeight: 700, marginTop: 4 }}>
              {relationship.kind}
            </div>
            <div style={{ color: "#c9b98a", fontSize: 13, marginTop: 4 }}>
              {relationship.basis}
            </div>
          </div>

          <div
            style={{
              background: "#221b0e",
              border: "1px solid #6b5518",
              borderRadius: 8,
              padding: "12px 16px",
              minWidth: 300,
              flex: 1,
            }}
          >
            <div style={{ color: "#9c8a4d", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
              Capability evaluation (live)
            </div>
            <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
              {verdicts.map((v) => (
                <li key={v.capability} style={{ marginTop: 10 }}>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 12,
                      fontWeight: 800,
                      padding: "2px 10px",
                      borderRadius: 9999,
                      background: v.allowed ? "#1d3a24" : "#3a1d1d",
                      color: v.allowed ? "#7fd08a" : "#e08a8a",
                      marginRight: 8,
                    }}
                  >
                    {v.allowed ? "ALLOW" : "DENY"}
                  </span>
                  <code style={{ color: "#f5eeda", fontSize: 13 }}>
                    {v.capability}
                  </code>
                  <div style={{ color: "#c9b98a", fontSize: 13, marginTop: 4 }}>
                    {v.reason}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            background: "#221b0e",
            border: "1px solid #6b5518",
            borderRadius: 8,
            padding: "12px 16px",
          }}
        >
          <div style={{ color: "#9c8a4d", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
            Owner action: attest regen-complete
          </div>
          <div style={{ color: "#c9b98a", fontSize: 13, marginTop: 6 }}>
            Requires capability owner.attest-regen (
            {attestVerdict?.allowed ? "granted above" : "denied above"}) AND
            evidence preconditions:{" "}
            {preconditionsFor("regen-complete").join(", ")}.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => runAttest(false)}
              disabled={!attestVerdict?.allowed}
              style={{
                background: "#f5c518",
                color: "#171208",
                fontWeight: 700,
                border: "none",
                borderRadius: 8,
                padding: "10px 16px",
                cursor: attestVerdict?.allowed ? "pointer" : "not-allowed",
                opacity: attestVerdict?.allowed ? 1 : 0.5,
              }}
            >
              Attest with NO evidence
            </button>
            <button
              type="button"
              onClick={() => runAttest(true)}
              disabled={!attestVerdict?.allowed}
              style={{
                background: "transparent",
                color: "#f5c518",
                fontWeight: 700,
                border: "2px solid #f5c518",
                borderRadius: 8,
                padding: "8px 14px",
                cursor: attestVerdict?.allowed ? "pointer" : "not-allowed",
                opacity: attestVerdict?.allowed ? 1 : 0.5,
              }}
            >
              Attest with evidence
            </button>
          </div>
          {attempts.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              {attempts.map((a, i) => (
                <pre
                  key={i}
                  style={{
                    background: "#100c06",
                    color: a.result.status === "ATTESTED" ? "#7fd08a" : "#e08a8a",
                    fontSize: 12,
                    padding: 10,
                    borderRadius: 8,
                    overflowX: "auto",
                    marginTop: 8,
                  }}
                >
                  {a.label} =&gt; {a.result.status}
                  {a.result.reason ? "\nreason: " + a.result.reason : ""}
                  {a.result.attestation
                    ? "\nattestedAt: " + a.result.attestation.attestedAt
                    : ""}
                </pre>
              ))}
            </div>
          ) : null}
        </div>

        <CustomizePanel siteId={siteId} />
      </div>
    </section>
  );
}
