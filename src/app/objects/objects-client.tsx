/**
 * ObjectsClient: the /objects page layout.
 *
 * A quiet stage (short heading, one-line explanation) plus the persistent
 * identity-object rail:
 * - Desktop (>=720px): sticky right rail with the two IdentityObjects
 *   stacked. The rail is an in-flow sticky column, so the portal-rail
 *   invariants hold by construction: zero overlap with content, zero
 *   horizontal overflow, no measured-margin fragility.
 * - Mobile (<720px): the rail collapses to an in-flow horizontal tray at
 *   the top of the page (never an overlay, never a squeezed hover card).
 *   Tap opens the bottom sheet.
 */

"use client";

import { IdentityObject, type ObjectHandle } from "@/fyd/ui/identity-object";

export function ObjectsClient({ objects }: { objects: ObjectHandle[] }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      {/* Mobile tray: in-flow, horizontal, at the top. */}
      {objects.length > 0 ? (
        <div className="mb-8 min-[720px]:hidden">
          <div className="flex items-start gap-6 overflow-x-auto pb-2">
            {objects.map((o) => (
              <div key={o.siteId} className="shrink-0">
                <IdentityObject handle={o} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-start gap-8">
        <main className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-purple-700">
            PING objects
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">
            Live identity objects
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-stone-600">
            Two businesses from the PING graph, as compact identity objects.
            Hover or tap a circle to expand it. Everything inside comes from
            that business&apos;s own graph, with its evidence attached. Nothing
            here is generated or guessed.
          </p>

          <section className="mt-8 max-w-2xl" aria-label="About this surface">
            <h2 className="text-sm font-semibold text-stone-800">
              What you are looking at
            </h2>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-stone-600">
              <li>
                Each circle is one business. Its face is the business&apos;s
                own logo where the media rights gate authorized it, otherwise
                a deterministic gradient with initials.
              </li>
              <li>
                The expansion shows identity, key facts, and relationships
                grouped by kind: services, people, external identities, and
                location. Services open as objects of their own.
              </li>
              <li>
                Ask FYD answers only from the object&apos;s record and says
                when the evidence is missing. Open Node takes you to the full
                object page.
              </li>
            </ul>
          </section>

          {objects.length === 0 ? (
            <p className="mt-8 text-sm text-stone-500" role="status">
              No object projections are available right now.
            </p>
          ) : null}
        </main>

        {/* Desktop rail: sticky, in-flow, zero overlap by construction. */}
        {objects.length > 0 ? (
          <aside
            aria-label="Identity objects"
            className="hidden w-28 shrink-0 min-[720px]:block"
          >
            <div className="sticky top-24 flex flex-col items-center gap-10">
              {objects.map((o) => (
                <IdentityObject key={o.siteId} handle={o} />
              ))}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
