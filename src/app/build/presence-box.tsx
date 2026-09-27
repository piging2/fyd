"use client";

/**
 * The P-01 one-box client. One URL field plus BUILD MY FYD.
 *
 * State machine (all transitions from the server poll, never timers):
 *   idle -> working -> READY | FAILED
 * While working, the label reflects the latest polled compiler state.
 */

import { useRef, useState } from "react";

type BuildState =
  | "UNKNOWN"
  | "ANALYZING"
  | "UNDERSTANDING"
  | "BUILDING"
  | "READY"
  | "FAILED";

interface PollResponse {
  ok: boolean;
  tenantId?: string;
  siteSlug?: string | null;
  siteUrl?: string | null;
  state?: BuildState;
  code?: string;
  message?: string;
  failure?: { stage: string; code: string; message: string } | null;
}

const STATE_LABEL: Record<BuildState, string> = {
  UNKNOWN: "Starting up…",
  ANALYZING: "Analyzing your website…",
  UNDERSTANDING: "Understanding your business…",
  BUILDING: "Building your presence…",
  READY: "Your presence is ready.",
  FAILED: "That build did not finish.",
};

const STATE_ORDER: BuildState[] = [
  "UNKNOWN",
  "ANALYZING",
  "UNDERSTANDING",
  "BUILDING",
  "READY",
];

export default function PresenceBox() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<"idle" | "working" | "done" | "error">("idle");
  const [state, setState] = useState<BuildState>("UNKNOWN");
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  async function poll(tenantId: string) {
    let res: Response;
    try {
      res = await fetch(`/api/fyd/presence?tenantId=${encodeURIComponent(tenantId)}`, {
        cache: "no-store",
      });
    } catch {
      return; // Network blip: keep the last real state, try again next tick.
    }
    const payload = (await res.json().catch(() => null)) as PollResponse | null;
    if (!payload || !payload.ok) return;
    const s = payload.state ?? "UNKNOWN";
    setState((prev) => {
      // States only move forward; a stale poll never rewinds the label.
      if (s === "FAILED") return s;
      return STATE_ORDER.indexOf(s) >= STATE_ORDER.indexOf(prev) ? s : prev;
    });
    if (s === "READY" && payload.siteUrl) {
      stopPolling();
      setSiteUrl(payload.siteUrl);
      setPhase("done");
    } else if (s === "FAILED") {
      stopPolling();
      setError(
        payload.failure?.message ??
          payload.message ??
          "The build stopped before your presence was ready.",
      );
      setPhase("error");
    }
  }

  async function onBuild(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || phase === "working") return;
    stopPolling();
    setPhase("working");
    setState("ANALYZING");
    setSiteUrl(null);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/fyd/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
    } catch {
      setPhase("error");
      setError("Could not reach the builder. Check your connection and try again.");
      return;
    }
    const payload = (await res.json().catch(() => null)) as PollResponse | null;
    if (!res.ok || !payload?.ok || !payload.tenantId) {
      setPhase("error");
      setError(payload?.message ?? `Build request failed (${res.status}).`);
      return;
    }
    const tenantId = payload.tenantId;
    if (payload.state) setState(payload.state);
    // Immediate first poll, then a steady cadence. Every label below
    // comes from the server checkpoint; the interval only re-asks.
    void poll(tenantId);
    pollTimer.current = setInterval(() => void poll(tenantId), 1500);
  }

  function onRetry() {
    setPhase("idle");
    setError(null);
    setState("UNKNOWN");
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Build My FYD</h1>
      <p className="mt-2 text-neutral-600">
        Paste your website URL. FYD reads the real page, understands the
        business, and builds your presence from evidence. Nothing to configure.
      </p>

      <form onSubmit={onBuild} className="mt-8">
        <label htmlFor="fyd-url" className="block text-sm font-medium">
          Website URL
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="fyd-url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.example.com"
            disabled={phase === "working"}
            className="w-full rounded border border-neutral-300 px-3 py-2 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={phase === "working" || !url.trim()}
            className="shrink-0 rounded bg-black px-5 py-2 font-medium text-white disabled:opacity-50"
          >
            {phase === "working" ? "Building…" : "Build My FYD"}
          </button>
        </div>
      </form>

      {phase === "working" && (
        <div className="mt-8 rounded border border-neutral-200 p-5" aria-live="polite">
          <div className="flex items-center gap-3">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-black"
              aria-hidden="true"
            />
            <p className="font-medium">{STATE_LABEL[state]}</p>
          </div>
          <ol className="mt-4 space-y-1 text-sm text-neutral-500">
            {(["ANALYZING", "UNDERSTANDING", "BUILDING"] as BuildState[]).map((s) => {
              const reached = STATE_ORDER.indexOf(state) >= STATE_ORDER.indexOf(s);
              return (
                <li key={s} className={reached ? "font-medium text-black" : undefined}>
                  {reached ? "●" : "○"} {STATE_LABEL[s].replace("…", "")}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {phase === "done" && siteUrl && (
        <div className="mt-8 rounded border border-green-200 bg-green-50 p-5">
          <p className="font-medium text-green-900">Your presence is ready.</p>
          <a
            href={siteUrl}
            className="mt-2 inline-block rounded bg-black px-5 py-2 font-medium text-white"
          >
            View your FYD
          </a>
        </div>
      )}

      {phase === "error" && (
        <div className="mt-8 rounded border border-red-200 bg-red-50 p-5">
          <p className="font-medium text-red-900">That did not work.</p>
          <p className="mt-1 text-sm text-red-800">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded border border-neutral-300 px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      )}
    </main>
  );
}
