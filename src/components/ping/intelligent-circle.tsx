"use client";

/**
 * IntelligentCircle: the portable PING doorway.
 *
 * Compact circle by default. On hover-capable devices, hover or keyboard
 * focus opens a compact intelligent card; on touch devices (or via click /
 * Enter / Space anywhere) a bottom sheet dialog opens. NOTHING requires
 * hover: every piece of information and every action is reachable from the
 * dialog alone, and the whole thing is keyboard operable (Escape closes,
 * focus is trapped in the dialog and restored on close).
 *
 * Card contents (each omitted gracefully when missing, never faked):
 * display name, handle, avatar, type, description, website/domain,
 * location, business category, verification/provenance indicator,
 * relationship context, followers/following, top objects, connected
 * public networks, primary action.
 *
 * Actions: FOLLOW, UNFOLLOW, OPEN, ASK PING, VISIT WEBSITE.
 * LIKE belongs on objects, not identities, so it never appears here.
 */

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  ExternalLink,
  Loader2,
  MapPin,
  MessageCircleQuestion,
  RefreshCw,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CapabilityPlan, IntelligentCircleData } from "@/lib/ping/types";
import { circleUiActions } from "@/fyd/ask/circle-actions";
import type { CircleUiAction } from "@/fyd/ask/circle-actions";

interface IntelligentCircleProps {
  identityId: string;
  /** Preloaded card data (embed / SSR). When set with fetchOnOpen=false, no fetch happens. */
  initialData?: IntelligentCircleData | null;
  fetchOnOpen?: boolean;
  onAsk?: (prefill: string | null, objectId: string | null) => void;
  className?: string;
  /**
   * CapabilityPlan for the circled object. When present, the action row is
   * rendered from circleUiActions: every rendered action binds to a real
   * capability, and unknown kinds never render. When absent, the legacy
   * action row renders unchanged.
   */
  plan?: CapabilityPlan | null;
  /** Label for the ask action; Ask FYD passes "Ask FYD". */
  askLabel?: string;
  /** FYD node href override for the Open action; defaults to the Node page. */
  nodeHref?: string | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function KindBadge({ kind }: { kind: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium capitalize text-accent/70">
      <Building2 className="h-3 w-3" aria-hidden="true" />
      {kind}
    </span>
  );
}

/**
 * Capability-gated action row. Renders ONLY actions present in the plan;
 * unknown future kinds are skipped by circleUiActions, never rendered dead.
 * Visual and accessibility behavior matches the legacy row: 44px targets,
 * focus-visible rings, aria-pressed on follow toggles.
 */
function GatedActions({
  plan,
  askLabel,
  nodeHref,
  objectId,
  website,
  onAsk,
  onToggleFollow,
  followPending,
}: {
  plan: CapabilityPlan;
  askLabel: string;
  nodeHref: string | null;
  objectId: string;
  website: string | null;
  onAsk?: (prefill: string | null, objectId: string | null) => void;
  onToggleFollow: () => void;
  followPending: boolean;
}) {
  const uiActions = circleUiActions(plan, askLabel);
  if (uiActions.length === 0) return null;
  const openHref = nodeHref ?? `/node/${encodeURIComponent(objectId)}`;
  const render = (ua: CircleUiAction, index: number) => {
    const key = `${ua.kind}:${index}`;
    switch (ua.kind) {
      case "follow":
        return (
          <button
            key={key}
            type="button"
            onClick={onToggleFollow}
            disabled={followPending}
            aria-pressed={false}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet disabled:opacity-50",
              "bg-primary text-primary-foreground hover:bg-primary-hover",
            )}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Follow
          </button>
        );
      case "unfollow":
        return (
          <button
            key={key}
            type="button"
            onClick={onToggleFollow}
            disabled={followPending}
            aria-pressed={true}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet disabled:opacity-50",
              "border border-border-soft bg-background text-accent hover:bg-surface-2",
            )}
          >
            <UserMinus className="h-4 w-4" aria-hidden="true" />
            Unfollow
          </button>
        );
      case "open":
      case "open_site":
        return (
          <Link
            key={key}
            href={openHref}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border-soft bg-background px-4 py-2 text-sm font-medium text-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
          >
            {ua.kind === "open_site" ? "Open site" : "Open"}
          </Link>
        );
      case "ask":
        return (
          <button
            key={key}
            type="button"
            onClick={() => onAsk?.(null, objectId)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border-soft bg-background px-4 py-2 text-sm font-medium text-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
          >
            <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
            {ua.label}
          </button>
        );
      case "propose_site_patch":
        return (
          <button
            key={key}
            type="button"
            onClick={() => onAsk?.("Propose a site change: ", objectId)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border-soft bg-background px-4 py-2 text-sm font-medium text-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
          >
            {ua.label}
          </button>
        );
      case "open_website":
        return website ? (
          <a
            key={key}
            href={website}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border-soft bg-background px-4 py-2 text-sm font-medium text-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Visit website
          </a>
        ) : null;
      default:
        return null;
    }
  };
  return <div className="mt-4 flex flex-wrap gap-2">{uiActions.map(render)}</div>;
}

function CardBody({
  data,
  onAsk,
  onFollowed,
  plan = null,
  askLabel = "Ask PING",
  nodeHref = null,
}: {
  data: IntelligentCircleData;
  onAsk?: (prefill: string | null, objectId: string | null) => void;
  onFollowed: () => void;
  plan?: CapabilityPlan | null;
  askLabel?: string;
  nodeHref?: string | null;
}) {
  const { identity, relationshipContext } = data;
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggleFollow = async () => {
    setPending(true);
    setError(null);
    try {
      if (relationshipContext.followedByViewer) {
        const res = await fetch(`/api/practice/follow?targetId=${encodeURIComponent(identity.id)}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Unfollow failed.");
      } else {
        const res = await fetch("/api/practice/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetId: identity.id }),
        });
        if (!res.ok) throw new Error("Follow failed.");
      }
      onFollowed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="p-5">
      <div className="flex items-start gap-3">
        {data.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ping-violet/15 text-xl font-bold text-ping-violet"
          >
            {initials(identity.displayName)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-lg font-semibold text-accent">{identity.displayName}</span>
            {identity.verified && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-forest">
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                Verified
              </span>
            )}
          </div>
          <p className="truncate text-sm text-accent/60">@{identity.handle}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {data.kind && <KindBadge kind={data.kind} />}
            {data.category && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-accent/70">{data.category}</span>
            )}
          </div>
        </div>
      </div>

      {data.description ? (
        <p className="mt-3 text-sm leading-relaxed text-accent/80">{data.description}</p>
      ) : (
        <p className="mt-3 text-sm italic text-accent/50">No description yet.</p>
      )}

      <dl className="mt-3 space-y-1.5 text-sm">
        {data.website && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Website</dt>
            <dd>
              <a
                href={data.website.startsWith("http") ? data.website : `https://${data.website}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-ping-violet hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {data.domain ?? data.website}
              </a>
            </dd>
          </div>
        )}
        {data.location && (
          <div className="flex items-center gap-2 text-accent/70">
            <dt className="sr-only">Location</dt>
            <dd className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {data.location}
            </dd>
          </div>
        )}
      </dl>

      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-accent/60">
        <BadgeCheck className="h-3.5 w-3.5 text-forest" aria-hidden="true" />
        {data.provenanceLabel}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-accent/70">
        <span>
          <strong className="font-semibold text-accent">{identity.followerCount}</strong> followers
        </span>
        <span>
          <strong className="font-semibold text-accent">{identity.followingCount}</strong> following
        </span>
        {relationshipContext.followsViewer && (
          <span className="rounded-full bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">Follows you</span>
        )}
        {relationshipContext.mutualCount > 0 && (
          <span className="text-xs">{relationshipContext.mutualCount} mutual follows</span>
        )}
      </div>

      {data.topObjects.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-accent/50">Top objects</h4>
          <ul className="mt-1.5 space-y-1">
            {data.topObjects.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/node/${encodeURIComponent(o.id)}`}
                  className="block truncate rounded-md px-1 py-1 text-sm text-ping-violet hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
                >
                  {o.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.networks.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-accent/50">Connected networks</h4>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {data.networks.map((n, i) =>
              n.url ? (
                <a
                  key={`${n.network}:${i}`}
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  title={n.label ?? n.network}
                  className="rounded-full border border-border-soft px-2.5 py-1 text-xs font-medium text-accent hover:bg-surface-2"
                >
                  {n.network}
                </a>
              ) : (
                <span
                  key={`${n.network}:${i}`}
                  className="rounded-full border border-border-soft px-2.5 py-1 text-xs text-accent/70"
                >
                  {n.network}
                </span>
              ),
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {plan ? (
        <GatedActions
          plan={plan}
          askLabel={askLabel}
          nodeHref={nodeHref}
          objectId={data.objectId}
          website={data.website}
          onAsk={onAsk}
          onToggleFollow={toggleFollow}
          followPending={pending}
        />
      ) : (
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleFollow}
          disabled={pending}
          aria-pressed={relationshipContext.followedByViewer}
          className={cn(
            "inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet disabled:opacity-50",
            relationshipContext.followedByViewer
              ? "border border-border-soft bg-background text-accent hover:bg-surface-2"
              : "bg-primary text-primary-foreground hover:bg-primary-hover",
          )}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : relationshipContext.followedByViewer ? (
            <UserMinus className="h-4 w-4" aria-hidden="true" />
          ) : (
            <UserPlus className="h-4 w-4" aria-hidden="true" />
          )}
          {relationshipContext.followedByViewer ? "Unfollow" : "Follow"}
        </button>
        <Link
          href={`/node/${encodeURIComponent(data.objectId)}`}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-border-soft bg-background px-4 py-2 text-sm font-medium text-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
        >
          Open
        </Link>
        <button
          type="button"
          onClick={() => onAsk?.(null, data.objectId)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border-soft bg-background px-4 py-2 text-sm font-medium text-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
        >
          <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
          Ask PING
        </button>
      </div>
      )}
    </div>
  );
}

export function IntelligentCircle({
  identityId,
  initialData = null,
  fetchOnOpen = true,
  onAsk,
  className,
  plan = null,
  askLabel = "Ask PING",
  nodeHref = null,
}: IntelligentCircleProps) {
  const [data, setData] = React.useState<IntelligentCircleData | null>(initialData);
  const [status, setStatus] = React.useState<"idle" | "loading" | "ready" | "error">(
    initialData ? "ready" : "idle",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [cardOpen, setCardOpen] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [canHover, setCanHover] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setCanHover(window.matchMedia("(hover: hover)").matches);
  }, []);

  const fetchData = React.useCallback(
    async (force = false) => {
    if (!fetchOnOpen) return;
    if (!force && (status === "ready" || status === "loading")) return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(`/api/ping/circle?identityId=${encodeURIComponent(identityId)}`);
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (json as { error?: { message?: string } } | null)?.error?.message ?? "Circle unavailable.";
        throw new Error(msg);
      }
      setData((json as { circle: IntelligentCircleData }).circle);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Circle unavailable.");
      setStatus("error");
    }
    },
    [fetchOnOpen, identityId, status],
  );

  const openCard = React.useCallback(() => {
    if (!canHover || dialogOpen) return;
    setCardOpen(true);
    void fetchData();
  }, [canHover, dialogOpen, fetchData]);

  const closeCard = React.useCallback(() => setCardOpen(false), []);

  const openDialog = React.useCallback(() => {
    setCardOpen(false);
    setDialogOpen(true);
    void fetchData();
  }, [fetchData]);

  const closeDialog = React.useCallback(() => {
    setDialogOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Lock body scroll + focus the dialog while open.
  React.useEffect(() => {
    if (!dialogOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [dialogOpen, closeDialog]);

  const onTriggerBlur = (e: React.FocusEvent) => {
    if (!wrapperRef.current?.contains(e.relatedTarget as Node | null)) closeCard();
  };

  const compactLabel = data ? `${data.identity.displayName} (@${data.identity.handle})` : "PING Circle";

  return (
    <div
      ref={wrapperRef}
      className={cn("relative", className)}
      onMouseEnter={openCard}
      onMouseLeave={closeCard}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        onFocus={openCard}
        onBlur={onTriggerBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDialog();
          } else if (e.key === "Escape") {
            closeCard();
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={dialogOpen}
        aria-label={dialogOpen ? `Close Circle for ${compactLabel}` : `Open Circle for ${compactLabel}`}
        className="flex w-full items-center gap-3 rounded-xl border border-border/40 bg-surface p-3 text-left shadow-[--shadow-card] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ping-violet/15 text-sm font-bold text-ping-violet"
        >
          {data ? initials(data.identity.displayName) : "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-accent">
            {data ? data.identity.displayName : "PING Circle"}
          </span>
          <span className="block truncate text-xs text-accent/60">
            {data ? `@${data.identity.handle}` : "Tap to open"}
          </span>
        </span>
        {data?.identity.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-forest" aria-hidden="true" />}
      </button>

      {/* Hover/focus card: desktop enhancement only, never required. */}
      {cardOpen && canHover && !dialogOpen && (
        <div
          role="note"
          aria-label={`Circle card for ${compactLabel}`}
          className="absolute left-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border/40 bg-surface shadow-xl"
        >
          {status === "loading" || status === "idle" ? (
            <div className="animate-pulse p-5" role="status" aria-label="Loading Circle">
              <div className="h-4 w-2/5 rounded bg-surface-muted" />
              <div className="mt-2 h-3 w-3/4 rounded bg-surface-muted" />
            </div>
          ) : status === "error" || !data ? (
            <div className="p-5" role="alert">
              <p className="flex items-center gap-2 text-sm font-semibold text-accent">
                <AlertTriangle className="h-4 w-4 text-honey" aria-hidden="true" />
                Circle unavailable
              </p>
              <p className="mt-1 text-sm text-accent/70">{error ?? "Could not load the Circle."}</p>
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  void fetchData();
                }}
                className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </button>
            </div>
          ) : (
            <CardBody data={data} onAsk={onAsk} onFollowed={() => void fetchData(true)} plan={plan} askLabel={askLabel} nodeHref={nodeHref} />
          )}
        </div>
      )}

      {/* Bottom sheet dialog: the fully accessible path on every device. */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeDialog} aria-hidden="true" />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Circle for ${compactLabel}`}
            tabIndex={-1}
            className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-surface shadow-2xl focus:outline-none sm:max-w-md sm:rounded-2xl"
          >
            <div className="sticky top-0 flex justify-end bg-surface/95 p-2 backdrop-blur">
              <button
                type="button"
                onClick={closeDialog}
                aria-label="Close"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-accent/60 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
              >
                <span aria-hidden="true" className="text-xl leading-none">×</span>
              </button>
            </div>
            {status === "loading" || status === "idle" ? (
              <div className="animate-pulse p-5" role="status" aria-label="Loading Circle">
                <div className="h-4 w-2/5 rounded bg-surface-muted" />
                <div className="mt-2 h-3 w-3/4 rounded bg-surface-muted" />
                <div className="mt-4 h-24 rounded bg-surface-muted" />
              </div>
            ) : status === "error" || !data ? (
              <div className="p-5" role="alert">
                <p className="flex items-center gap-2 text-sm font-semibold text-accent">
                  <AlertTriangle className="h-4 w-4 text-honey" aria-hidden="true" />
                  Circle unavailable
                </p>
                <p className="mt-1 text-sm text-accent/70">{error ?? "Could not load the Circle."}</p>
                <button
                  type="button"
                  onClick={() => {
                    setStatus("idle");
                    void fetchData();
                  }}
                  className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : (
              <CardBody data={data} onAsk={onAsk} onFollowed={() => void fetchData(true)} plan={plan} askLabel={askLabel} nodeHref={nodeHref} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
