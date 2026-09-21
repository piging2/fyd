"use client";

/**
 * BioEditor: inline bio editing for the active identity only.
 * Save goes through PATCH /api/practice/bio, which persists through the
 * canonical object path (OBJECT_UPDATED). Escape cancels, errors show
 * inline, and the displayed bio only changes after the server confirms.
 */

import * as React from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";

interface BioEditorProps {
  bio: string;
  onSave: (bio: string) => Promise<void>;
  saving: boolean;
  error: string | null;
  onClearError: () => void;
}

export function BioEditor({ bio, onSave, saving, error, onClearError }: BioEditorProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(bio);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!editing) setDraft(bio);
  }, [bio, editing]);

  React.useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const save = async () => {
    await onSave(draft.trim());
    setEditing(false);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(bio);
    onClearError();
  };

  if (!editing) {
    return (
      <div className="mt-4 rounded-xl border border-border/40 bg-surface p-4 shadow-[--shadow-card]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-accent/50">Bio</h3>
            {bio ? (
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-accent/90">{bio}</p>
            ) : (
              <p className="mt-1 text-sm italic text-accent/50">No bio yet.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-soft px-3 py-1.5 text-sm text-accent/80 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit bio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-ping-violet/40 bg-surface p-4 shadow-[--shadow-card]">
      <label htmlFor="bio-draft" className="text-xs font-semibold uppercase tracking-wide text-accent/50">
        Edit bio
      </label>
      <textarea
        id="bio-draft"
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
        rows={3}
        maxLength={280}
        placeholder="Tell the practice network who you are."
        className="mt-2 w-full rounded-lg border border-border-soft bg-background px-3 py-2 text-sm text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
      />
      <p className="mt-1 text-xs text-accent/50">{draft.length}/280. Escape cancels.</p>
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-honey px-4 py-2 text-sm font-semibold text-honey-foreground hover:bg-honey-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          Save bio
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-accent/70 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Cancel
        </button>
      </div>
    </div>
  );
}
