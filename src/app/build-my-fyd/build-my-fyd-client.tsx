"use client";

/**
 * [Build My FYD] intake client (Track F, 2026-09-25).
 *
 * Website URL + optional socials + optional documents -> BUILD ->
 * live DISCOVER/ACQUIRE/UNDERSTAND/RESOLVE/GENERATE(+MEDIA) progress
 * streamed over SSE -> redirect to the persisted job page.
 *
 * No template/font/page choices: the owner never configures the build.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface StageEvent {
  stage: string;
  status: "ok" | "failed" | "skipped";
  detail: string;
  ms: number;
}

// Hour-10 (2026-09-30): customer-facing progress language. These label
// the true pipeline stages; no invented granularity (the pipeline has
// no distinct "finding services" / "finding locations" stages).
const STAGE_LABELS: Record<string, string> = {
  discover: "Discovering presence",
  acquire: "Reading your website",
  understand: "Understanding your business",
  resolve: "Checking facts against evidence",
  generate: "Building your FYD",
  media: "Media",
};

export default function BuildMyFydClient() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [socials, setSocials] = useState("");
  const [documents, setDocuments] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<StageEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFiles(files: FileList | null) {
    if (!files) return;
    setDocuments(Array.from(files).map((f) => f.name).slice(0, 10));
  }

  async function onBuild(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || running) return;
    setRunning(true);
    setStages([]);
    setError(null);
    try {
      const res = await fetch("/api/fyd/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          socials: socials.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
          documentNames: documents,
        }),
      });
      if (!res.ok || !res.body) {
        const payload = await res.json().catch(() => null);
        setError((payload as { error?: string } | null)?.error ?? "Build request failed (" + res.status + ").");
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const evt = JSON.parse(line.slice(6)) as
              | { type: "stage"; stage: StageEvent }
              | { type: "done"; jobId: string; ok: boolean; report?: { error?: { code: string; message: string } | null } }
              | { type: "error"; message: string };
            if (evt.type === "stage") {
              setStages((prev) => [...prev, evt.stage]);
            } else if (evt.type === "done") {
              setRunning(false);
              router.push("/build-my-fyd/" + evt.jobId);
              return;
            } else if (evt.type === "error") {
              setRunning(false);
              setError(evt.message);
              return;
            }
          }
        }
      }
      setRunning(false);
      setError("The build stream ended before completing. Try again.");
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Build My FYD</h1>
      <p className="mt-2 text-neutral-600">
        Give us your website. FYD discovers it, acquires the real page, understands the business,
        resolves it into a verified object graph, and generates your presence. No templates, no
        fonts, no page-picking.
      </p>

      <form onSubmit={onBuild} className="mt-8 space-y-6">
        <div>
          <label htmlFor="fyd-url" className="block text-sm font-medium">
            Website URL
          </label>
          <input
            id="fyd-url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.example.com"
            disabled={running}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 disabled:opacity-60"
          />
        </div>

        <div>
          <label htmlFor="fyd-socials" className="block text-sm font-medium">
            Social profiles <span className="font-normal text-neutral-500">(optional, one per line)</span>
          </label>
          <textarea
            id="fyd-socials"
            rows={3}
            value={socials}
            onChange={(e) => setSocials(e.target.value)}
            placeholder={"https://www.facebook.com/yourbusiness\nhttps://www.instagram.com/yourbusiness"}
            disabled={running}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">
            Documents <span className="font-normal text-neutral-500">(optional)</span>
          </label>
          <input
            ref={fileRef}
            type="file"
            multiple
            onChange={(e) => onFiles(e.target.files)}
            disabled={running}
            className="mt-1 block text-sm disabled:opacity-60"
          />
          {documents.length > 0 && (
            <p className="mt-1 text-xs text-neutral-500">
              Recorded at intake: {documents.join(", ")}. Document parsing is not wired in this
              build; the build uses your website and socials only.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={running || !url.trim()}
          className="rounded bg-black px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {running ? "Building..." : "Build my FYD"}
        </button>
      </form>

      {stages.length > 0 && (
        <section className="mt-8 rounded border border-neutral-200 p-4" aria-live="polite">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Build progress</h2>
          <ul className="mt-3 space-y-2">
            {stages.map((s, i) => (
              <li key={i} className="text-sm">
                <span className="font-mono font-semibold">{STAGE_LABELS[s.stage] ?? s.stage}</span>{" "}
                <span
                  className={
                    s.status === "ok"
                      ? "text-green-700"
                      : s.status === "skipped"
                        ? "text-amber-700"
                        : "text-red-700"
                  }
                >
                  {s.status}
                </span>{" "}
                <span className="text-neutral-500">({s.ms}ms)</span>
                <p className="text-neutral-600">{s.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <div role="alert" className="mt-8 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Build failed</p>
          <p className="mt-1">{error}</p>
        </div>
      )}
    </main>
  );
}
