import Link from "next/link";
import { getTenant } from "@/lib/tenant-config";
import { getNavigation } from "@/lib/navigation";
import { PingWordmark } from "@/components/ping-wordmark";
import { ScrollReveal } from "@/components/scroll-reveal";

export function SiteFooter() {
  const tenant = getTenant();
  const navigation = getNavigation();
  return (
    <footer className="border-t border-border/60 bg-deep text-text-on-dark">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div>
          <Link href="/" className="flex items-center gap-2.5 font-bold text-text-on-dark">
            <PingWordmark />
          </Link>
          <p className="mt-3 text-sm text-text-on-dark">{tenant.tagline}</p>
          <ScrollReveal>
            <p className="mt-3 text-sm text-text-on-dark/80">{tenant.description}</p>
          </ScrollReveal>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-on-dark">Explore</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {navigation.filter((n) => !n.secondary).map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="inline-block min-h-[44px] py-2 text-text-on-dark hover:text-honey">{n.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-on-dark">More</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {navigation.filter((n) => n.secondary).map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="inline-block min-h-[44px] py-2 text-text-on-dark hover:text-honey">{n.label}</Link>
              </li>
            ))}
            <li>
              <Link href="/#architecture" className="inline-block min-h-[44px] py-2 text-text-on-dark hover:text-honey">Architecture</Link>
            </li>
            <li>
              <Link href="/#roadmap" className="inline-block min-h-[44px] py-2 text-text-on-dark hover:text-honey">Roadmap</Link>
            </li>
            <li>
              <Link href="/newsletter" className="inline-block min-h-[44px] py-2 text-text-on-dark hover:text-honey">Newsletter</Link>
            </li>
            <li>
              <Link href="/privacy" className="inline-block min-h-[44px] py-2 text-text-on-dark hover:text-honey">Privacy</Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-on-dark">Connect</h3>
          <ul className="mt-3 space-y-3 text-sm">
            {tenant.contact.facebook && (
              <li>
                <a href={tenant.contact.facebook} target="_blank" rel="noopener noreferrer" className="inline-block min-h-[44px] py-2 text-text-on-dark hover:text-honey">
                  PING Social on Facebook
                </a>
              </li>
            )}
            <li className="text-xs text-text-on-dark/70">
              {tenant.operator.business} · operated by {tenant.operator.name}
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-text-on-dark/8 py-4 text-center text-xs text-text-on-dark">
        {tenant.tagline}
      </div>

      <div className="border-t border-text-on-dark/8 py-6 text-center text-xs text-text-on-dark">
        © {new Date().getFullYear()} {tenant.siteName}. {tenant.provenance.note}
      </div>
    </footer>
  );
}
