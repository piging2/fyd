import Link from "next/link";
import type { Metadata } from "next";
import { Container, Section } from "@/components/section";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PingWordmark } from "@/components/ping-wordmark";


export const metadata: Metadata = {
  title: "Page Not Found | PingFyd",
  description: "That page does not exist, or it moved. Head back to the PingFyd home page or see how PING works.",
};

export default function NotFound() {
  return (
    <Section className="bg-surface-muted">
      <Container className="text-center">
        <div className="mb-8 flex items-center justify-center gap-3">
          <PingWordmark />
        </div>
        <p className="text-6xl font-bold text-primary dark:text-honey-text">404</p>
        <h1 className="mt-4 text-3xl font-bold text-text">Page not found</h1>
        <p className="mt-3 text-text-muted">That page does not exist, or it moved. Let&apos;s get you back on track.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className={cn(buttonVariants({ variant: "primary", size: "lg" }))}>Go home</Link>
          <Link href="/technology" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>How PING works</Link>
        </div>
      </Container>
    </Section>
  );
}
