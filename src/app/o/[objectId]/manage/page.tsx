/**
 * Object Manage (demo).
 *
 * Simple owner backend: Overview, Content, Services, Media, Contact,
 * Appearance, Ask FYD, Connections, History. Human language everywhere;
 * no graph machinery is exposed.
 *
 * +--------------------------------------------------------------+
 * |  DEV / DEMO. Simulated owner session. NOT production auth.   |
 * |  Real owner authentication is a separate gate.               |
 * +--------------------------------------------------------------+
 *
 * Every change posts an OwnerCommand to the overrides API and re-reads
 * the public ObjectView, so the owner sees exactly what the public
 * Circle and Node will show. Changes persist to the owner store and
 * survive reload and source re-ingest.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Eye, EyeOff, Plus } from "lucide-react";
import { ObjectCircle } from "@/fyd/ui/object-circle";
import type { ObjectView, OwnerCommand } from "@/fyd/object/types";

type Status = "loading" | "ready" | "error";

interface HistoryEntry {
  at: string;
  text: string;
}

interface Proposal {
  command: OwnerCommand;
  summary: string;
}

function humanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold text-stone-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function ManagePage({ params }: { params: Promise<{ objectId: string }> }) {
  const [objectId, setObjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [view, setView] = useState<ObjectView | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newService, setNewService] = useState("");
  const [command, setCommand] = useState("");
  const [commandNote, setCommandNote] = useState("");
  const [pendingProposal, setPendingProposal] = useState<Proposal | null>(null);

  useEffect(() => {
    void params.then((p) => setObjectId(p.objectId));
  }, [params]);

  const load = useCallback(async (id: string) => {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/fyd/objects/" + encodeURIComponent(id));
      const json = (await res.json()) as {
        ok: boolean;
        view?: ObjectView;
        history?: HistoryEntry[];
        error?: string;
      };
      if (!res.ok || !json.ok || !json.view) {
        setStatus("error");
        setError(json.error ?? "Object not found.");
        return;
      }
      setView(json.view);
      // Owner history is durable in the owner store; seed it from the server
      // so it survives reload, not just this browser session.
      setHistory(json.history ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
      setError("Could not load the object.");
    }
  }, []);

  useEffect(() => {
    if (objectId) void load(objectId);
  }, [objectId, load]);

  /**
   * Applies a typed OwnerCommand through the approve stage. Direct buttons
   * are unambiguous owner intent; free text always goes through propose
   * first (see runCommand).
   */
  async function send(cmd: OwnerCommand, note: string): Promise<boolean> {
    if (!objectId || busy) return false;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/fyd/objects/" + encodeURIComponent(objectId) + "/overrides", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: "approve", command: cmd }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        view?: ObjectView;
        history?: HistoryEntry[];
        error?: string;
      };
      if (!res.ok || !json.ok || !json.view) {
        setError(json.error ?? "Could not apply the change.");
        return false;
      }
      setView(json.view);
      if (json.history) setHistory(json.history);
      else setHistory((h) => [...h, { at: new Date().toISOString(), text: note }]);
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Free-text owner intent: PROPOSE first, never mutate. The server returns
   * a typed proposal; the owner approves or rejects it below. Nothing is
   * written until Approve.
   */
  async function runCommand() {
    const raw = command.trim();
    if (!raw || !objectId || busy) return;
    setBusy(true);
    setError("");
    setCommandNote("");
    setPendingProposal(null);
    try {
      const res = await fetch("/api/fyd/objects/" + encodeURIComponent(objectId) + "/overrides", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: "propose", text: raw }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        proposal?: Proposal;
        error?: string;
        hint?: string;
      };
      if (!res.ok || !json.ok || !json.proposal) {
        setCommandNote((json.error ?? "Could not understand that.") + (json.hint ? " " + json.hint : ""));
        return;
      }
      setPendingProposal(json.proposal);
    } catch {
      setCommandNote("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function approveProposal() {
    if (!pendingProposal) return;
    const ok = await send(pendingProposal.command, pendingProposal.summary);
    if (ok) {
      setPendingProposal(null);
      setCommand("");
      setCommandNote("Done. The public page and Circle now show the change.");
    }
  }

  function rejectProposal() {
    setPendingProposal(null);
    setCommandNote("Proposal rejected. Nothing changed.");
  }

  if (status === "loading" || !view) {
    return (
      <div className="min-h-screen bg-stone-100 p-8">
        <p className="text-stone-500" role="status">
          {status === "error" ? error : "Loading..."}
        </p>
      </div>
    );
  }

  const needsAttention: string[] = [];
  if (!view.media.some((m) => m.role === "logo")) needsAttention.push("No logo photo yet. Add one under Media.");
  if (view.services.length === 0)
    needsAttention.push("No services on record yet. Ask the business what it offers and add them below.");
  if (!view.contact.phone) needsAttention.push("No phone number on record, so visitors cannot call.");

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <div className="border-b-4 border-amber-500 bg-amber-50">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6">
          <p className="text-sm font-bold text-amber-900">
            DEV / DEMO. Simulated owner session. This is not production authentication.
          </p>
          <p className="text-xs text-amber-800">
            Changes here write to a local demo store so the proof loop can be verified end to end.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">Manage {view.name}</h1>
            <p className="text-sm text-stone-500">Ask FYD to change anything below.</p>
          </div>
          <Link
            href={"/o/" + encodeURIComponent(view.id)}
            className="shrink-0 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium hover:bg-stone-50"
          >
            View public page
          </Link>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <Section title="Overview">
          <div className="max-w-sm">
            <ObjectCircle view={view} />
          </div>
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex gap-2">
              <dt className="font-medium text-stone-500">Information freshness</dt>
              <dd>{view.provenance.label}; observed {view.provenance.derivedAt.slice(0, 10)}.</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-stone-500">Website</dt>
              <dd>{view.contact.website ? "connected" : "not on record"}</dd>
            </div>
          </dl>
          {needsAttention.length > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-900">Needs attention</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-800">
                {needsAttention.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="Ask FYD">
          <p className="text-sm text-stone-500">
            Tell FYD what to change in plain language. FYD proposes the exact
            change first; nothing applies until you approve it.
          </p>
          <form
            className="mt-3 flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void runCommand();
            }}
          >
            <label htmlFor="manage-command" className="sr-only">
              Tell FYD what to change
            </label>
            <input
              id="manage-command"
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder='Try: "Put decks first"'
              disabled={busy}
              className="min-h-[44px] flex-1 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            />
            <button
              type="submit"
              disabled={busy || command.trim().length === 0}
              className="min-h-[44px] rounded-lg bg-amber-700 px-6 py-2.5 font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              Propose
            </button>
          </form>
          {pendingProposal && (
            <div
              role="group"
              aria-label="Proposed change"
              className="mt-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-4"
            >
              <p className="text-sm font-bold text-amber-900">Proposed change</p>
              <p className="mt-1 text-sm text-stone-700">{pendingProposal.summary}</p>
              <p className="mt-1 text-xs text-stone-500">
                Nothing has changed yet. Approve to apply it to the public page and Circle.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void approveProposal()}
                  disabled={busy}
                  className="min-h-[44px] rounded-lg bg-amber-700 px-6 py-2 font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={rejectProposal}
                  disabled={busy}
                  className="min-h-[44px] rounded-lg border border-stone-300 bg-white px-6 py-2 font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
          {commandNote && <p className="mt-2 text-sm text-stone-600">{commandNote}</p>}
        </Section>

        <Section title="Content">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-stone-500">Business name</dt>
              <dd className="text-base font-semibold">{view.name}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-500">Description</dt>
              <dd className="text-base leading-relaxed">{view.summary}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-500">Service area</dt>
              <dd>{view.serviceArea.join(", ") || "Not on record"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-stone-400">
            Read from the business website ({view.provenance.derivedAt.slice(0, 10)}). Name and
            description edits are not in this demo yet.
          </p>
        </Section>

        <Section title="Services">
          <ul className="space-y-2">
            {view.services.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2"
              >
                <span className={"flex-1 text-base font-medium " + (s.visible ? "" : "text-stone-400 line-through")}>
                  {s.name}
                </span>
                <span className="hidden text-xs text-stone-400 sm:inline" title={s.basisLabel}>
                  {s.basis === "owner" ? "owner" : "record"}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    title="Move to top"
                    aria-label={"Move " + s.name + " to top"}
                    disabled={busy}
                    onClick={() => void send({ type: "move-service", id: s.id, to: "first" }, "Moved " + s.name + " to the top.")}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg hover:bg-stone-200 disabled:opacity-40"
                  >
                    <ChevronsUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="Move up"
                    aria-label={"Move " + s.name + " up"}
                    disabled={busy}
                    onClick={() => void send({ type: "move-service", id: s.id, to: "up" }, "Moved " + s.name + " up.")}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg hover:bg-stone-200 disabled:opacity-40"
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="Move down"
                    aria-label={"Move " + s.name + " down"}
                    disabled={busy}
                    onClick={() => void send({ type: "move-service", id: s.id, to: "down" }, "Moved " + s.name + " down.")}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg hover:bg-stone-200 disabled:opacity-40"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="Move to bottom"
                    aria-label={"Move " + s.name + " to bottom"}
                    disabled={busy}
                    onClick={() => void send({ type: "move-service", id: s.id, to: "last" }, "Moved " + s.name + " to the bottom.")}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg hover:bg-stone-200 disabled:opacity-40"
                  >
                    <ChevronsDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title={s.visible ? "Hide" : "Show"}
                    aria-label={(s.visible ? "Hide " : "Show ") + s.name}
                    aria-pressed={!s.visible}
                    disabled={busy}
                    onClick={() => void send({ type: "set-service-visibility", id: s.id, visible: !s.visible }, (s.visible ? "Hid " : "Showed ") + s.name + ".")}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg hover:bg-stone-200 disabled:opacity-40"
                  >
                    {s.visible ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newService.trim();
              if (!name) return;
              void send({ type: "add-service", name }, "Added " + name + ".").then((ok) => {
                if (ok) setNewService("");
              });
            }}
          >
            <label htmlFor="add-service" className="sr-only">
              Add a service
            </label>
            <input
              id="add-service"
              type="text"
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
              placeholder="Add a service"
              disabled={busy}
              maxLength={60}
              className="min-h-[44px] flex-1 rounded-lg border border-stone-300 px-4 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            />
            <button
              type="submit"
              disabled={busy || newService.trim().length === 0}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-stone-300 px-4 py-2.5 font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add service
            </button>
          </form>
        </Section>

        <Section title="Media">
          {view.media.length === 0 ? (
            <p className="text-sm text-stone-500">
              No authorized photos yet. Only photos FYD is permitted to use appear on the public
              page; other images found on the site are referenced, not displayed.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {view.media.map((m) => (
                <li key={m.id} className="overflow-hidden rounded-xl border border-stone-200">
                  <img src={m.src} alt={m.alt} loading="lazy" className="h-28 w-full object-cover" />
                  <p className="px-2 py-1.5 text-xs capitalize text-stone-500">{m.role}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Contact">
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="font-medium text-stone-500">Phone</dt>
              <dd>{view.contact.phone ?? "Not on record"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="font-medium text-stone-500">Email</dt>
              <dd className="break-all">{view.contact.email ?? "Not on record"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="font-medium text-stone-500">Website</dt>
              <dd className="break-all">{view.contact.website ?? "Not on record"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="font-medium text-stone-500">Location visibility</dt>
              <dd>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={view.contact.addressVisibility === "hidden"}
                  onClick={() =>
                    void send(
                      {
                        type: "set-address-visibility",
                        visibility: view.contact.addressVisibility === "hidden" ? "public" : "hidden",
                      },
                      view.contact.addressVisibility === "hidden"
                        ? "Made the location public."
                        : "Hid the location.",
                    )
                  }
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
                >
                  {view.contact.addressVisibility === "hidden" ? (
                    <>
                      <EyeOff className="h-4 w-4" aria-hidden="true" /> Hidden
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" aria-hidden="true" /> Public
                    </>
                  )}
                </button>
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-stone-400">
            The location shown publicly is the coarse "{view.contact.locality ?? "unknown"}" from the
            site. You decide whether visitors see it.
          </p>
        </Section>

        <Section title="Appearance">
          <p className="text-sm text-stone-500">
            Style, typography, and section order are proposed through Ask FYD in the full product.
            In this demo, describe the change in the Ask FYD box above (for example, "Put decks
            first"): FYD proposes the exact change and applies it when you approve.
          </p>
        </Section>

        <Section title="Connections">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-3">
              <span>Website</span>
              <span className="font-medium text-emerald-700">
                {view.contact.website ? "Connected" : "Not connected"}
              </span>
            </li>
            {["Facebook", "ActivityPub", "ATProto", "Nostr"].map((n) => (
              <li key={n} className="flex justify-between gap-3 text-stone-500">
                <span>{n}</span>
                <span>Not yet</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="History">
          {history.length === 0 ? (
            <p className="text-sm text-stone-500">
              Nothing changed yet. Website information was last observed{" "}
              {view.provenance.derivedAt.slice(0, 10)}.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {history.map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 font-medium text-stone-400">{humanDate(h.at)}</span>
                  <span>{h.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </main>
    </div>
  );
}
