/**
 * Representative business page fixture for the rail placement harness.
 *
 * The "website canvas": a hero band, a primary content column (centered,
 * max-width 1200px, the customer's content area), and content sections
 * (services, about, contact). Every business fact below comes from the
 * real object graph (buildCircleProjection / the ingestion fixtures);
 * nothing is invented for the fixture.
 *
 * The hero and the first major section carry data-ping-object="<id>"
 * semantic anchors. The fixture is visibly labeled so nobody mistakes
 * it for the business's real site.
 */

export interface FixtureBusiness {
  id: string;
  name: string;
  category: string;
  location: string;
  description: string;
  services: string[];
  phone: string;
  phoneHref: string;
  email?: string;
  emailHref?: string;
  website: string;
  websiteHref: string;
  hours?: string;
}

/**
 * Business facts grounded in the FYD object graph (pulled via tsx from
 * buildCircleProjection and the ingestion fixtures on 2026-09-21).
 */
export function fixtureFor(id: string): FixtureBusiness | null {
  if (id === "happy-place") {
    return {
      id,
      name: "Happy Place Carpentry LLC",
      category: "Carpentry",
      location: "Adair Village, OR, US",
      description:
        "Licensed Oregon carpentry contractor (CCB# 254240) building decks, fences, pergolas, bathrooms, and custom work across Benton, Linn, Marion and Polk Counties.",
      services: [
        "Decks",
        "Fences",
        "Pergolas",
        "Bathroom remodels",
        "Custom carpentry",
      ],
      phone: "+1 (541) 286-5190",
      phoneHref: "tel:+15412865190",
      email: "taylor@happyplacecarpentry.com",
      emailHref: "mailto:taylor@happyplacecarpentry.com",
      website: "happyplacecarpentry.com",
      websiteHref: "https://happyplacecarpentry.com",
    };
  }
  if (id === "coppersmith-plumbing") {
    return {
      id,
      name: "Coppersmith Plumbing - HVAC - Mechanical",
      category: "Plumbing, HVAC, Mechanical",
      location: "Grand Junction, Colorado, 81501, United States",
      description:
        "Coppersmith Plumbing and HVAC has serviced Western Colorado for over 25 years, with a proven track record of quality work and diverse skill sets.",
      services: ["Plumbing", "HVAC", "Mechanical"],
      phone: "970-245-3869",
      phoneHref: "tel:970-245-3869",
      website: "coppersmithplumbing.com",
      websiteHref: "https://coppersmithplumbing.com",
      hours: "Mon to Fri, 7:30 AM to 4:00 PM",
    };
  }
  return null;
}

export function FixtureHero({ fixture }: { fixture: FixtureBusiness }) {
  return (
    <header
      data-ping-object={fixture.id}
      className="bg-neutral-900 text-white"
    >
      <div className="mx-auto w-full max-w-[1200px] px-6 py-16 sm:py-24">
        <p className="mb-4 inline-block rounded border border-amber-400/60 px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-amber-300">
          Representative placement fixture
        </p>
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
          {fixture.category} - {fixture.location}
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold sm:text-5xl">
          {fixture.name}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-neutral-300">
          {fixture.description}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={fixture.phoneHref}
            className="inline-flex h-12 items-center justify-center rounded-full bg-amber-400 px-8 font-semibold text-neutral-900"
          >
            Call {fixture.phone}
          </a>
          <a
            href={fixture.websiteHref}
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 px-8 font-semibold text-white"
          >
            Visit website
          </a>
        </div>
      </div>
    </header>
  );
}

export function FixtureContent({ fixture }: { fixture: FixtureBusiness }) {
  return (
    <main id="rail-content" className="mx-auto w-full max-w-[1200px] px-6">
      <section
        data-ping-object={fixture.id}
        aria-label="Services"
        className="py-14"
      >
        <h2 className="text-3xl font-bold">Services</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fixture.services.map((s) => (
            <div
              key={s}
              className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
            >
              <h3 className="text-lg font-semibold">{s}</h3>
              <p className="mt-2 text-sm text-neutral-600">
                Ask {fixture.name} about {s.toLowerCase()} for your project.
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="About" className="border-t border-neutral-200 py-14">
        <h2 className="text-3xl font-bold">About</h2>
        <p className="mt-4 max-w-3xl text-lg text-neutral-700">
          {fixture.description}
        </p>
        <p className="mt-3 max-w-3xl text-sm text-neutral-500">
          Business facts shown are from the FYD object graph (website
          ingestion). This page is a representative fixture for placement
          testing, not the business&apos;s real website.
        </p>
      </section>

      <section aria-label="Contact" className="border-t border-neutral-200 py-14">
        <h2 className="text-3xl font-bold">Contact</h2>
        <dl className="mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <dt className="font-mono text-xs uppercase tracking-widest text-neutral-500">
              Phone
            </dt>
            <dd className="mt-1">
              <a href={fixture.phoneHref} className="font-semibold">
                {fixture.phone}
              </a>
            </dd>
          </div>
          {fixture.email && (
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <dt className="font-mono text-xs uppercase tracking-widest text-neutral-500">
                Email
              </dt>
              <dd className="mt-1">
                <a href={fixture.emailHref} className="font-semibold">
                  {fixture.email}
                </a>
              </dd>
            </div>
          )}
          <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <dt className="font-mono text-xs uppercase tracking-widest text-neutral-500">
              Website
            </dt>
            <dd className="mt-1">
              <a href={fixture.websiteHref} className="font-semibold">
                {fixture.website}
              </a>
            </dd>
          </div>
          {fixture.hours && (
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <dt className="font-mono text-xs uppercase tracking-widest text-neutral-500">
                Hours
              </dt>
              <dd className="mt-1 font-semibold">{fixture.hours}</dd>
            </div>
          )}
        </dl>
      </section>
    </main>
  );
}

export function FixtureFooter({ fixture }: { fixture: FixtureBusiness }) {
  return (
    <footer className="bg-neutral-900 text-neutral-400">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-10 text-sm">
        <p className="font-semibold text-neutral-200">{fixture.name}</p>
        <p className="mt-1">
          {fixture.location} - {fixture.phone}
        </p>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-widest">
          Representative placement fixture
        </p>
      </div>
    </footer>
  );
}
