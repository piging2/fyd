"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { getNavigation } from "@/lib/navigation";
import { getTenant } from "@/lib/tenant-config";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { PingWordmark } from "@/components/ping-wordmark";
import { FYD_CHAPTERS, focusFydChapter } from "@/app/fyd/_components/fyd-chapters";

function NavShimmer({ children, className }: { children: React.ReactNode; className?: string }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <span
      className={cn("relative inline-block", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Base gold text with layered gradients */}
      <span
        className={`
          relative z-10
          bg-gradient-to-br from-[#8A6D1F] via-[#7C6118] via-[#755B12] to-[#6E5610]
          bg-clip-text text-transparent
          transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none forced-colors:text-[LinkText]
          ${isHovered ? 'scale-[1.01]' : 'scale-100'}
        `}
        style={{
          filter: isHovered ? 'brightness(1.08) saturate(1.1)' : 'brightness(1) saturate(1)',
        }}
      >
        {children}
      </span>

      {/* Animated shimmer sweep - warm light traveling left to right */}
      <span
        aria-hidden="true"
        className={`
          absolute inset-0 z-20 bg-gradient-to-r from-transparent via-white/15 via-white/10 to-transparent
          bg-clip-text text-transparent
          pointer-events-none motion-reduce:animate-none
          ${isHovered ? 'animate-shimmer-fast' : 'animate-shimmer-slow'}
        `}
        style={{
          backgroundSize: '200% 100%',
        }}
      >
        {children}
      </span>
    </span>
  );
}

export function SiteHeader() {
  const rawPath = usePathname();
  const pathname = rawPath === "/index" ? "/" : rawPath;
  const [open, setOpen] = React.useState(false);
  const navigation = getNavigation();
  const tenant = getTenant();
  const toggleRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const isCurrent = (href: string) => pathname === href;
  const isActive = (href: string) => isCurrent(href) || (href !== "/" && pathname.startsWith(href + "/"));

  const primary = navigation.filter((n) => !n.secondary);
  const contact = navigation.find((n) => n.secondary);

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 rounded-[1.4rem] border border-border/70 bg-background/85 px-4 shadow-[0_10px_36px_rgba(16,12,40,0.10)] backdrop-blur-md sm:px-5">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label={`${tenant.siteName} home`}>
          <PingWordmark />
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-text-subtle xl:block">
            {tenant.tagline.split(" for ")[0]}
          </span>
        </Link>

        <nav className="hidden items-center lg:flex relative" aria-label="Primary">
          {primary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(item.href) ? "page" : isActive(item.href) ? "location" : undefined}
              className={cn(
                "whitespace-nowrap px-3.5 py-2.5 text-[13px] font-medium tracking-wide transition-all duration-200 relative z-10",
                isActive(item.href) ? "text-primary" : "text-text hover:text-text hover:bg-surface/50 rounded-md"
              )}
            >
              {isActive(item.href) ? <NavShimmer>{item.label}</NavShimmer> : item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 lg:flex items-center gap-2">
          <ThemeToggle />
          {contact && (
            <Link
              href={contact.href}
              aria-current={isCurrent(contact.href) ? "page" : undefined}
              className={cn(buttonVariants({ variant: "primary", size: "sm" }), "bg-honey text-honey-foreground shadow-warm hover:bg-honey-hover")}
            >
              {contact.label}
            </Link>
          )}
        </div>

        <button
          ref={toggleRef}
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <div id="mobile-menu" hidden={!open} className="mx-auto mt-2 max-h-[calc(100dvh-6rem)] max-w-7xl overflow-y-auto overscroll-contain rounded-[1.4rem] border border-border/70 bg-[#F8F6F3] shadow-[0_10px_36px_rgba(16,12,40,0.10)] dark:bg-surface lg:hidden">
        <nav className="flex flex-col p-3" aria-label="Mobile">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={isCurrent(item.href) ? "page" : isActive(item.href) ? "location" : undefined}
              className={cn(
                "rounded-lg px-3 py-3 text-base font-medium transition-colors duration-200",
                isActive(item.href) ? "bg-primary/10 text-primary" : "text-black dark:text-text-on-dark hover:bg-white/50 dark:hover:bg-surface-muted/50"
              )}
            >
              {isActive(item.href) ? <NavShimmer>{item.label}</NavShimmer> : item.label}
            </Link>
          ))}
          {pathname === "/fyd" && (
            <>
              <div className="mt-2 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/50 dark:text-text-on-dark/50">
                On this page
              </div>
              {FYD_CHAPTERS.filter((item) => item.mobile).map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    focusFydChapter(item.href);
                    setOpen(false);
                  }}
                  className="flex min-h-[44px] items-center rounded-lg px-3 py-3 text-[15px] font-medium text-black/80 dark:text-text-on-dark/80 hover:bg-white/50 dark:hover:bg-surface-muted/50"
                >
                  {item.label}
                </a>
              ))}
            </>
          )}
          <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between">
            <span className="text-sm text-black dark:text-text-on-dark">Theme</span>
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </header>
  );
}
