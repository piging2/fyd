"use client";

/**
 * FYD product nav: FYD-specific information architecture, distinct from the
 * PING site nav. Anchor links into the education spine of this page.
 */

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
  return (
    <nav
      aria-label="FYD product"
      className="sticky top-0 z-50 border-b border-text-on-dark/10 bg-deep/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex shrink-0 items-center gap-2 py-4">
          <span className="text-xl font-black tracking-tight text-text-on-dark">
            FYD
          </span>
          <span className="hidden text-xs text-text-on-dark/60 sm:inline">
            the business, understood
          </span>
        </a>
        <div className="flex flex-1 items-center gap-1 overflow-x-auto py-2">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-text-on-dark/75 transition-colors hover:bg-text-on-dark/10 hover:text-honey"
            >
              {l.label}
            </a>
          ))}
        </div>
        <a
          href="#try"
          className="hidden shrink-0 items-center justify-center rounded-full bg-honey px-5 py-2 text-sm font-semibold text-honey-foreground transition-colors hover:bg-honey-hover md:inline-flex"
        >
          Try it
        </a>
      </div>
    </nav>
  );
}
