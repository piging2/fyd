"use client";

/**
 * IdentitySelector: the morning auth for the practice page.
 *
 * Selecting an identity authenticates the practice session as that PING
 * identity (httpOnly cookie, set server-side). Creating a test identity is
 * one form: name + handle + bio, and the server generates the Ed25519
 * keypair and registers the identity through the canonical path.
 *
 * The selector chooses which already-existing dev identity signs. It does
 * NOT grant capabilities. These are PING-native practice identities, never
 * Facebook accounts.
 */

import * as React from "react";
import { Check, Loader2, LogOut, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PingIdentitySummary } from "@/lib/ping/types";

interface IdentitySelectorProps {
  identities: PingIdentitySummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (identityId: string) => Promise<void>;
  onCreate: (input: { displayName: string; handle: string; bio: string }) => Promise<void>;
  onSignOut: () => Promise<void>;
  busy: boolean;
  error: string | null;
}

export function IdentitySelector({
  identities,
  activeId,
  loading,
  onSelect,
  onCreate,
  onSignOut,
  busy,
  error,
}: IdentitySelectorProps) {
  const [showForm, setShowForm] = React.useState(false);
  const [displayName, setDisplayName] = React.useState("");
  const [handle, setHandle] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-z0-9_]{2,24}$/.test(handle.trim().toLowerCase())) {
      setFormError("Handle must be 2-24 chars: lowercase letters, digits, underscore.");
      return;
    }
    if (!displayName.trim()) {
      setFormError("Display name is required.");
      return;
    }
    setFormError(null);
    await onCreate({ displayName: displayName.trim(), handle: handle.trim().toLowerCase(), bio: bio.trim() });
    setDisplayName("");
    setHandle("");
    setBio("");
    setShowForm(false);
  };

  return (
    <section aria-label="Practice identity" className="rounded-xl border border-border/40 bg-surface p-5 shadow-[--shadow-card]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-accent">Acting as</h2>
        {activeId && (
          <button
            type="button"
            onClick={onSignOut}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-accent/70 hover:bg-surface-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        )}
      </div>

      {loading ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-accent/60" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading identities
        </p>
      ) : identities.length === 0 ? (
        <p className="mt-3 text-sm text-accent/60">
          No practice identities yet. Create the first one below; it takes seconds.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2" role="list">
          {identities.map((id) => {
            const active = id.id === activeId;
            return (
              <li key={id.id}>
                <button
                  type="button"
                  onClick={() => onSelect(id.id)}
                  disabled={busy || active}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet",
                    active
                      ? "border-ping-violet bg-ping-violet/10"
                      : "border-border-soft bg-background hover:border-ping-violet/60 hover:bg-ping-violet/5",
                    busy && !active && "opacity-60",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ping-violet/15 text-xs font-bold text-ping-violet"
                  >
                    {id.displayName.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-accent">{id.displayName}</span>
                    <span className="block truncate text-xs text-accent/60">@{id.handle}</span>
                  </span>
                  {active && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-ping-violet">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Active
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4">
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New test identity
          </button>
        ) : (
          <form onSubmit={submitCreate} className="rounded-lg border border-border-soft bg-background p-4">
            <h3 className="text-sm font-semibold text-accent">Create test identity</h3>
            <p className="mt-1 text-xs text-accent/60">
              A fresh Ed25519 keypair is generated server-side and the identity is registered through the
              canonical PING path. Private keys never reach this browser.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-accent/70">Display name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Test User"
                  maxLength={60}
                  className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-accent/70">Handle</span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="test_user"
                  maxLength={24}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
                />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-xs font-medium text-accent/70">Bio</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Practicing on PING."
                maxLength={280}
                rows={2}
                className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
              />
            </label>
            {formError && (
              <p className="mt-2 text-sm text-red-700" role="alert">
                {formError}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-honey px-4 py-2 text-sm font-semibold text-honey-foreground hover:bg-honey-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Create and sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setFormError(null);
                }}
                className="rounded-lg px-4 py-2 text-sm text-accent/70 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <p className="mt-4 border-t border-border-soft pt-3 text-xs text-accent/50">
        Practice identities are PING-native dev identities. They are never Facebook accounts, and the
        selector only chooses which identity signs. It grants no capabilities.
      </p>
    </section>
  );
}
