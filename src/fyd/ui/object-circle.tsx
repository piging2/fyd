/**
 * ObjectCircle: the portable FYD doorway into an object Node.
 *
 * STATE 1 (inline): compact object reference (logo/initials, name,
 * category and location). Tiny, fast, portable.
 *
 * STATE 2 (circle / expanded preview): on hover-capable devices, hover or
 * keyboard focus opens a compact preview card; on touch devices (or via
 * click/Enter/Space anywhere) a bottom-sheet dialog opens. NOTHING requires
 * hover: every piece of information and every action is reachable from the
 * dialog alone, and the whole thing is keyboard operable (Escape closes,
 * focus returns to the trigger).
 *
 * Card contents (each omitted gracefully when missing, never faked):
 * image, name, category, location, top services, capability-gated actions.
 *
 * Actions render ONLY from view.capabilities: a phone number exposes Call
 * only when the call capability exists. No fake buttons.
 *
 * Motion: a short scale/fade entrance (transform + opacity only, 60fps
 * class). prefers-reduced-motion fully honored via the CSS module.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Mail, MessageCircleQuestion, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ObjectCapability, ObjectView } from "../object/types";
import styles from "./object-circle.module.css";
import { ObjectIdentityMark } from "../presentation/object-identity-mark";

interface ObjectCircleProps {
  view: ObjectView;
  /** Node href; defaults to /o/<id>. */
  nodeHref?: string;
  className?: string;
}

function LogoMark({ view, size }: { view: ObjectView; size: "sm" | "lg" }) {
  return <ObjectIdentityMark object={view} size={size === "sm" ? 40 : 64} />;
}

function CapabilityActions({ view, nodeHref }: { view: ObjectView; nodeHref: string }) {
  const render = (cap: ObjectCapability, index: number) => {
    const key = cap.kind + ":" + index;
    const btn =
      "inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600";
    switch (cap.kind) {
      case "view":
        return (
          <Link
            key={key}
            href={nodeHref}
            className={cn(btn, "bg-amber-600 text-white hover:bg-amber-700")}
          >
            View
          </Link>
        );
      case "ask":
        return (
          <Link
            key={key}
            href={nodeHref + "#ask"}
            className={cn(btn, "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100")}
          >
            <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
            Ask
          </Link>
        );
      case "call":
        return (
          <a
            key={key}
            href={cap.href}
            className={cn(btn, "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100")}
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            {cap.label}
          </a>
        );
      case "email":
        return (
          <a
            key={key}
            href={cap.href}
            className={cn(btn, "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100")}
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            {cap.label}
          </a>
        );
      case "website":
        return (
          <a
            key={key}
            href={cap.href}
            target="_blank"
            rel="noreferrer"
            className={cn(btn, "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100")}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {cap.label}
          </a>
        );
      default:
        return null;
    }
  };
  return <div className="mt-4 flex flex-wrap gap-2">{view.capabilities.map(render)}</div>;
}

function CardBody({ view, nodeHref }: { view: ObjectView; nodeHref: string }) {
  const hero = view.media.find((m) => m.role === "hero" || m.role === "gallery");
  const topServices = view.services.filter((s) => s.visible).slice(0, 5);
  return (
    <div className="p-5">
      {hero && (
        <img
          src={hero.src}
          alt={hero.alt}
          loading="lazy"
          className="mb-4 h-36 w-full rounded-lg object-cover"
        />
      )}
      <div className="flex items-start gap-3">
        <LogoMark view={view} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-stone-900">{view.name}</p>
          <p className="truncate text-sm text-stone-500">
            {[view.category, view.locationLabel].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {topServices.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Top services">
          {topServices.map((s) => (
            <li
              key={s.id}
              className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700"
            >
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <CapabilityActions view={view} nodeHref={nodeHref} />
      <p className="mt-4 text-xs text-stone-400">{view.provenance.label}</p>
    </div>
  );
}

export function ObjectCircle({ view, nodeHref, className }: ObjectCircleProps) {
  const href = nodeHref ?? "/o/" + encodeURIComponent(view.id);
  const [cardOpen, setCardOpen] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [canHover, setCanHover] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setCanHover(window.matchMedia("(hover: hover)").matches);
  }, []);

  const openCard = React.useCallback(() => {
    if (!canHover || dialogOpen) return;
    setCardOpen(true);
  }, [canHover, dialogOpen]);
  const closeCard = React.useCallback(() => setCardOpen(false), []);
  const openDialog = React.useCallback(() => {
    setCardOpen(false);
    setDialogOpen(true);
  }, []);
  const closeDialog = React.useCallback(() => {
    setDialogOpen(false);
    triggerRef.current?.focus();
  }, []);

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

  const subline = [view.category, view.locationLabel].filter(Boolean).join(" · ");

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
        aria-label={dialogOpen ? "Close preview for " + view.name : "Open preview for " + view.name}
        className="flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
      >
        <LogoMark view={view} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-stone-900">{view.name}</span>
          <span className="block truncate text-xs text-stone-500">{subline || "Tap to open"}</span>
        </span>
      </button>

      {/* Hover/focus card: desktop enhancement only, never required. */}
      {cardOpen && canHover && !dialogOpen && (
        <div
          role="note"
          aria-label={"Preview card for " + view.name}
          className={cn(
            styles.cardEnter,
            "absolute left-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-stone-200 bg-white shadow-xl",
          )}
        >
          <CardBody view={view} nodeHref={href} />
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
            aria-label={"Preview for " + view.name}
            tabIndex={-1}
            className={cn(
              styles.sheetEnter,
              "relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl focus:outline-none sm:max-w-md sm:rounded-2xl",
            )}
          >
            <div className="sticky top-0 flex justify-end bg-white/95 p-2">
              <button
                type="button"
                onClick={closeDialog}
                aria-label="Close"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
              >
                <span aria-hidden="true" className="text-xl leading-none">×</span>
              </button>
            </div>
            <CardBody view={view} nodeHref={href} />
          </div>
        </div>
      )}
    </div>
  );
}
