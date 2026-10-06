/**
 * LANE-OWNER: the DEMO OWNER MODE console.
 *
 * "use client" because the walkthrough is interactive demo state.
 * Renders NOTHING unless the dev-only gate (./gate.ts) is enabled via
 * NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1 on a localhost/private host.
 *
 * The banner is deliberately conspicuous: the exact words
 * "DEMO OWNER MODE - not real authentication". Nothing about this panel
 * may be mistaken for a login, a session, or real access control.
 *
 * Owner-surface language rule: the tabs read OBJECTS, CONTENT,
 * VISIBILITY, SITE, ASK FYD, EVIDENCE. No events, hashes, digests, or
 * protocol jargon appear anywhere on this surface; provenance is shown
 * as plain words (who, when, what changed).
 *
 * The six tabs:
 *   OBJECTS     the extracted site facts (read-only).
 *   CONTENT     confirm / correct / hide individual facts. Assertions are
 *               provenance-backed; source changes surface as conflicts.
 *   VISIBILITY  per-fact public/hidden policy with safety bounds.
 *   SITE        conversational commands: compile -> preview -> approve ->
 *               apply, plus journal replay over a fresh base.
 *   ASK FYD     honest scope note (no fake chat in this demo surface).
 *   EVIDENCE    every assertion, decision, and approval with its
 *               provenance, in plain words.
 */

"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { isDemoOwnerModeEnabled } from "./gate";
import {
  DEMO_OWNER_ACTOR,
  evaluateCapability,
  resolveDemoRelationship,
} from "./capability";
import {
  applyCorrections,
  assertCorrection,
  type CorrectionOp,
  type OwnerAssertion,
} from "./corrections";
import { demoProvenance } from "./provenance";
import { extractSiteFacts, factLabel, type SiteFact } from "./facts";
import {
  projectPublicFacts,
  resolveFactVisibility,
  setFactVisibility,
} from "./visibility-policy";
import {
  compileOwnerCommand,
} from "../customize/owner-command-compiler";
import {
  applyOwnerProposal,
  approveOwnerProposal,
  draftOwnerProposal,
  emptyOwnerSiteState,
  ownerStateDigest,
  replayOwnerJournal,
  requiredCapabilityFor,
  type OwnerProposal,
  type OwnerSiteState,
} from "../customize/owner-proposal";
import type { FYDSiteSpec, ObjectGraph } from "../sitespec/types";

type Tab = "OBJECTS" | "CONTENT" | "VISIBILITY" | "SITE" | "ASK FYD" | "EVIDENCE";

const TABS: Tab[] = ["OBJECTS", "CONTENT", "VISIBILITY", "SITE", "ASK FYD", "EVIDENCE"];

const panel: CSSProperties = {
  background: "#221b0e",
  border: "1px solid #6b5518",
  borderRadius: 8,
  padding: "12px 16px",
  marginTop: 12,
};

const label: CSSProperties = {
  color: "#9c8a4d",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const body: CSSProperties = { color: "#f5eeda", fontSize: 14 };

const btn: CSSProperties = {
  background: "#3a2f14",
  color: "#f5eeda",
  border: "1px solid #6b5518",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
  marginRight: 8,
  marginTop: 6,
};

const hazard =
  "repeating-linear-gradient(45deg, #3a2b00 0 16px, #14100a 16px 32px)";

export function DemoOwnerConsole({
  siteId,
  graph,
  spec,
}: {
  siteId: string;
  graph: ObjectGraph;
  spec: FYDSiteSpec;
}) {
  const enabled = isDemoOwnerModeEnabled();

  const [tab, setTab] = useState<Tab>("OBJECTS");
  const [siteState, setSiteState] = useState<OwnerSiteState>(() =>
    emptyOwnerSiteState(spec),
  );
  const [journal, setJournal] = useState<OwnerProposal[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  // SITE tab walkthrough state
  const [command, setCommand] = useState("");
  const [draft, setDraft] = useState<OwnerProposal | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [replayNote, setReplayNote] = useState<string | null>(null);

  // CONTENT tab state
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const [correctValue, setCorrectValue] = useState("");

  const titles = useMemo(
    () => new Map(graph.objects.map((o) => [o.id, o.title] as const)),
    [graph],
  );
  const facts: SiteFact[] = useMemo(
    () => extractSiteFacts(graph, new Date().toISOString()),
    [graph],
  );
  const corrected = useMemo(
    () => applyCorrections(facts, siteState.assertions),
    [facts, siteState.assertions],
  );
  const projection = useMemo(
    () =>
      projectPublicFacts(
        corrected.facts,
        siteState.visibilityDecisions,
        siteState.assertions,
      ),
    [corrected, siteState.visibilityDecisions, siteState.assertions],
  );
  const labelOf = (f: SiteFact) => factLabel(titles, f);

  const say = (text: string) => setNotice(text);

  const capabilityVerdict = (proposal: OwnerProposal) =>
    evaluateCapability(
      DEMO_OWNER_ACTOR,
      resolveDemoRelationship(siteId, DEMO_OWNER_ACTOR),
      requiredCapabilityFor(proposal.kind),
    );

  // -- CONTENT tab actions ---------------------------------------------

  const recordAssertion = (
    fact: SiteFact,
    op: CorrectionOp,
    value?: string,
  ) => {
    try {
      const assertion = assertCorrection({
        factRef: { objectId: fact.objectId, field: fact.field, index: fact.index },
        op,
        value,
        provenance: demoProvenance(),
        sourceValueSeen: fact.value,
      });
      setSiteState((s) => ({ ...s, assertions: [...s.assertions, assertion] }));
      say(
        op === "CONFIRM"
          ? "Confirmed: " + labelOf(fact) + "."
          : op === "CORRECT"
            ? "Correction recorded for " + labelOf(fact) + "."
            : "Hidden: " + labelOf(fact) + ". It will not appear on the public site.",
      );
    } catch (e) {
      say(e instanceof Error ? e.message : "Could not record the correction.");
    }
  };

  // -- VISIBILITY tab actions ------------------------------------------

  const setVisibility = (fact: SiteFact, visibility: "public" | "hidden") => {
    const out = setFactVisibility(
      corrected.facts,
      siteState.visibilityDecisions,
      fact.factId,
      visibility,
      demoProvenance(),
    );
    if (!out.ok) {
      say("Not changed: " + out.reason);
      return;
    }
    setSiteState((s) => ({ ...s, visibilityDecisions: out.decisions }));
    say(
      labelOf(fact) +
        " is now " +
        (visibility === "public" ? "shown" : "hidden") +
        " on the public site.",
    );
  };

  // -- SITE tab walkthrough --------------------------------------------

  const runCompile = () => {
    setCommandError(null);
    setDraft(null);
    const compiled = compileOwnerCommand(command);
    if (!compiled.ok) {
      setCommandError(compiled.reason);
      return;
    }
    const drafted = draftOwnerProposal(command, compiled.intent, {
      spec: siteState.spec,
      graph,
      facts: corrected.facts,
      decisions: siteState.visibilityDecisions,
      assertions: siteState.assertions,
    });
    if (!drafted.ok) {
      setCommandError(drafted.reason);
      return;
    }
    setDraft(drafted.proposal);
  };

  const runApproveApply = () => {
    if (!draft) return;
    const verdict = capabilityVerdict(draft);
    const approved = approveOwnerProposal(draft, verdict, () =>
      new Date().toISOString(),
    );
    if (!approved.ok) {
      setCommandError("Approval refused: " + approved.reason);
      return;
    }
    const applied = applyOwnerProposal(siteState, {
      ...approved.proposal,
      status: "approved",
    });
    if (!applied.ok) {
      setCommandError("Apply refused: " + applied.reason);
      return;
    }
    const withStatus: OwnerProposal = {
      ...approved.proposal,
      status: "applied",
    };
    setSiteState(applied.state);
    setJournal((j) => [...j, withStatus]);
    setDraft(null);
    setCommand("");
    say("Applied: " + applied.summary + ".");
  };

  const runReplay = () => {
    const replayed = replayOwnerJournal(emptyOwnerSiteState(spec), journal);
    const matches =
      ownerStateDigest(replayed.state) === ownerStateDigest(siteState);
    setReplayNote(
      "Replayed " +
        replayed.replayed +
        " journal entries over a fresh site (" +
        replayed.skipped +
        " skipped). " +
        (matches
          ? "The replayed site matches the live site exactly."
          : "The replayed site differs from the live site because of direct owner actions made outside the SITE tab; the journal itself replayed deterministically."),
    );
  };

  const selectedFact = facts.find((f) => f.factId === selectedFactId) ?? null;

  if (!enabled) return null;

  return (
    <section
      aria-label="Demo owner mode"
      style={{
        border: "6px solid transparent",
        borderImage: `${hazard} 1`,
        background: "#171208",
        marginTop: 16,
      }}
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
        <p style={{ ...body, margin: "12px 0 0", maxWidth: 760 }}>
          Demo seam only: no identity is verified, no session exists, no
          credential is checked. Corrections, visibility choices, and site
          commands here are recorded as owner assertions with their
          provenance, and they survive site regeneration. Nothing on this
          panel may be mistaken for production access control.
        </p>

        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setNotice(null);
              }}
              style={{
                ...btn,
                marginTop: 0,
                fontWeight: tab === t ? 800 : 400,
                background: tab === t ? "#6b5518" : "#3a2f14",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {notice && (
          <div style={{ ...panel, borderColor: "#f5c518" }}>
            <div style={body}>{notice}</div>
          </div>
        )}

        {tab === "OBJECTS" && (
          <div style={panel}>
            <div style={label}>Site facts observed by the extractor</div>
            <div style={{ ...body, marginTop: 8 }}>
              {facts.map((f) => {
                const v = resolveFactVisibility(
                  f,
                  siteState.visibilityDecisions,
                  siteState.assertions,
                );
                return (
                  <div
                    key={f.factId}
                    style={{
                      padding: "6px 0",
                      borderBottom: "1px solid #3a2f14",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{labelOf(f)}</span>
                    <span style={{ color: "#9c8a4d" }}> ({f.kind}) </span>
                    <span>{f.value}</span>
                    <span
                      style={{
                        marginLeft: 12,
                        fontSize: 12,
                        color: v.visibility === "public" ? "#7fb069" : "#d1605a",
                      }}
                    >
                      {v.visibility === "public" ? "shown" : "hidden"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "CONTENT" && (
          <div style={panel}>
            <div style={label}>Correct what the site says</div>
            <p style={{ ...body, marginTop: 8 }}>
              Select a fact, then confirm it is right, correct it, or hide
              it. Every action is recorded with who did it and when. If the
              source later changes the same fact, the conflict is shown
              here instead of silently winning or losing.
            </p>
            <div style={{ marginTop: 8 }}>
              {facts.map((f) => (
                <button
                  key={f.factId}
                  onClick={() => {
                    setSelectedFactId(f.factId);
                    setCorrectValue("");
                  }}
                  style={{
                    ...btn,
                    background:
                      selectedFactId === f.factId ? "#6b5518" : "#3a2f14",
                  }}
                >
                  {labelOf(f)}
                </button>
              ))}
            </div>
            {selectedFact && (
              <div style={{ marginTop: 12 }}>
                <div style={body}>
                  Selected: {labelOf(selectedFact)} = "{selectedFact.value}"
                </div>
                <div style={{ marginTop: 8 }}>
                  <button
                    style={btn}
                    onClick={() => recordAssertion(selectedFact, "CONFIRM")}
                  >
                    Confirm this is right
                  </button>
                  <button
                    style={btn}
                    onClick={() => recordAssertion(selectedFact, "HIDE")}
                  >
                    Hide this
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <input
                    value={correctValue}
                    onChange={(e) => setCorrectValue(e.target.value)}
                    placeholder="Corrected value"
                    style={{
                      background: "#14100a",
                      color: "#f5eeda",
                      border: "1px solid #6b5518",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 13,
                      width: 320,
                      marginRight: 8,
                    }}
                  />
                  <button
                    style={btn}
                    onClick={() =>
                      recordAssertion(selectedFact, "CORRECT", correctValue)
                    }
                  >
                    Save correction
                  </button>
                </div>
              </div>
            )}
            {corrected.conflicts.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ ...label, color: "#d1605a" }}>
                  Conflicts needing review
                </div>
                {corrected.conflicts.map((c) => (
                  <div key={c.assertionId} style={{ ...body, marginTop: 8 }}>
                    {c.factRef.objectId} : {c.factRef.field}: the source
                    changed after your correction. Source now says "
                    {c.sourceValue}"; you set "{c.ownerValue}". Your value
                    is still applied.
                  </div>
                ))}
              </div>
            )}
            {corrected.orphaned.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={label}>Kept but not applied</div>
                {corrected.orphaned.map((o) => (
                  <div key={o.assertionId} style={{ ...body, marginTop: 6 }}>
                    {o.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "VISIBILITY" && (
          <div style={panel}>
            <div style={label}>What the public site may show</div>
            <p style={{ ...body, marginTop: 8 }}>
              Hidden facts never reach the public site. Street-level
              location detail starts hidden; you can show it. The business
              name can never be hidden.
            </p>
            <div style={{ marginTop: 8 }}>
              {corrected.facts.map((f) => {
                const v = resolveFactVisibility(
                  f,
                  siteState.visibilityDecisions,
                  siteState.assertions,
                );
                return (
                  <div
                    key={f.factId}
                    style={{
                      padding: "6px 0",
                      borderBottom: "1px solid #3a2f14",
                      ...body,
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{labelOf(f)}</span>
                    <span
                      style={{
                        marginLeft: 12,
                        fontSize: 12,
                        color:
                          v.visibility === "public" ? "#7fb069" : "#d1605a",
                      }}
                    >
                      {v.visibility === "public" ? "shown" : "hidden"}
                      {" ("}
                      {v.source === "owner_override"
                        ? "your choice"
                        : v.source === "hide_assertion"
                          ? "you hid this"
                          : "default"}
                      {")"}
                    </span>
                    <span style={{ marginLeft: 12 }}>
                      <button
                        style={{ ...btn, marginTop: 0 }}
                        onClick={() => setVisibility(f, "public")}
                      >
                        Show
                      </button>
                      <button
                        style={{ ...btn, marginTop: 0 }}
                        onClick={() => setVisibility(f, "hidden")}
                      >
                        Hide
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ ...body, marginTop: 12, color: "#9c8a4d" }}>
              Public preview would show {projection.publicFacts.length} of{" "}
              {corrected.facts.length} facts; {projection.hiddenFacts.length}{" "}
              withheld.
            </div>
          </div>
        )}

        {tab === "SITE" && (
          <div style={panel}>
            <div style={label}>Change the site in plain words</div>
            <p style={{ ...body, marginTop: 8 }}>
              Type a command, review the preview, then approve and apply.
              Try: "Put emergency service first.", "Hide the team section.",
              "Feature commercial work.", "Make the phone action more
              prominent.", "Show both locations.", "Do not show my street
              address.", "Show my street address.", "Feature Alice.",
              "Remove this social link."
            </p>
            <div style={{ marginTop: 8 }}>
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Type a site command"
                style={{
                  background: "#14100a",
                  color: "#f5eeda",
                  border: "1px solid #6b5518",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 14,
                  width: "100%",
                  maxWidth: 560,
                }}
              />
              <div>
                <button style={btn} onClick={runCompile}>
                  Preview
                </button>
              </div>
            </div>
            {commandError && (
              <div style={{ ...body, marginTop: 12, color: "#d1605a" }}>
                {commandError}
              </div>
            )}
            {draft && (
              <div
                style={{
                  marginTop: 12,
                  border: "1px solid #f5c518",
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <div style={{ ...body, fontWeight: 700 }}>
                  {draft.preview.title}
                </div>
                <div style={{ ...body, marginTop: 8 }}>
                  <div style={label}>Before</div>
                  {draft.preview.before.map((b, i) => (
                    <div key={i}>{b}</div>
                  ))}
                  <div style={{ ...label, marginTop: 8 }}>After</div>
                  {draft.preview.after.map((a, i) => (
                    <div key={i}>{a}</div>
                  ))}
                </div>
                <button style={btn} onClick={runApproveApply}>
                  Approve and apply (demo)
                </button>
              </div>
            )}
            {journal.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={label}>Applied changes</div>
                {journal.map((p) => (
                  <div key={p.proposalId} style={{ ...body, marginTop: 6 }}>
                    {p.preview.title} ({p.status})
                  </div>
                ))}
                <button style={btn} onClick={runReplay}>
                  Replay journal over a fresh site
                </button>
                {replayNote && (
                  <div style={{ ...body, marginTop: 8 }}>{replayNote}</div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "ASK FYD" && (
          <div style={panel}>
            <div style={label}>Ask FYD</div>
            <p style={{ ...body, marginTop: 8 }}>
              Ask FYD answers from the same site facts and the same
              visibility policy you see in the other tabs. Corrections you
              confirm under CONTENT apply to its answers, and facts you
              hide under VISIBILITY are never used in its answers. There
              is no separate chat inside this demo panel; Ask FYD lives on
              the public site.
            </p>
          </div>
        )}

        {tab === "EVIDENCE" && (
          <div style={panel}>
            <div style={label}>Evidence: what changed, who did it, when</div>
            {siteState.assertions.length === 0 &&
              siteState.visibilityDecisions.length === 0 &&
              journal.length === 0 && (
                <div style={{ ...body, marginTop: 8 }}>
                  Nothing recorded yet. Confirm a fact, change visibility,
                  or apply a site command to see its provenance here.
                </div>
              )}
            {siteState.assertions.map((a) => (
              <div key={a.assertionId} style={{ ...body, marginTop: 8 }}>
                Correction ({a.op}): {a.factRef.objectId} : {a.factRef.field}{" "}
                by {a.provenance.owner} at {a.provenance.assertedAt}
                {a.provenance.supersedes
                  ? " (replaces an earlier correction)"
                  : ""}
              </div>
            ))}
            {siteState.visibilityDecisions.map((d, i) => (
              <div key={i} style={{ ...body, marginTop: 8 }}>
                Visibility: fact set to {d.visibility} by {d.provenance.owner}{" "}
                at {d.provenance.assertedAt}
              </div>
            ))}
            {journal.map((p) => (
              <div key={p.proposalId} style={{ ...body, marginTop: 8 }}>
                Site change: {p.preview.title} approved by{" "}
                {p.approval?.approvedBy} at {p.approval?.approvedAt} (
                {p.approval?.note})
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
