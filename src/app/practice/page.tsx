"use client";

/**
 * /practice: the PING Social practice page.
 *
 * Morning flow: pick a dev identity (or create one in seconds), see your
 * PING Circle, follow test users, like posts, edit your bio, multi-select
 * with ctrl+A and follow everyone at once.
 *
 * Every piece of data comes from the server-side BFF (/api/practice/*),
 * which reads the PING gateway through the PingObjectReader adapter. A hard
 * refresh reconstructs everything from the server; React holds no truth.
 * When the gateway path is not ready yet, sections render honest ERROR
 * states with retry instead of fake data.
 */

import * as React from "react";
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PingIdentitySummary,
  PingPost,
  PracticeApiError,
  PublicCircleProjection,
} from "@/lib/ping/types";
import { PingCircle } from "@/components/ping/ping-circle";
import { IdentitySelector } from "@/components/ping/identity-selector";
import { TestUserCard } from "@/components/ping/test-user-card";
import { PostCard } from "@/components/ping/post-card";
import { BioEditor } from "@/components/ping/bio-editor";
import { SelectionBar, type BulkFollowResult } from "@/components/ping/selection-bar";

class PracticeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: PracticeApiError } | null)?.error;
    throw new PracticeError(err?.code ?? "REQUEST_FAILED", err?.message ?? `Request failed (HTTP ${res.status}).`);
  }
  return data as T;
}

type PageStatus = "loading" | "ready" | "error";

const selKey = (kind: "identity" | "post", id: string) => `${kind}:${id}`;

export default function PracticePage() {
  const [status, setStatus] = React.useState<PageStatus>("loading");
  const [pageError, setPageError] = React.useState<PracticeError | null>(null);

  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessionIdentity, setSessionIdentity] = React.useState<PingIdentitySummary | null>(null);
  const [identities, setIdentities] = React.useState<PingIdentitySummary[]>([]);
  const [profile, setProfile] = React.useState<PublicCircleProjection | null>(null);
  const [feed, setFeed] = React.useState<PingPost[]>([]);

  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [followPending, setFollowPending] = React.useState<Set<string>>(new Set());
  const [likePending, setLikePending] = React.useState<Set<string>>(new Set());
  const [bioSaving, setBioSaving] = React.useState(false);
  const [bioError, setBioError] = React.useState<string | null>(null);

  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = React.useState(false);
  const [bulkResult, setBulkResult] = React.useState<BulkFollowResult | null>(null);

  React.useEffect(() => {
    document.title = "PING Practice";
  }, []);

  const refresh = React.useCallback(async () => {
    setStatus((s) => (s === "ready" ? s : "loading"));
    setPageError(null);
    setActionError(null);
    try {
      const session = await api<{ identityId: string | null; identity: PingIdentitySummary | null }>("/api/practice/session");
      const list = await api<{ identities: PingIdentitySummary[] }>("/api/practice/identities");
      setSessionId(session.identityId);
      setSessionIdentity(session.identity);
      setIdentities(list.identities);
      if (session.identityId) {
        const [p, f] = await Promise.all([
          api<{ profile: PublicCircleProjection }>(`/api/practice/profile?identityId=${encodeURIComponent(session.identityId)}`),
          api<{ posts: PingPost[] }>(`/api/practice/feed?identityId=${encodeURIComponent(session.identityId)}`),
        ]);
        setProfile(p.profile);
        setFeed(f.posts);
      } else {
        setProfile(null);
        setFeed([]);
      }
      setStatus("ready");
    } catch (err) {
      setPageError(err instanceof PracticeError ? err : new PracticeError("REQUEST_FAILED", "Could not reach the practice BFF."));
      setStatus("error");
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  // -- selection: ctrl/cmd+A selects all cards, Escape clears --------------
  const selectAll = React.useCallback(() => {
    const next = new Set<string>();
    for (const i of identities) next.add(selKey("identity", i.id));
    for (const p of feed) next.add(selKey("post", p.id));
    setSelection(next);
    setBulkResult(null);
  }, [identities, feed]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && !inField) {
        e.preventDefault();
        selectAll();
      } else if (e.key === "Escape" && !inField) {
        setSelection(new Set());
        setBulkResult(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectAll]);

  const toggleSelect = React.useCallback((kind: "identity" | "post", id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      const k = selKey(kind, id);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setBulkResult(null);
  }, []);

  const selectedIdentityIds = React.useMemo(
    () => [...selection].filter((k) => k.startsWith("identity:")).map((k) => k.slice("identity:".length)),
    [selection],
  );
  const selectedPostCount = React.useMemo(() => [...selection].filter((k) => k.startsWith("post:")).length, [selection]);

  // -- actions: everything goes through the BFF, then refresh ---------------
  const runAction = React.useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setActionError(null);
      try {
        await fn();
        await refresh();
      } catch (err) {
        setActionError(err instanceof PracticeError ? err.message : "Action failed.");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleSelectIdentity = (identityId: string) =>
    runAction(async () => {
      await api("/api/practice/session", { method: "POST", body: JSON.stringify({ identityId }) });
    });

  const handleCreateIdentity = (input: { displayName: string; handle: string; bio: string }) =>
    runAction(async () => {
      await api("/api/practice/identities", { method: "POST", body: JSON.stringify(input) });
    });

  const handleSignOut = () =>
    runAction(async () => {
      await api("/api/practice/session", { method: "DELETE" });
      setSelection(new Set());
      setBulkResult(null);
    });

  const handleToggleFollow = async (identity: PingIdentitySummary) => {
    if (!sessionId || followPending.has(identity.id)) return;
    setFollowPending((p) => new Set(p).add(identity.id));
    setActionError(null);
    try {
      if (identity.followedByViewer) {
        await api(`/api/practice/follow?targetId=${encodeURIComponent(identity.id)}`, { method: "DELETE" });
      } else {
        await api("/api/practice/follow", { method: "POST", body: JSON.stringify({ targetId: identity.id }) });
      }
      await refresh();
    } catch (err) {
      setActionError(err instanceof PracticeError ? err.message : "Follow action failed.");
    } finally {
      setFollowPending((p) => {
        const n = new Set(p);
        n.delete(identity.id);
        return n;
      });
    }
  };

  const handleToggleLike = async (post: PingPost) => {
    if (!sessionId || likePending.has(post.id)) return;
    setLikePending((p) => new Set(p).add(post.id));
    setActionError(null);
    try {
      if (post.likedByViewer) {
        await api(`/api/practice/like?objectId=${encodeURIComponent(post.id)}`, { method: "DELETE" });
      } else {
        await api("/api/practice/like", { method: "POST", body: JSON.stringify({ objectId: post.id }) });
      }
      await refresh();
    } catch (err) {
      setActionError(err instanceof PracticeError ? err.message : "Like action failed.");
    } finally {
      setLikePending((p) => {
        const n = new Set(p);
        n.delete(post.id);
        return n;
      });
    }
  };

  const handleSaveBio = async (bio: string) => {
    setBioSaving(true);
    setBioError(null);
    try {
      await api("/api/practice/bio", { method: "PATCH", body: JSON.stringify({ bio }) });
      await refresh();
    } catch (err) {
      setBioError(err instanceof PracticeError ? err.message : "Could not save bio.");
      throw err;
    } finally {
      setBioSaving(false);
    }
  };

  const handleFollowSelected = async () => {
    if (bulkRunning || !sessionId) return;
    setBulkRunning(true);
    setBulkResult(null);
    const result: BulkFollowResult = { followed: [], failed: [], skippedPosts: selectedPostCount };
    for (const id of selectedIdentityIds) {
      if (id === sessionId) continue; // never follow yourself
      const identity = identities.find((i) => i.id === id);
      if (!identity || identity.followedByViewer) continue; // already following: nothing to do
      try {
        await api("/api/practice/follow", { method: "POST", body: JSON.stringify({ targetId: id }) });
        result.followed.push(id);
      } catch (err) {
        result.failed.push({ id, name: identity.displayName, error: err instanceof PracticeError ? err.message : "failed" });
      }
    }
    setBulkResult(result);
    setBulkRunning(false);
    await refresh();
  };

  const connected = status === "ready";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-accent">PING Practice</h1>
          <p className="mt-1 text-sm text-accent/60">
            Your PING Social playground. Pick an identity, follow, like, edit your bio. Everything here is a real
            canonical PING action.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
            connected ? "bg-forest/15 text-forest" : "bg-honey/20 text-accent",
          )}
          role="status"
        >
          {connected ? <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
          {connected ? "BFF connected" : status === "loading" ? "Connecting" : "BFF unavailable"}
        </span>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-soft px-3 py-1.5 text-sm text-accent/80 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </button>
      </header>

      {/* Gateway error banner: honest, with retry */}
      {status === "error" && pageError && (
        <div className="mt-6 rounded-xl border border-honey/60 bg-honey/10 p-5" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-honey" aria-hidden="true" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-accent">Practice data unavailable</h2>
              <p className="mt-1 text-sm text-accent/70">{pageError.message}</p>
              <p className="mt-1 font-mono text-xs text-accent/50">code: {pageError.code}</p>
              {pageError.code === "GATEWAY_NOT_CONFIGURED" && (
                <p className="mt-2 text-sm text-accent/70">
                  Set <code className="rounded bg-surface-2 px-1">PING_GATEWAY_BASE_URL</code> on the server (for local
                  dev, the SSH-forwarded gateway port), then retry. The browser never needs this value.
                </p>
              )}
              <button
                type="button"
                onClick={refresh}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {actionError}
        </p>
      )}

      {/* 1. Morning auth */}
      <div className="mt-6">
        <IdentitySelector
          identities={identities}
          activeId={sessionId}
          loading={status === "loading"}
          onSelect={handleSelectIdentity}
          onCreate={handleCreateIdentity}
          onSignOut={handleSignOut}
          busy={busy}
          error={null}
        />
      </div>

      {/* 2. Your Circle */}
      {sessionId && (
        <section aria-label="Your Circle" className="mt-8">
          <h2 className="text-lg font-semibold text-accent">Your Circle</h2>
          <div className="mt-3">
            {status === "loading" || !profile ? (
              <PingCircle identity={null} status={status === "error" ? "error" : "loading"} errorMessage={pageError?.message} onRetry={refresh} />
            ) : (
              <PingCircle identity={profile.identity} bio={profile.bio} variant="expanded" />
            )}
          </div>
          {profile && (
            <BioEditor bio={profile.bio} onSave={handleSaveBio} saving={bioSaving} error={bioError} onClearError={() => setBioError(null)} />
          )}
        </section>
      )}

      {/* 3. Test users */}
      <section aria-label="Test users" className="mt-8">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-semibold text-accent">Test users</h2>
          <p className="text-xs text-accent/50">Tip: ctrl+A selects everything, then Follow selected.</p>
        </div>
        {status === "loading" ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <PingCircle identity={null} status="loading" />
            <PingCircle identity={null} status="loading" />
          </div>
        ) : identities.length === 0 ? (
          <p className="mt-3 rounded-xl border border-border/40 bg-surface p-5 text-sm text-accent/60">
            No test users yet. Create one above to start practicing follows and likes.
          </p>
        ) : (
          <ul className="mt-3 grid list-none gap-4 p-0 sm:grid-cols-2" role="list">
            {identities.map((identity) => (
              <li key={identity.id}>
                <TestUserCard
                  identity={identity}
                  isSelf={identity.id === sessionId}
                  selected={selection.has(selKey("identity", identity.id))}
                  onToggleSelect={(id) => toggleSelect("identity", id)}
                  following={!!identity.followedByViewer}
                  followPending={followPending.has(identity.id)}
                  onToggleFollow={handleToggleFollow}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 4. Feed */}
      {sessionId && (
        <section aria-label="Feed" className="mt-8">
          <h2 className="text-lg font-semibold text-accent">Feed</h2>
          {status === "loading" ? (
            <div className="mt-3 grid gap-4">
              <PingCircle identity={null} status="loading" />
            </div>
          ) : feed.length === 0 ? (
            <p className="mt-3 rounded-xl border border-border/40 bg-surface p-5 text-sm text-accent/60">
              Nothing in your feed yet. Follow test users and their public posts will appear here.
            </p>
          ) : (
            <div className="mt-3 grid gap-4">
              {feed.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  selectable
                  selected={selection.has(selKey("post", post.id))}
                  onToggleSelect={(id) => toggleSelect("post", id)}
                  likePending={likePending.has(post.id)}
                  onToggleLike={handleToggleLike}
                  sessionActive={!!sessionId}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Bulk selection bar */}
      <SelectionBar
        selectedIdentities={selectedIdentityIds.length}
        selectedPosts={selectedPostCount}
        running={bulkRunning}
        result={bulkResult}
        onFollowSelected={handleFollowSelected}
        onClear={() => {
          setSelection(new Set());
          setBulkResult(null);
        }}
      />

      <footer className="mt-10 border-t border-border-soft pt-4 text-xs text-accent/50">
        <p>
          Practice data flows through the server-side BFF, which reads <code className="rounded bg-surface-2 px-1">PING_GATEWAY_BASE_URL</code> and
          sanitizes public Circle fields only. Raw journal data, private keys, and credentials never reach this page.
        </p>
      </footer>
    </div>
  );
}
