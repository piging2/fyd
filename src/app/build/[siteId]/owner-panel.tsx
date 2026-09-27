"use client";

/**
 * OwnerPanel: the one owner control for /build/[siteId].
 *
 * [ Customize with FYD ] -> conversational panel -> typed patch ->
 * validation -> preview -> Apply -> persists. The full loop the product
 * law requires, wired to the digest-bound overrides route:
 * propose (preview only, never writes) -> approve (echoes baseStateDigest,
 * baseViewDigest, patchDigest; 409 STALE PROPOSAL when either base moved)
 * -> receipt. Revert runs through the same propose/approve loop.
 *
 * The DEMO OWNER CONTEXT banner is always visible while the panel is open:
 * mutations run as a seeded demo actor, no owner identity is verified.
 */

import { useState } from "react";
import type { OwnerCommand } from "@/fyd/object/types";
import type { RenderViewerKind } from "@/fyd/sitespec/render-projection";

/**
 * LANE-8: the ONE owner affordance. The owner projection is the visitor
 * page plus exactly one "Customize with FYD" entry point. Lane 9 builds
 * the conversational UX behind it; this component only reserves the
 * entry point with an honest placeholder. The full conversational and
 * digest machinery in OwnerPanel below is engineer-only.
 */
export function OwnerEntryPoint() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 min-h-[44px] rounded-full px-6 py-3 text-base font-semibold shadow-lg"
        style={{ background: "#1a1a2e", color: "#fff" }}
        aria-label="Customize with FYD"
      >
        Customize with FYD
      </button>
    );
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Customize with FYD"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-neutral-900">Customize with FYD</h2>
        <p className="mt-3 text-sm text-neutral-700">
          The conversational customizer is being built in the next lane.
          This button reserves its entry point.
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-4 min-h-[44px] rounded bg-neutral-900 px-6 py-2 font-semibold text-white"
        >
          Close
        </button>
      </div>
    </div>
  );
}

type Phase = "idle" | "proposing" | "proposed" | "approving" | "applied" | "failed";

interface ProposalData {
  command: OwnerCommand;
  summary: string;
  before: string;
  after: string;
  evidenceImpact: string;
  capabilityImpact: string;
  baseStateDigest: string;
  baseViewDigest: string;
  patchDigest: string;
  actorDisclosure: string;
}

interface Receipt {
  eventId: string | null;
  resultDigest: string;
  approvedAt: string;
  appliedPhone: string | null;
  appliedField: string | null;
}

function shortDigest(d: string): string {
  return d.length > 12 ? d.slice(0, 12) + "..." : d;
}

export function OwnerPanel({
  siteId,
  viewerKind,
}: {
  siteId: string;
  /**
   * LANE-8: when "engineer", the panel also shows the raw proposal
   * digests, event ids, and approval timestamps. Owner and other viewers
   * see the conversational flow only.
   */
  viewerKind?: RenderViewerKind;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [failure, setFailure] = useState<{ code?: string; message: string; stale: boolean } | null>(null);

  const endpoint = "/api/fyd/objects/" + encodeURIComponent(siteId) + "/overrides";
  const busy = phase === "proposing" || phase === "approving";

  async function post(body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }
    return { status: res.status, data };
  }

  async function onPropose(requestText: string) {
    const t = requestText.trim();
    if (!t || busy) return;
    setPhase("proposing");
    setFailure(null);
    setReceipt(null);
    const { status, data } = await post({ stage: "propose", text: t });
    if (status !== 200 || data.ok !== true) {
      setPhase("failed");
      setFailure({
        code: typeof data.code === "string" ? data.code : undefined,
        message:
          typeof data.error === "string"
            ? data.error + (typeof data.hint === "string" ? " " + data.hint : "")
            : "The proposal could not be understood. Please try again.",
        stale: false,
      });
      return;
    }
    const p = data.proposal as { command: OwnerCommand; summary: string };
    const preview = data.preview as {
      before: string;
      after: string;
      evidenceImpact: string;
      capabilityImpact: string;
    };
    const digests = data.digests as { baseStateDigest: string; baseViewDigest: string; patchDigest: string };
    setProposal({
      command: p.command,
      summary: p.summary,
      before: preview.before,
      after: preview.after,
      evidenceImpact: preview.evidenceImpact,
      capabilityImpact: preview.capabilityImpact,
      baseStateDigest: digests.baseStateDigest,
      baseViewDigest: digests.baseViewDigest,
      patchDigest: digests.patchDigest,
      actorDisclosure: typeof data.actorDisclosure === "string" ? data.actorDisclosure : "",
    });
    setPhase("proposed");
  }

  async function onApprove() {
    if (!proposal || busy) return;
    setPhase("approving");
    setFailure(null);
    const { status, data } = await post({
      stage: "approve",
      command: proposal.command,
      baseStateDigest: proposal.baseStateDigest,
      baseViewDigest: proposal.baseViewDigest,
      patchDigest: proposal.patchDigest,
    });
    if (status !== 200 || data.ok !== true) {
      const stale = data.code === "stale_proposal";
      setPhase("failed");
      setFailure({
        code: typeof data.code === "string" ? data.code : undefined,
        message: typeof data.error === "string" ? data.error : "The approval was refused. Nothing was written.",
        stale,
      });
      return;
    }
    const approval = data.approval as {
      eventId: string | null;
      resultDigest: string;
      approvedAt: string;
    };
    const view = data.view as { contact?: { phone?: string | null } } | undefined;
    const cmd = proposal.command as { field?: string };
    setReceipt({
      eventId: approval.eventId,
      resultDigest: approval.resultDigest,
      approvedAt: approval.approvedAt,
      appliedPhone: view?.contact?.phone ?? null,
      appliedField: typeof cmd.field === "string" ? cmd.field : null,
    });
    setProposal(null);
    setPhase("applied");
  }

  function onRevert() {
    if (!receipt?.appliedField) return;
    const revertText = "Revert " + receipt.appliedField + " correction";
    setText(revertText);
    setReceipt(null);
    setPhase("idle");
    void onPropose(revertText);
  }

  function reset() {
    setPhase("idle");
    setProposal(null);
    setReceipt(null);
    setFailure(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 min-h-[44px] rounded-full px-6 py-3 text-base font-semibold shadow-lg"
        style={{ background: "#1a1a2e", color: "#fff" }}
        aria-label="Customize with FYD"
      >
        Customize with FYD
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Customize with FYD"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) setOpen(false);
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold text-neutral-900">Customize with FYD</h2>
          <button
            type="button"
            onClick={() => !busy && setOpen(false)}
            disabled={busy}
            className="min-h-[44px] min-w-[44px] rounded px-2 text-2xl text-neutral-500 disabled:opacity-50"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          DEMO OWNER CONTEXT: changes here run as a seeded demo actor. No owner
          identity was verified. Not a production owner API.
        </p>

        {phase === "idle" || phase === "proposing" ? (
          <div className="mt-4">
            <label htmlFor="owner-panel-text" className="text-sm font-medium text-neutral-700">
              Describe the change in plain language
            </label>
            <textarea
              id="owner-panel-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={3}
              maxLength={2000}
              placeholder="Correct phone to +1 541 555 0123"
              className="mt-1 min-h-[44px] w-full rounded border border-neutral-300 px-3 py-2 text-base text-neutral-900 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void onPropose(text)}
              disabled={busy || text.trim().length === 0}
              className="mt-3 min-h-[44px] rounded bg-neutral-900 px-6 py-2 font-semibold text-white disabled:opacity-50"
            >
              {phase === "proposing" ? "Reading your request..." : "Preview the change"}
            </button>
            <p className="mt-2 text-xs text-neutral-500">
              Preview only: nothing is written until you review and approve.
            </p>
          </div>
        ) : null}

        {phase === "proposed" && proposal ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-neutral-700">{proposal.actorDisclosure}</p>
            <div className="rounded border border-neutral-200 p-4">
              <p className="font-medium text-neutral-900">{proposal.summary}</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="font-medium text-neutral-600">Before</dt>
                  <dd className="text-neutral-900">{proposal.before}</dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-600">After</dt>
                  <dd className="text-neutral-900">{proposal.after}</dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-600">Evidence impact</dt>
                  <dd className="text-neutral-900">{proposal.evidenceImpact}</dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-600">Capability</dt>
                  <dd className="text-neutral-900">{proposal.capabilityImpact}</dd>
                </div>
              </dl>
              {viewerKind === "engineer" ? (
                <p className="mt-3 font-mono text-xs text-neutral-500">
                  base state {shortDigest(proposal.baseStateDigest)} · base view{" "}
                  {shortDigest(proposal.baseViewDigest)} · patch {shortDigest(proposal.patchDigest)}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void onApprove()}
                disabled={busy}
                className="min-h-[44px] rounded bg-green-700 px-6 py-2 font-semibold text-white disabled:opacity-50"
              >
                Approve and apply
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="min-h-[44px] rounded border border-neutral-300 px-6 py-2 font-semibold text-neutral-700 disabled:opacity-50"
              >
                Discard
              </button>
            </div>
          </div>
        ) : null}

        {phase === "approving" ? (
          <p className="mt-4 text-sm text-neutral-700">Applying your approved change...</p>
        ) : null}

        {phase === "applied" && receipt ? (
          <div className="mt-4 space-y-3">
            <p className="rounded bg-green-50 px-3 py-2 text-sm font-medium text-green-900">
              Applied. {receipt.appliedPhone ? "The phone now reads " + receipt.appliedPhone + "." : ""}
            </p>
            {viewerKind === "engineer" ? (
              <p className="font-mono text-xs text-neutral-500">
                event {receipt.eventId ?? "n/a"} · result {shortDigest(receipt.resultDigest)} ·{" "}
                {receipt.approvedAt}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {receipt.appliedField ? (
                <button
                  type="button"
                  onClick={onRevert}
                  disabled={busy}
                  className="min-h-[44px] rounded border border-neutral-300 px-6 py-2 font-semibold text-neutral-700 disabled:opacity-50"
                >
                  Revert this change
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-[44px] rounded bg-neutral-900 px-6 py-2 font-semibold text-white"
              >
                Reload page to see it
              </button>
              <button
                type="button"
                onClick={reset}
                className="min-h-[44px] rounded px-4 py-2 text-sm font-medium text-neutral-600"
              >
                Make another change
              </button>
            </div>
          </div>
        ) : null}

        {phase === "failed" && failure ? (
          <div className="mt-4 space-y-3">
            <p className="rounded bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
              {failure.stale ? "STALE PROPOSAL. " : ""}
              {failure.message}
            </p>
            {failure.code ? (
              <p className="font-mono text-xs text-neutral-500">code: {failure.code}</p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {failure.stale ? (
                <button
                  type="button"
                  onClick={() => void onPropose(text)}
                  disabled={busy || text.trim().length === 0}
                  className="min-h-[44px] rounded bg-neutral-900 px-6 py-2 font-semibold text-white disabled:opacity-50"
                >
                  Draft a fresh proposal
                </button>
              ) : null}
              <button
                type="button"
                onClick={reset}
                className="min-h-[44px] rounded border border-neutral-300 px-6 py-2 font-semibold text-neutral-700"
              >
                Start over
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
