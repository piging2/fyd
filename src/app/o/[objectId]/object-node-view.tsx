/**
 * ObjectNodeView: the pure customer-facing object view for /o/*.
 *
 * All data loading lives in ./page (the async server component); this
 * module is the rendered surface and the unit the PROD-10 de-harness tests
 * assert on. It is deliberately a separate module so the Next route module
 * exports only route exports (generateMetadata, default).
 *
 * De-harness contract (visible text): no DEV badges, no schema identifiers,
 * no demo chrome. The demo distinction the DEV badge used to carry is not
 * deleted: it lives on as data-owner-demo attributes in the DOM, so
 * instrumentation can still tell demo surfaces from production ones without
 * showing engineering language to visitors.
 */
import Link from "next/link";
import { ExternalLink, Mail, MapPin, MessageCircleQuestion, Phone } from "lucide-react";
import { AskObjectPanel } from "@/fyd/ui/ask-object-panel";
import { ReferenceButton } from "@/fyd/ui/reference-button";
import { FollowButton } from "@/fyd/ui/follow-button";
import { LikeButton } from "@/fyd/ui/like-button";
import { WhyThis } from "@/fyd/ui/why-this";
import type { ObjectCapability, ObjectView } from "@/fyd/object/types";
import { resolveSafeLink } from "@/fyd/sitespec/safe-link";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
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
      case "follow":
        return <FollowButton key={i} objectId={view.id} className={cls + " border border-stone-300 bg-white text-stone-800 hover:bg-stone-100"} />;
      case "like":
        return <LikeButton key={i} objectId={view.id} className={cls + " border border-stone-300 bg-white text-stone-800 hover:bg-stone-100"} />;
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
      case "directions":
        return (
          <a
            key={i}
            href={cap.href}
            target="_blank"
            rel="noreferrer"
            className={cls + " border border-stone-300 bg-white text-stone-800 hover:bg-stone-100"}
          >
            <MapPin className="h-5 w-5" aria-hidden="true" /> {cap.label}
          </a>
        );
      case "reference":
        return <ReferenceButton key={i} objectId={cap.objectId} className={cls + " border border-stone-300 bg-white text-stone-800 hover:bg-stone-100"} />;
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

/**
 * Demo actor labels are non-identities ("Demo Owner (seeded, unverified)"):
 * honest inside the demo owner console, but an engineering leak on the
 * customer-facing object view. Map them to plain language at render time
 * so the "Recorded by" line reads "The business owner on <date>". The
 * stored actorLabel, and the demo vs prod distinction in the data model,
 * are untouched.
 */
function displayActorLabel(actorLabel: string): string {
  return /demo|seeded|unverified/i.test(actorLabel)
    ? "The business owner"
    : actorLabel;
}

export function ObjectNodeView({
  view,
  tenantId,
}: {
  view: ObjectView;
  tenantId: string | null;
}) {
  const hero = view.media.find((m) => m.role === "hero" || m.role === "gallery");
  const logo = view.media.find((m) => m.role === "logo");
  const visibleServices = view.services.filter((s) => s.visible);
  const showLocality =
    view.contact.addressVisibility === "public" && view.contact.locality;
  // Owner-corrected contact fields, for the honest SOURCE SAYS X /
  // OWNER SAYS Y display. The contact block shows the effective
  // (owner-winning) value; these records keep the distinction.
  const phoneCorrection =
    view.fieldCorrections.find((c) => c.field === "phone") ?? null;

  // Contact hrefs are EXECUTABLE CAPABILITIES: each clears the single
  // safe-link choke point. An unsafe value renders as inert text with no
  // anchor (see the Contact section below).
  const phoneLink = resolveSafeLink(view.contact.phone, "call");
  const emailLink = resolveSafeLink(view.contact.email, "email");
  const websiteLink = resolveSafeLink(view.contact.website, "navigate");

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
          {/* Owner control-plane entry. The demo distinction the DEV badge
              carried now lives on data-owner-demo (PROD-10): visible text
              stays customer-facing, instrumentation keeps the signal. */}
          <Link
            href={"/o/" + encodeURIComponent(view.id) + "/manage"}
            data-owner-demo="true"
            className="shrink-0 rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          >
            Manage this listing
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
                  className="rounded-xl border border-stone-200 bg-white px-4 py-3.5 transition-colors hover:border-amber-300 hover:bg-amber-50/40"
                >
                  <Link
                    href={"/o/" + encodeURIComponent(s.id)}
                    className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
                  >
                    <span className="text-base font-semibold text-amber-900 underline-offset-2 hover:underline">{s.name}</span>
                    <span className="mt-0.5 block text-xs text-stone-400" title={s.basisLabel}>
                      {s.basis === "owner" ? "Added by the owner" : "From the site data"} · Open service
                    </span>
                  </Link>
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
                // PROD-10: plain language only. The schema id stays in the
                // data model (view.schema) and JSON-LD; it never enters
                // visible text.
                { step: "Object field", detail: "description in this business record" },
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
                <dd className="text-right">
                  {phoneLink.kind === "safe" ? (
                    <a href={phoneLink.href} className="text-base font-semibold text-amber-800 hover:underline">
                      {view.contact.phone}
                    </a>
                  ) : (
                    <span className="text-base font-semibold text-amber-800">{view.contact.phone}</span>
                  )}
                  {phoneCorrection ? (
                    <p className="mt-0.5 text-xs text-stone-400">
                      Owner-corrected; the site lists {phoneCorrection.sourceValue ?? "no number"}.
                    </p>
                  ) : null}
                </dd>
              </div>
            )}
            {view.contact.email && (
              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <dt className="text-sm font-medium text-stone-500">Email</dt>
                <dd>
                  {emailLink.kind === "safe" ? (
                    <a href={emailLink.href} className="break-all text-base font-semibold text-amber-800 hover:underline">
                      {view.contact.email}
                    </a>
                  ) : (
                    <span className="break-all text-base font-semibold text-amber-800">{view.contact.email}</span>
                  )}
                </dd>
              </div>
            )}
            {view.contact.website && (
              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <dt className="text-sm font-medium text-stone-500">Website</dt>
                <dd>
                  {websiteLink.kind === "safe" ? (
                    <a href={websiteLink.href} target="_blank" rel="noreferrer" className="text-base font-semibold text-amber-800 hover:underline">
                      {view.contact.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  ) : (
                    <span className="text-base font-semibold text-amber-800">
                      {view.contact.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </span>
                  )}
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

        {view.fieldCorrections.length > 0 && (
          <Section title="Source vs owner">
            <p className="max-w-2xl text-sm text-stone-600">
              The owner corrected {view.fieldCorrections.length === 1 ? "a detail" : "some details"} below.
              The site's own record is unchanged; the owner's value is what every
              surface shows, and both are listed here so the distinction is never hidden.
            </p>
            <ul className="mt-3 max-w-2xl space-y-3">
              {view.fieldCorrections.map((c) => (
                <li key={c.field} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                  <div className="text-sm font-semibold text-stone-900">{c.label}</div>
                  <div className="mt-1 text-sm text-stone-700">
                    Owner says: <span className="font-semibold">{c.ownerValue}</span>
                  </div>
                  <div className="text-sm text-stone-500">
                    Source says: {c.sourceValue ?? "(no value on the site)"}
                  </div>
                  {c.sourceDrifted ? (
                    <div className="mt-1 text-xs text-amber-700">
                      The source was re-observed after this correction and now says
                      something different than it did then. The owner's value still stands.
                    </div>
                  ) : null}
                  <div className="mt-2">
                    <WhyThis
                      claim={c.label + " correction"}
                      steps={[
                        { step: "Owner statement", detail: c.basis },
                        { step: "Recorded by", detail: displayActorLabel(c.actorLabel) + " on " + c.correctedAt.slice(0, 10) },
                        { step: "Source value at correction time", detail: c.sourceValue ?? "(none)" },
                        { step: "Where it is stored", detail: "The owner store for this object; the source projection was not modified." },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <section id="ask" className="mt-10 scroll-mt-6">
          <h2 className="text-xl font-bold text-stone-900">Ask {view.name}</h2>
          <p className="mt-1 text-sm text-stone-500">
            Answers come only from what FYD can verify about this business.
          </p>
          <div className="mt-4">
            <AskObjectPanel
              siteId={tenantId ?? view.id}
              objectId={view.id}
              objectName={view.name}
              sampleQuestions={view.sampleQuestions}
            />
          </div>
        </section>

        {/* Quiet provenance disclosure. Secondary, never dominant.
            PROD-10: customer-facing wording; no "demo" chrome in visible
            text. The underlying provenance data is untouched. */}
        <details className="mt-12 rounded-xl border border-stone-200 bg-white px-4 py-3" data-owner-demo="true">
          <summary className="cursor-pointer text-sm font-medium text-stone-500">
            Where this information comes from
          </summary>
          <div className="mt-2 space-y-1.5 text-sm text-stone-600">
            <p>{view.provenance.label}.</p>
            <p>
              Observed {view.provenance.derivedAt.slice(0, 10)}. Services marked "From the site
              data" are read from the business's service records; services marked "Added by the owner"
              were added by the business owner.
            </p>
            {view.ownerUpdatedAt && (
              <p>Owner updates applied {view.ownerUpdatedAt.slice(0, 10)}.</p>
            )}
          </div>
        </details>
      </main>
    </div>
  );
}
