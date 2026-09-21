// DEMOTED: the full-page customer projection is an optional projection, not the product surface.
// The product primitive is the Circle. This page remains for the optional-projection lane and is
// not linked from normal navigation. The owner control plane (./manage) is unaffected.
/**
 * Object Node: the complete intelligent presence of one FYD object.
 *
 * This page belongs visually to the OBJECT (Happy Place Carpentry,
 * Coppersmith Plumbing), not to PING. No PING navigation, no PING footer,
 * no engineering language. Provenance stays underneath as a quiet
 * secondary disclosure.
 *
 * Everything on this page renders from the generic ObjectView projection.
 * There is no business-specific code here: HPP and Coppersmith flow
 * through exactly the same components.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Mail, MapPin, MessageCircleQuestion, Phone } from "lucide-react";
import { loadObjectView } from "@/fyd/object/view";
import { AskObjectPanel } from "@/fyd/ui/ask-object-panel";
import { WhyThis } from "@/fyd/ui/why-this";
import type { ObjectCapability, ObjectView } from "@/fyd/object/types";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ objectId: string }>;
}): Promise<Metadata> {
  const { objectId } = await params;
  const view = loadObjectView(objectId);
  if (!view) return { title: { absolute: "Object not found | FYD" }, robots: { index: false } };
  return {
    title: { absolute: view.name },
    description: view.summary.slice(0, 160),
    keywords: [view.category, ...view.services.map((s) => s.name)].filter(
      (k): k is string => k !== null,
    ),
    alternates: { canonical: `/o/${view.id}` },
    robots: { index: false },
    openGraph: {
      title: view.name,
      description: view.summary.slice(0, 160),
      url: `/o/${view.id}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: view.name,
      description: view.summary.slice(0, 160),
    },
  };
}

function ActionButtons({ view }: { view: ObjectView }) {
  const render = (cap: ObjectCapability, i: number) => {
    const cls =
      "inline-flex min-h-[48px] items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2";
    switch (cap.kind) {
      case "call":
        return (
          <a key={i} href={cap.href} className={cls + " bg-amber-700 text-white hover:bg-amber-800"}>
            <Phone className="h-5 w-5" aria-hidden="true" /> {cap.label}
          </a>
        );
      case "email":
        return (
          <a
            key={i}
            href={cap.href}
            className={cls + " border border-stone-300 bg-white text-stone-800 hover:bg-stone-100"}
          >
            <Mail className="h-5 w-5" aria-hidden="true" /> {cap.label}
          </a>
        );
      case "website":
        return (
          <a
            key={i}
            href={cap.href}
            target="_blank"
            rel="noreferrer"
            className={cls + " border border-stone-300 bg-white text-stone-800 hover:bg-stone-100"}
          >
            <ExternalLink className="h-5 w-5" aria-hidden="true" /> {cap.label}
          </a>
        );
      case "ask":
        return (
          <a
            key={i}
            href="#ask"
            className={cls + " border border-stone-300 bg-white text-stone-800 hover:bg-stone-100"}
          >
            <MessageCircleQuestion className="h-5 w-5" aria-hidden="true" /> Ask
          </a>
        );
      default:
        return null;
    }
  };
  const actions = view.capabilities.filter((c) => c.kind !== "view");
  if (actions.length === 0) return null;
  return <div className="mt-6 flex flex-wrap gap-3">{actions.map(render)}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-stone-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function ObjectNodePage({
  params,
}: {
  params: Promise<{ objectId: string }>;
}) {
  const { objectId } = await params;
  const view = loadObjectView(objectId);
  if (!view) notFound();

  const hero = view.media.find((m) => m.role === "hero" || m.role === "gallery");
  const logo = view.media.find((m) => m.role === "logo");
  const visibleServices = view.services.filter((s) => s.visible);
  const showLocality =
    view.contact.addressVisibility === "public" && view.contact.locality;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Minimal object-owned top bar. No PING chrome. */}
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {logo ? (
              <img src={logo.src} alt="" aria-hidden="true" className="h-8 w-8 rounded-full bg-white object-contain" />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-900"
              >
                {initials(view.name)}
              </span>
            )}
            <span className="truncate text-sm font-semibold">{view.name}</span>
          </div>
          <Link
            href={"/o/" + encodeURIComponent(view.id) + "/manage"}
            className="shrink-0 rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          >
            Owner demo <span className="ml-1 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-bold text-stone-600">DEV</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
        {/* Hero */}
        <div className="pt-8">
          {hero ? (
            <img
              src={hero.src}
              alt={hero.alt}
              className="h-56 w-full rounded-2xl object-cover sm:h-72"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-56 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 via-stone-200 to-stone-300 sm:h-72"
            >
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/70 text-3xl font-bold text-amber-900">
                {initials(view.name)}
              </span>
            </div>
          )}
          <p className="mt-5 text-sm font-medium uppercase tracking-widest text-amber-800">
            {[view.category, view.locationLabel].filter(Boolean).join(" · ")}
          </p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">{view.name}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-stone-700">{view.summary}</p>
          <ActionButtons view={view} />
        </div>

        {visibleServices.length > 0 && (
          <Section title="Services">
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleServices.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-3.5"
                >
                  <span className="text-base font-semibold">{s.name}</span>
                  <span className="mt-0.5 block text-xs text-stone-400" title={s.basisLabel}>
                    {s.basis === "owner" ? "Added by the owner" : "From the site data"}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {view.serviceArea.length > 0 && (
          <Section title="Service area">
            <ul className="flex flex-wrap gap-2">
              {view.serviceArea.map((a) => (
                <li
                  key={a}
                  className="inline-flex items-center gap-1.5 rounded-full bg-stone-200/70 px-3.5 py-1.5 text-sm font-medium text-stone-700"
                >
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {a}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="About">
          <p className="max-w-2xl text-base leading-relaxed text-stone-700">{view.summary}</p>
          <div className="mt-3">
            <WhyThis
              claim="Business description"
              steps={[
                { step: "Object field", detail: "description on " + view.schema },
                { step: "Evidence", detail: "Description text observed on the business website" },
                { step: "Source", detail: view.provenance.ref + " (observed " + view.provenance.derivedAt.slice(0, 10) + ")" },
              ]}
            />
          </div>
        </Section>

        <Section title="Contact">
          <dl className="max-w-2xl divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {view.contact.phone && (
              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <dt className="text-sm font-medium text-stone-500">Phone</dt>
                <dd>
                  <a href={"tel:" + view.contact.phone.replace(/\s/g, "")} className="text-base font-semibold text-amber-800 hover:underline">
                    {view.contact.phone}
                  </a>
                </dd>
              </div>
            )}
            {view.contact.email && (
              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <dt className="text-sm font-medium text-stone-500">Email</dt>
                <dd>
                  <a href={"mailto:" + view.contact.email} className="break-all text-base font-semibold text-amber-800 hover:underline">
                    {view.contact.email}
                  </a>
                </dd>
              </div>
            )}
            {view.contact.website && (
              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <dt className="text-sm font-medium text-stone-500">Website</dt>
                <dd>
                  <a href={view.contact.website} target="_blank" rel="noreferrer" className="text-base font-semibold text-amber-800 hover:underline">
                    {view.contact.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                </dd>
              </div>
            )}
            {showLocality ? (
              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <dt className="text-sm font-medium text-stone-500">Location</dt>
                <dd className="text-base font-semibold">{view.contact.locality}</dd>
              </div>
            ) : null}
          </dl>
          {view.contact.addressVisibility === "hidden" && (
            <p className="mt-2 text-xs text-stone-400">The owner has hidden the location.</p>
          )}
        </Section>

        <section id="ask" className="mt-10 scroll-mt-6">
          <h2 className="text-xl font-bold text-stone-900">Ask {view.name}</h2>
          <p className="mt-1 text-sm text-stone-500">
            Answers come only from what FYD can verify about this business.
          </p>
          <div className="mt-4">
            <AskObjectPanel
              siteId={view.id}
              objectName={view.name}
              sampleQuestions={view.sampleQuestions}
            />
          </div>
        </section>

        {/* Quiet provenance disclosure. Secondary, never dominant. */}
        <details className="mt-12 rounded-xl border border-stone-200 bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-stone-500">
            Where this information comes from
          </summary>
          <div className="mt-2 space-y-1.5 text-sm text-stone-600">
            <p>{view.provenance.label}.</p>
            <p>
              Observed {view.provenance.derivedAt.slice(0, 10)}. Services marked "From the site
              data" are read from the business's service records; services marked "Added by the owner"
              were added in the owner demo.
            </p>
            {view.ownerUpdatedAt && (
              <p>Owner updates applied {view.ownerUpdatedAt.slice(0, 10)} (demo).</p>
            )}
          </div>
        </details>
      </main>
    </div>
  );
}
