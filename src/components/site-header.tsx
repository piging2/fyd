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
          bg-gradient-to-br from-[#A67C00] via-[#D99A4E] via-[#E7AD63] to-[#F0C070]
          bg-clip-text text-transparent
          transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
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
        className={`
          absolute inset-0 z-20 bg-gradient-to-r from-transparent via-white/15 via-white/10 to-transparent
          bg-clip-text text-transparent
          pointer-events-none
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
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const navigation = getNavigation();
  const tenant = getTenant();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const navRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleMenuClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!menuRef.current) return;
    const nav = menuRef.current.querySelector('nav');
    if (nav && !nav.contains(e.target as Node)) {
      setOpen(false);
    }
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const primary = navigation.filter((n) => !n.secondary);
  const contact = navigation.find((n) => n.secondary);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label={`${tenant.siteName} home`}>
          <PingWordmark />
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-text-subtle sm:block">
            {tenant.tagline.split(" for ")[0]}
          </span>
        </Link>

        <nav className="hidden items-center md:flex relative" aria-label="Primary" ref={navRef}>
          {primary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
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
              className={cn(buttonVariants({ variant: "primary", size: "sm" }), "bg-honey text-honey-foreground shadow-warm hover:bg-honey-hover")}
            >
              {contact.label}
            </Link>
          )}
        </div>

        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div id="mobile-menu" ref={menuRef} onClick={handleMenuClick} className="border-t border-border/60 bg-[#F8F6F3] dark:bg-surface md:hidden">
          <nav className="flex flex-col p-3" aria-label="Mobile">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-3 text-base font-medium transition-colors duration-200",
                  isActive(item.href) ? "bg-primary/10 text-primary" : "text-black dark:text-text-on-dark hover:bg-white/50 dark:hover:bg-surface-muted/50"
                )}
              >
                {isActive(item.href) ? <NavShimmer>{item.label}</NavShimmer> : item.label}
              </Link>
            ))}
            <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between">
              <span className="text-sm text-black dark:text-text-on-dark">Theme</span>
              <ThemeToggle />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
