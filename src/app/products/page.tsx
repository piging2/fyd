import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant-config";
import Link from "next/link";
import { Container, Section } from "@/components/section";
import { CTASection } from "@/components/cta-section";
import { FaqSection } from "@/components/faq-section";
import { getFaqsByCategory } from "@/lib/faq";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getProducts,
  statusLabel,
  type Product,
  type ProductStatus,
} from "@/lib/products";
import { buildItemListJsonLd } from "@/lib/structured-data";

const siteUrl =
  getTenant().domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://fyd-product.vercel.app");

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Products: What Exists, What Is Being Built",
  description:
    "What PING offers today, what is in development, and where the platform is headed. Honest labels, no vaporware: every product carries its real status.",
  alternates: { canonical: "/products" },
  openGraph: {
    type: "website",
    title: "Products: What Exists, What Is Being Built · PING",
    description: "What PING offers today, what is in development, and where the platform is headed. Honest labels, no vaporware: every product carries its real status.",
    url: siteUrl + "/products",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PingFyd" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.webp"],
    title: "Products: What Exists, What Is Being Built · PING",
    description: "What PING offers today, what is in development, and where the platform is headed. Honest labels, no vaporware: every product carries its real status.",
  },
};

const STATUS_ORDER: ProductStatus[] = ["available", "in-development", "future"];

const STATUS_DESCRIPTIONS: Record<ProductStatus, string> = {
  available: "You can engage with this today.",
  "in-development": "Real work is underway and documented on this site. Not sold as finished.",
  future: "Direction, not a promise date.",
};

function StatusBadge({ status }: { status: ProductStatus }) {
  const styles: Record<ProductStatus, string> = {
    available: "bg-green-500/10 text-green-600",
    "in-development": "bg-honey/10 text-honey-text",
    future: "bg-surface-muted text-text-muted",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function ProductCard({ product }: { product: Product }) {
  return (
    <article className="flex flex-col rounded-lg border border-border-soft bg-surface p-6">
      <div className="mb-3">
        <StatusBadge status={product.status} />
      </div>
      <h2 className="text-2xl font-bold text-text">{product.name}</h2>
      <p className="mt-1 font-medium text-text-muted">{product.tagline}</p>
      <p className="mt-3 flex-1 text-text-muted" style={{ lineHeight: "var(--leading-body)" }}>
        {product.summary}
      </p>

      {product.offers && (
        <div className="mt-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-text">What this includes</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-muted">
            {product.offers.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}

      {product.notOffers && (
        <div className="mt-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-text">What this is not</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-muted">
            {product.notOffers.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}

      {product.documented && (
        <div className="mt-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-text">Documented on this site</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-muted">
            {product.documented.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}

      {product.proof && (
        <p className="mt-4 rounded bg-surface-muted p-3 text-sm text-text-muted">
          <strong className="text-text">Proof point:</strong> {product.proof}
        </p>
      )}

      <Link
        href={product.cta.href}
        className="mt-5 font-semibold text-honey-text hover:underline"
      >
        {product.cta.label} →
      </Link>
    </article>
  );
}

export default function ProductsPage() {
  const products = getProducts();
  // ItemList in the exact order the page renders its groups: each item
  // is a product visibly listed below, named as the page names it, with
  // the URL the product's own call to action links to on this page.
  const orderedProducts = STATUS_ORDER.flatMap((status) =>
    products.filter((p) => p.status === status),
  );
  const itemListJsonLd = buildItemListJsonLd(
    orderedProducts.map((p) => ({ name: p.name, url: siteUrl + p.cta.href })),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-accent" style={{ letterSpacing: '0.12em' }}><span className="text-honey">Products</span></p>
            <h1 className="mt-4 font-display text-4xl font-bold text-primary sm:text-5xl" style={{ lineHeight: 'var(--leading-display)', letterSpacing: 'var(--tracking-display)' }}><span className="text-text-on-dark">What exists, what is being built</span></h1>
            <p className="mt-5 text-lg sm:text-xl text-text-muted" style={{ lineHeight: 'var(--leading-body)', letterSpacing: 'var(--tracking-body)' }}><span className="text-text-on-dark/90">
                Honest labels. Nothing here is vaporware and nothing unfinished
                is sold as finished. PingFyd is based in Grand Junction,
                Colorado, and works with businesses across Western Colorado.
              </span></p>
          </div>
        </Container>
      </Section>

      {STATUS_ORDER.map((status) => {
        const group = products.filter((p) => p.status === status);
        if (group.length === 0) return null;
        return (
          <Section key={status}>
            <Container className="max-w-4xl">
              <div className="mb-6 flex items-baseline gap-4">
                <h2 className="text-2xl font-bold text-text">{statusLabel(status)}</h2>
                <p className="text-sm text-text-muted">{STATUS_DESCRIPTIONS[status]}</p>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {group.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </Container>
          </Section>
        );
      })}

      <Section className="bg-surface">
        <Container className="max-w-4xl">
          <h2 className="text-2xl font-bold text-text">How to read this page</h2>
          <p className="mt-3 text-text-muted" style={{ lineHeight: "var(--leading-body)" }}>
            PingFyd is the consultancy: that is the business, and it is
            available now. The PING intelligence system is the infrastructure
            underneath, in active development and documented publicly as it is
            built. The AI concierge is that infrastructure applied to a single
            business, currently delivered through bespoke engagements. Websites
            on TenantOS, including this site as tenant one, are the platform
            direction. If you are a home service business, what matters today
            is the first item.
          </p>
        </Container>
      </Section>
      <Section>
        <Container className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-accent" style={{ letterSpacing: '0.12em' }}><span className="text-honey-text">Engage</span></p>
          <h2 className="mt-3 text-2xl font-bold text-text sm:text-3xl">Working with PingFyd</h2>
          <p className="mt-3 max-w-2xl text-text-muted" style={{ lineHeight: "var(--leading-body)" }}>
            Two steps, in order. The first is free, and it decides whether
            the second makes sense.
          </p>
          <div className="mt-10 grid md:grid-cols-2">
            <div className="md:pr-10">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-text">The conversation</h3>
              <p className="mt-4 text-4xl font-bold text-text">Free</p>
              <p className="mt-1 text-sm text-text-muted">One call about your business. No pitch, no obligation.</p>
              <ul className="mt-6 space-y-3">
                {[
                  "How your business actually runs today",
                  "Where opportunities get missed and follow-up lags",
                  "Whether automation honestly fits, and where",
                  "A clear next step, or a clear no",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5 text-[15px] text-text-muted">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-honey-text" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-8">
                <Link href="/faq" className="font-medium text-honey-text underline-offset-4 hover:underline">
                  How PingFyd works with a business
                </Link>
              </p>
            </div>
            <div className="mt-10 border-t border-border pt-10 md:mt-0 md:border-l md:border-t-0 md:pl-10 md:pt-0">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-text">The engagement</h3>
              <p className="mt-4 text-4xl font-bold text-text">Custom</p>
              <p className="mt-1 text-sm text-text-muted">Scoped and priced in writing before any work starts.</p>
              <p className="mt-6 text-sm font-medium text-text">Everything in the conversation, plus:</p>
              <ul className="mt-3 space-y-3">
                {[
                  "Workflow discovery inside your business, before anything is recommended",
                  "The automations that fit, implemented with you in control",
                  "Reliable inquiry capture, fast consistent response, follow-up that actually happens",
                  "Measurable value, or the engagement does not continue",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5 text-[15px] text-text-muted">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-honey-text" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-8">
                <Link href="/contact" className={cn(buttonVariants({ variant: "primary" }), "bg-honey text-honey-foreground shadow-warm hover:bg-honey-hover")}>
                  Begin with the free conversation
                </Link>
              </p>
            </div>
          </div>
          <p className="mt-10 border-t border-border pt-6 text-text-muted">The engagement now has published shape: three tiers, priced in the open, with the pricing logic next to the prices. <Link href="/tiers" className="font-medium text-honey-text underline-offset-4 hover:underline">See the tiers</Link></p>
        </Container>
      </Section>
      <FaqSection items={getFaqsByCategory("PING")} eyebrow="FAQ" title="Questions about the products" containerClassName="max-w-4xl" />
      <CTASection />
    </>
  );
}
