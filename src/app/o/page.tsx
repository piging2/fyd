// DEMOTED: the full-page customer projection is an optional projection, not the product surface.
// The product primitive is the Circle. This page remains for the optional-projection lane and is
// not linked from normal navigation.
/**
 * FYD objects index.
 *
 * One object, many projections: each object appears here as its Circle
 * (inline reference -> expanded preview -> Node). No PING marketing chrome;
 * this page is the object directory.
 */

import type { Metadata } from "next";
import { loadObjectView, listObjectIds } from "@/fyd/object/view";
import { getVerifiedPublicProjectionSync } from "@/fyd/data/ping-object-source";
import { ObjectCircle } from "@/fyd/ui/object-circle";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Objects | FYD" },
  description: "FYD business objects.",
  alternates: { canonical: "/o" },
  robots: { index: false },
};

export default function ObjectsIndexPage() {
  // Every view is composed over the verified public projection (Q-C-01).
  const views = listObjectIds()
    .map((id) => {
      try {
        return loadObjectView(
          getVerifiedPublicProjectionSync(id, "anonymous"),
          id,
        );
      } catch {
        return null;
      }
    })
    .filter((v) => v !== null);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <p className="text-sm font-medium uppercase tracking-widest text-amber-800">FYD</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Objects</h1>
        <p className="mt-2 max-w-xl text-base text-stone-600">
          Each business FYD understands is an object. Hover or tap to preview it, then open its
          full presence.
        </p>
        <div className="mt-8 space-y-4">
          {views.map((view) => (
            <ObjectCircle key={view!.id} view={view!} />
          ))}
        </div>
        <p className="mt-10 text-xs text-stone-400">
          Demo surface. Object data is observed from public business websites.
        </p>
      </main>
    </div>
  );
}
