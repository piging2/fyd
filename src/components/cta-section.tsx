import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Container, Section } from "@/components/section";
import { getTenant } from "@/lib/tenant-config";

/** Reusable call-to-action: drives to contact and technology. */
export function CTASection({
  title = "Talk to us about your business.",
  subtitle = "PING Social helps real businesses put AI to practical use: fewer missed opportunities, less busywork, systems that remember.",
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  const tenant = getTenant();
  return (
    <Section className="relative bg-surface-2">
      <div className="absolute inset-0 bg-gradient-to-br from-surface-2 via-surface to-surface-muted opacity-100" aria-hidden="true" />
      <Container className="relative z-10 flex flex-col items-center text-center">
        <h2 className="text-3xl font-bold text-primary sm:text-4xl" style={{ lineHeight: 'var(--leading-display)', letterSpacing: 'var(--tracking-display)' }}>
          {typeof title === 'string' ? title : title}
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-text" style={{ lineHeight: 'var(--leading-body)', letterSpacing: 'var(--tracking-body)' }}>{typeof subtitle === 'string' ? subtitle : subtitle}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/contact" className={cn(buttonVariants({ variant: "primary", size: "lg" }), "transition-transform duration-150 active:scale-[0.98]")}>
            Contact {tenant.operator.business}
          </Link>
          <Link href="/technology" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "transition-transform duration-150 active:scale-[0.98]")}>
            How PING works
          </Link>
        </div>
      </Container>
    </Section>
  );
}
