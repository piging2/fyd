"use client";

/**
 * HeroSection: the client boundary for the hero section.
 *
 * renderer.tsx is imported by server-only routes (e.g. the FYD customize API
 * route) and must stay a server module, so it cannot own React state. This
 * small client component owns the ONLY hero state that exists: whether the
 * photographic hero media has failed to load.
 *
 * Generic failure boundary (no URL, tenant, or customer conditions): when
 * EITHER the main hero image OR the blur placeholder fails (onError is wired
 * on both <img>s to the same latch), the entire photo block is removed and
 * the section falls back to the existing typographic hero treatment
 * (token-derived accent wash, data-hero-treatment="typographic"). No
 * replacement imagery is ever substituted; media selection stays out of
 * scope.
 *
 * The server renderer resolves all hero data (heading, copy, actions,
 * heroMedia) and passes the text/actions block as server-rendered children,
 * so no graph, context, or callbacks cross the server/client boundary. Only
 * serializable props cross: hero (DisplayMedia|null), theme tokens, the
 * character string, and children.
 */

import { useState, type ReactNode } from "react";
import type { DisplayMedia } from "../media/select";
import type { FYDThemeTokens } from "../sitespec/types";
import { WhyThis, type EvidenceStep } from "../ui/why-this";

/**
 * Selection rule for hero media, kept as a pure export for node-based unit
 * tests: the threaded-through media wins when present; null/undefined
 * selects nothing (the honest typographic hero). No tenant or URL
 * conditions; the renderer never selects media itself.
 */
export function effectiveHeroMedia(
  input: DisplayMedia | null | undefined,
): DisplayMedia | null {
  return input ?? null;
}

/**
 * Contextual provenance for the hero photo: the generic WhyThis drill-down
 * fed ONLY with the media's own provenance fields. No invented copy; steps
 * with empty values are omitted, and WhyThis renders nothing at all when
 * the lineage is empty.
 */
function HeroMediaWhyThis({ media }: { media: DisplayMedia }) {
  const steps: EvidenceStep[] = [];
  if (media.sourceUrl) {
    steps.push({
      step: "Photo source",
      detail: media.sourceUrl,
      state: "observed",
    });
  }
  if (media.rightsBasis) {
    steps.push({
      step: "Rights basis",
      detail: media.rightsBasis,
      // Policy inference, not an observation: classifyRights is a URL
      // heuristic with no authorization evidence (QA-TRUTH F-002).
      state: "inferred",
    });
  }
  if (media.observedAt) {
    steps.push({
      step: "Observed",
      detail: media.observedAt,
      state: "observed",
    });
  }
  if (media.digest) {
    steps.push({
      step: "Content digest",
      detail: media.digest.slice(0, 16) + "...",
      state: "inferred",
    });
  }
  return (
    <WhyThis
      claim={media.alt || "Hero photo"}
      steps={steps}
      className="[&_summary]:text-white"
    />
  );
}

/**
 * The photographic block. Pure (no hooks): renders the photo block or
 * nothing, so node-based tests can drive the failure transition directly by
 * invoking the wired onError handlers. HeroSection owns the state and
 * passes it in.
 */
export function HeroPhotoBlock({
  hero,
  failed,
  onMediaError,
}: {
  hero: DisplayMedia | null;
  failed: boolean;
  onMediaError: () => void;
}) {
  if (!hero || failed) return null;
  return (
    <div
      className="relative h-64 w-full overflow-hidden sm:h-80"
      data-hero-media={hero.id}
    >
      {hero.blurUrl ? (
        <img
          src={hero.blurUrl}
          alt=""
          aria-hidden="true"
          onError={onMediaError}
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
        />
      ) : null}
      <img
        src={hero.src}
        alt={hero.alt}
        width={hero.width}
        height={hero.height}
        loading="eager"
        onError={onMediaError}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-1">
        <HeroMediaWhyThis media={hero} />
      </div>
    </div>
  );
}

export function HeroSection({
  hero,
  theme,
  character,
  children,
}: {
  hero: DisplayMedia | null;
  theme: FYDThemeTokens;
  character: string;
  children: ReactNode;
}) {
  // The only client state in the hero: a failed image can never recover
  // (no retry affordance exists), so a boolean latch is sufficient. Either
  // <img> failing trips the same latch and removes the whole block.
  const [mediaFailed, setMediaFailed] = useState(false);
  const showPhoto = hero !== null && !mediaFailed;
  return (
    <section
      className="w-full"
      data-motion="hero-settle"
      data-layout-character={character}
      data-hero-treatment={showPhoto ? "photo" : "typographic"}
      // VQ-004: designed no-media hero treatment. When the media stage has no
      // acquired photo for this business (hookup: page.tsx heroMediaFor ->
      // SiteClient prop -> ctx.heroMedia), the slab is not a flat empty panel:
      // a deterministic token-derived accent wash. No images, no invented
      // content; photo heroes are untouched. A failed photo degrades to this
      // same treatment through the error latch above.
      style={{
        background: showPhoto
          ? theme.ink
          : "linear-gradient(160deg, " +
            theme.ink +
            " 55%, color-mix(in srgb, " +
            theme.accent +
            " 16%, " +
            theme.ink +
            "))",
      }}
    >
      <HeroPhotoBlock
        hero={hero}
        failed={mediaFailed}
        onMediaError={() => setMediaFailed(true)}
      />
      {children}
    </section>
  );
}
