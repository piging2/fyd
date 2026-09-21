"use client";

/**
 * ActionButtons: renders a CapabilityPlan as buttons. The plan is computed
 * server-side by the capability-aware action planner; this component only
 * renders it. The SAME plan model drives the human UI and the agent
 * context builder.
 *
 * Action wiring:
 * - follow/unfollow -> existing practice BFF (signed as the viewer identity)
 * - like/unlike     -> existing practice BFF (signed as the viewer identity)
 * - open            -> Node page link
 * - open_site       -> FYD site Node page link (capability site.read)
 * - open_website    -> external link
 * - ask/reply/propose_update/propose_site_patch -> Ask PING panel via onAsk
 * - reference       -> copies the stable reference id
 */

import * as React from "react";
import Link from "next/link";
import { Check, ExternalLink, Heart, Loader2, MessageCircleQuestion, Quote, UserMinus, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlannedAction } from "@/lib/ping/types";

interface ActionButtonsProps {
  actions: PlannedAction[];
  /** Open Ask PING with optional prefill for the given object. */
  onAsk?: (prefill: string | null, objectId: string | null) => void;
  /** Called after a follow/like mutation so the parent refreshes from the server. */
  onChanged?: () => void;
  className?: string;
}

async function bff(path: string, init?: RequestInit): Promise<void> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null);
    const msg =
      (data as { error?: { message?: string } } | null)?.error?.message ?? `Request failed (HTTP ${res.status}).`;
    throw new Error(msg);
  }
}

const BTN =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet disabled:opacity-50";
const PRIMARY = "bg-primary text-primary-foreground hover:bg-primary-hover";
const SUBTLE = "border border-border-soft bg-background text-accent hover:bg-surface-2";

export function ActionButtons({ actions, onAsk, onChanged, className }: ActionButtonsProps) {
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const mutate = async (key: string, fn: () => Promise<void>) => {
    setPending(key);
    setError(null);
    try {
      await fn();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setPending(null);
    }
  };

  const copyReference = async (referenceId: string) => {
    setError(null);
    try {
      await navigator.clipboard.writeText(referenceId);
    } catch {
      // Clipboard unavailable (older browsers): fall back to a prompt-free
      // temporary textarea copy.
      const ta = document.createElement("textarea");
      ta.value = referenceId;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const renderAction = (action: PlannedAction, index: number) => {
    const key = `${action.kind}:${index}`;
    const busy = pending === key;
    const t = action.target;

    switch (action.kind) {
      case "follow":
        if (t?.kind !== "identity") return null;
        return (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() =>
              mutate(key, () => bff("/api/practice/follow", { method: "POST", body: JSON.stringify({ targetId: t.identityId }) }))
            }
            className={cn(BTN, PRIMARY)}
            aria-label={`Follow (reason: ${action.reason})`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Follow
          </button>
        );
      case "unfollow":
        if (t?.kind !== "identity") return null;
        return (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() =>
              mutate(key, () => bff(`/api/practice/follow?targetId=${encodeURIComponent(t.identityId)}`, { method: "DELETE" }))
            }
            className={cn(BTN, SUBTLE)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
            Unfollow
          </button>
        );
      case "like":
        if (t?.kind !== "object") return null;
        return (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() =>
              mutate(key, () => bff("/api/practice/like", { method: "POST", body: JSON.stringify({ objectId: t.objectId }) }))
            }
            className={cn(BTN, SUBTLE)}
            aria-pressed={false}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
            Like
          </button>
        );
      case "unlike":
        if (t?.kind !== "object") return null;
        return (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() =>
              mutate(key, () => bff(`/api/practice/like?objectId=${encodeURIComponent(t.objectId)}`, { method: "DELETE" }))
            }
            className={cn(BTN, SUBTLE)}
            aria-pressed={true}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4 fill-current" />}
            Unlike
          </button>
        );
      case "open":
      case "open_site":
        if (t?.kind !== "object") return null;
        return (
          <Link key={key} href={`/node/${encodeURIComponent(t.objectId)}`} className={cn(BTN, SUBTLE)}>
            {action.kind === "open_site" ? "Open site" : "Open"}
          </Link>
        );
      case "open_website":
        if (t?.kind !== "url") return null;
        return (
          <a key={key} href={t.url} target="_blank" rel="noreferrer" className={cn(BTN, SUBTLE)}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Visit website
          </a>
        );
      case "ask":
        if (t?.kind !== "ask") return null;
        return (
          <button key={key} type="button" onClick={() => onAsk?.(t.prefill, t.objectId)} className={cn(BTN, SUBTLE)}>
            <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
            Ask PING
          </button>
        );
      case "reply":
      case "propose_update":
      case "propose_site_patch":
        if (t?.kind !== "ask") return null;
        return (
          <button key={key} type="button" onClick={() => onAsk?.(t.prefill, t.objectId)} className={cn(BTN, SUBTLE)}>
            {action.kind === "reply" ? "Reply" : action.kind === "propose_site_patch" ? "Propose site change" : "Propose update"}
          </button>
        );
      case "reference":
        if (t?.kind !== "reference") return null;
        return (
          <button key={key} type="button" onClick={() => copyReference(t.referenceId)} className={cn(BTN, SUBTLE)}>
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Quote className="h-4 w-4" aria-hidden="true" />}
            {copied ? "Copied" : "Copy reference"}
          </button>
        );
      default:
        return null;
    }
  };

  if (actions.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">{actions.map(renderAction)}</div>
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <span className="sr-only">Available actions are computed from your capabilities for this object.</span>
    </div>
  );
}
