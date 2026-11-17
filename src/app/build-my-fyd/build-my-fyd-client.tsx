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

import { useEffect, useRef, useState } from "react";
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
  const [docNotice, setDocNotice] = useState("");
  const [docFocusTarget, setDocFocusTarget] = useState<number | null>(null);
  const docListRef = useRef<HTMLUListElement>(null);
  const [running, setRunning] = useState(false);
  const [openingReport, setOpeningReport] = useState(false);
  const [stages, setStages] = useState<StageEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const buildInFlight = useRef(false);
  const busy = running || openingReport;
  const lastStage = stages.at(-1);

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files
      ? Array.from(e.target.files).map((f) => f.name)
      : [];
    e.target.value = "";
    if (picked.length === 0) return;
    const merged = [...documents, ...picked];
    if (merged.length > 10) {
      setDocNotice(
        `Only the first 10 filenames are recorded. ${merged.length - 10} ${
          merged.length - 10 === 1 ? "name was" : "names were"
        } not added.`
      );
      setDocuments(merged.slice(0, 10));
    } else {
      setDocNotice("");
      setDocuments(merged);
    }
  }

  function removeDocument(index: number) {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
    setDocFocusTarget(index);
  }

  // After a removal, focus lands on the remove control that took the
  // removed item's place (or the previous one, or the file input when
  // the list empties), so a keyboard user never loses their position.
  useEffect(() => {
    if (docFocusTarget === null) return;
    const buttons = docListRef.current?.querySelectorAll("button");
    if (buttons && buttons.length > 0) {
      buttons[Math.min(docFocusTarget, buttons.length - 1)].focus();
    } else {
      document.getElementById("fyd-documents")?.focus();
    }
    setDocFocusTarget(null);
  }, [docFocusTarget, documents]);

  async function onBuild(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || buildInFlight.current || openingReport) return;
    buildInFlight.current = true;
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
              setOpeningReport(true);
              router.push("/build-my-fyd/" + evt.jobId);
              return;
            } else if (evt.type === "error") {
              setError(evt.message);
              return;
            }
          }
        }
      }
      setError("The build stream ended before completing. Try again.");
    } catch (err) {
      setOpeningReport(false);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      buildInFlight.current = false;
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Build My FYD</h1>
      <p className="mt-2 text-neutral-600">
        FYD uses your public website and any social profiles you include to build a preview of
        your business presence. You can review the build report when it finishes.
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
            disabled={busy}
            className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-base disabled:opacity-60"
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
            disabled={busy}
            className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-base disabled:opacity-60"
          />
        </div>

        <div>
          <label htmlFor="fyd-documents" className="block text-sm font-medium">
            Documents <span className="font-normal text-neutral-500">(optional)</span>
          </label>
          <p id="fyd-documents-help" className="mt-1 text-sm text-text-muted">
            FYD records selected filenames. This build uses your website and socials only.
          </p>
          <input
            id="fyd-documents"
            aria-describedby="fyd-documents-help"
            type="file"
            multiple
            onChange={onFiles}
            disabled={busy}
            className="mt-1 block w-full min-w-0 text-sm disabled:opacity-60"
          />
          {documents.length > 0 && (
            <div className="mt-2">
              <p className="text-sm text-text-muted">
                {documents.length} of 10 filenames selected. Picking more
                files adds to this list.
              </p>
              <ul
                ref={docListRef}
                aria-label="Selected filenames"
                className="mt-2 flex flex-wrap gap-2"
              >
                {documents.map((name, i) => (
                  <li
                    key={`${i}-${name}`}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background py-1 pl-3 pr-1 text-sm"
                  >
                    <span className="min-w-0 break-all">{name}</span>
                    <button
                      type="button"
                      onClick={() => removeDocument(i)}
                      disabled={busy}
                      aria-label={`Remove ${name}`}
                      className="inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-text disabled:opacity-50"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {docNotice && (
            <p role="status" className="mt-2 text-sm text-text-muted">
              {docNotice}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-full bg-honey px-5 font-semibold text-honey-foreground transition-colors hover:bg-honey-hover disabled:opacity-50"
        >
          Build a FYD site
        </button>
      </form>

      <p role="status" className="mt-3 min-h-5 text-sm text-text-muted">
        {openingReport
          ? "Opening the build report…"
          : running && (lastStage
            ? `${STAGE_LABELS[lastStage.stage] ?? lastStage.stage} · ${lastStage.status === "ok" ? "complete" : lastStage.status}`
            : "Starting build…")}
      </p>

      {stages.length > 0 && (
        <section className="mt-5 rounded border border-neutral-200 p-4">
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
    </div>
  );
}
