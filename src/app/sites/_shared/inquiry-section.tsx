import { catalogForSite } from "@/app/api/fyd/inquiry/catalog";
import { QuoteForm } from "@/app/quote-journey/_components/quote-form";

export function SiteInquirySection({
  siteId,
  businessName,
}: {
  siteId: string;
  businessName: string;
}) {
  const catalog = catalogForSite(siteId);
  if (catalog.length === 0) {
    return null;
  }
  return (
    <section id="inquiry" className="mx-auto w-full max-w-5xl px-6 py-12">
      <h2 className="text-2xl font-semibold">Request a quote</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Tell {businessName} about the job and get a durable receipt for your
        request.
      </p>
      <div className="mt-6 grid gap-4">
        {catalog.map((service) => (
          <div
            key={service.id}
            className="rounded-xl border bg-card p-5"
          >
            <h3 className="text-lg font-medium">{service.label}</h3>
            <QuoteForm
              siteId={siteId}
              serviceId={service.id}
              serviceLabel={service.label}
              startOpen
            />
          </div>
        ))}
      </div>
    </section>
  );
}
