"use client";

/**
 * FYD product section nav.
 *
 * Mobile: hidden — the section links are consolidated into the site header
 * hamburger menu ("On this page") so only one sticky bar renders on phones.
 * Desktop: an inline wrapping link row, current section marked with
 * aria-current and a visible indicator.
 * Sticky offset: docks at top-[81px], directly beneath the 81 px site header,
 * so the two sticky bars never cover each other while scrolling.
 */

import { useEffect, useRef, useState } from "react";

const LINKS: { href: string; label: string }[] = [
  { href: "#understand", label: "Understand" },
  { href: "#explore", label: "Explore" },
  { href: "#how", label: "How it works" },
  { href: "#ask", label: "Ask" },
  { href: "#network", label: "Network" },
  { href: "#inside", label: "PING inside" },
  { href: "#privacy", label: "Your data" },
  { href: "#try", label: "Try it" },
];

export function FydNav() {
  const [open, setOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Track the section currently in view; drives the "current section" label.
  useEffect(() => {
    const ids = LINKS.map((s) => s.href.replace(/^#/, "")).filter(Boolean);
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrentId(entry.target.id);
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const t of targets) observer.observe(t);
    return () => observer.disconnect();
  }, []);

  // Close the disclosure on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const current = LINKS.find((s) => s.href.replace(/^#/, "") === currentId) ?? null;

  return (
    <nav
      aria-label="FYD product"
      className="sticky top-[81px] z-40 hidden border-b border-text-on-dark/10 bg-deep/95 text-text-on-dark backdrop-blur md:block"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <a href="#top" className="flex min-h-[44px] shrink-0 items-center gap-2 py-2">
          <span className="text-lg font-black tracking-tight">FYD</span>
          <span className="hidden text-xs opacity-60 sm:inline">
            the business, understood
          </span>
        </a>

        {/* Mobile: compact section menu */}
        <div className="relative flex-1 md:hidden" ref={panelRef}>
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="true"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-full border border-text-on-dark/20 px-4 py-2 text-sm font-medium"
          >
            <span className="truncate">
              <span className="mr-2 text-xs opacity-60">Section</span>
              {current ? current.label : "Overview"}
            </span>
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path
                d="M4 6l4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {open && (
            <div
              role="menu"
              className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-text-on-dark/15 bg-deep shadow-lg"
            >
              <ul className="max-h-[60vh] overflow-y-auto py-2">
                {LINKS.map((s) => {
                  const id = s.href.replace(/^#/, "");
                  const isCurrent = id === currentId;
                  return (
                    <li key={s.href}>
                      <a
                        role="menuitem"
                        href={s.href}
                        aria-current={isCurrent ? "true" : undefined}
                        onClick={() => setOpen(false)}
                        className={`flex items-center justify-between px-4 py-3 text-sm ${
                          isCurrent
                            ? "bg-text-on-dark/10 font-semibold text-honey"
                            : "text-text-on-dark/80 hover:bg-text-on-dark/5"
                        }`}
                      >
                        {s.label}
                        {isCurrent && (
                          <span aria-hidden="true" className="text-xs text-honey">
                            current
                          </span>
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Desktop: wrapping inline links, no horizontal scrollbar */}
        <ul className="hidden flex-1 flex-wrap items-center gap-x-1 gap-y-2 md:flex">
          {LINKS.map((s) => {
            const id = s.href.replace(/^#/, "");
            const isCurrent = id === currentId;
            return (
              <li key={s.href}>
                <a
                  href={s.href}
                  aria-current={isCurrent ? "true" : undefined}
                  className={`flex min-h-[44px] items-center whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium ${
                    isCurrent
                      ? "bg-text-on-dark/10 text-honey"
                      : "text-text-on-dark/75 hover:bg-text-on-dark/10 hover:text-honey"
                  }`}
                >
                  {s.label}
                </a>
              </li>
            );
          })}
        </ul>

        <a
          href="#try"
          className="hidden min-h-[44px] shrink-0 items-center justify-center rounded-full bg-honey px-5 py-2 text-sm font-semibold text-honey-foreground transition-colors hover:bg-honey-hover md:inline-flex"
        >
          Try it
        </a>
      </div>
    </nav>
  );
}
