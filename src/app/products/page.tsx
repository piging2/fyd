import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { CTASection } from "@/components/cta-section";
import {
  getProducts,
  statusLabel,
  type Product,
  type ProductStatus,
} from "@/lib/products";

export const metadata: Metadata = {
  title: "Products",
  description:
    "What PING offers today, what is in development, and where the platform is headed. Honest labels, no vaporware.",
  alternates: { canonical: "/products" },
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
    "in-development": "bg-honey/10 text-honey",
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
        className="mt-5 font-semibold text-honey hover:underline"
      >
        {product.cta.label} →
      </Link>
    </article>
  );
}

export default function ProductsPage() {
  const products = getProducts();

  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow={<span className="text-honey">Products</span>}
            title={<span className="text-text-on-dark">What exists, what is being built</span>}
            description={
              <span className="text-text-on-dark/90">
                Honest labels. Nothing here is vaporware and nothing unfinished
                is sold as finished.
              </span>
            }
          />
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
            PING Social is the consultancy: that is the business, and it is
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
      <CTASection />
    </>
  );
}
