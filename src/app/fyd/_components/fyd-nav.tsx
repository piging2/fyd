"use client";

/**
 * FYD product section nav.
 *
 * Phones use an in-flow chapter index beneath the introduction.
 * Tablet and landscape-phone band (md to xl): a compact "Section"
 * disclosure menu. The inline row is never rendered in this
 * band: it wrapped into a crowded two-row pill bar beside the brand
 * (owner report, 2026-10-22).
 * Desktop (xl and up): an inline link row, current section marked with
 * aria-current and a visible indicator.
 * Sticky offset: docks at top-[81px], directly beneath the 81 px site header,
 * so the two sticky bars never cover each other while scrolling.
 */

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { FYD_CHAPTERS, focusFydChapter } from "./fyd-chapters";

function followChapter(event: MouseEvent<HTMLAnchorElement>) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  focusFydChapter(event.currentTarget.hash);
}

export function FydChapterIndex() {
  return (
    <nav aria-label="FYD chapters" className="bg-deep px-4 pb-5 text-text-on-dark md:hidden">
      <p className="text-sm font-semibold">On this page</p>
      <ul className="mt-2 divide-y divide-text-on-dark/10">
        {FYD_CHAPTERS.filter((chapter) => chapter.mobile).map(({ href, label }) => (
          <li key={href}>
            <a href={href} onClick={followChapter} className="flex min-h-11 items-center text-sm underline decoration-text-on-dark/40 underline-offset-4">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function FydNav() {
  const [open, setOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Track the section currently in view; drives the "current section" label.
  useEffect(() => {
    const ids = FYD_CHAPTERS.map(({ href }) => href.slice(1));
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
      if (e.key !== "Escape" || !toggleRef.current?.parentElement?.contains(document.activeElement)) return;
      setOpen(false);
      toggleRef.current.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const current = FYD_CHAPTERS.find((s) => s.href.replace(/^#/, "") === currentId) ?? null;

  return (
    <nav
      aria-label="FYD product"
      className="sticky top-[81px] z-40 hidden border-b border-text-on-dark/10 bg-deep/95 text-text-on-dark backdrop-blur md:block"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <a href="#top" onClick={followChapter} className="flex min-h-[44px] shrink-0 items-center gap-2 py-2">
          <span className="text-lg font-black tracking-tight">FYD</span>
          <span className="hidden text-xs opacity-60 sm:inline">
            the business, understood
          </span>
        </a>

        {/* Below xl: compact section menu */}
        <div className="relative flex-1 xl:hidden">
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls="fyd-chapter-links"
            onClick={() => setOpen((v) => !v)}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-full border border-text-on-dark/20 px-4 py-2 text-sm font-medium"
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
          <div
            id="fyd-chapter-links"
            hidden={!open}
            className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-text-on-dark/15 bg-deep shadow-lg"
          >
            <ul className="max-h-[60vh] overflow-y-auto py-2">
              {FYD_CHAPTERS.map((s) => {
                const id = s.href.replace(/^#/, "");
                const isCurrent = id === currentId;
                return (
                  <li key={s.href}>
                    <a
                      href={s.href}
                      aria-current={isCurrent ? "location" : undefined}
                      onClick={(event) => {
                        followChapter(event);
                        setOpen(false);
                      }}
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
        </div>

        {/* Desktop (xl and up): inline links */}
        <ul className="hidden flex-1 flex-wrap items-center gap-x-1 gap-y-2 xl:flex">
          {FYD_CHAPTERS.filter(({ href }) => href !== "#try").map((s) => {
            const id = s.href.replace(/^#/, "");
            const isCurrent = id === currentId;
            return (
              <li key={s.href}>
                <a
                  href={s.href}
                  onClick={followChapter}
                  aria-current={isCurrent ? "location" : undefined}
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
          onClick={followChapter}
          aria-current={currentId === "try" ? "location" : undefined}
          className="hidden min-h-[44px] shrink-0 items-center justify-center rounded-full bg-honey px-5 py-2 text-sm font-semibold text-honey-foreground transition-colors hover:bg-honey-hover md:inline-flex"
        >
          Try it
        </a>
      </div>
    </nav>
  );
}
