"use client";

/**
 * HeroSection: the client boundary for the hero section.
 *
 * RENDER-WIRE full-bleed photographic hero: the photo fills the section
 * edge to edge (min 75svh, up through 88svh on large viewports) with the
 * copy column overlaid. A localized AA scrim (hero-scrim.ts: computed from
 * the theme's light text token against a worst-case white photo) keeps the
 * copy at 4.5:1 anywhere on the image; the manifest focal point steers
 * object-position so the subject survives the crop, including the narrow
 * mobile crop.
 *
 * renderer.tsx is imported by server-only routes (e.g. the FYD customize API
 * route) and must stay a server module, so it cannot own React state. This
 * small client component owns the ONLY hero state that exists: whether the
 * photographic hero media has failed to load.
 *
 * Generic failure boundary (no URL, tenant, or customer conditions): when
 * EITHER the main hero image OR the blur placeholder fails (onError is wired
 * on both <img>s to the same latch), the entire photo block is removed and
 * the section falls back to the designed typographic hero treatment
 * (token-derived accent wash, data-hero-treatment="typographic"). A mount
 * check covers the hydration race (fast 404s fire error events before React
 * attaches onError); refs are threaded through the pure HeroPhotoBlock so
 * node-based tests keep driving it directly. No replacement imagery is ever
 * substituted; media selection stays out of scope.
 *
 * The server renderer resolves all hero data (heading, copy, actions,
 * heroMedia, and the manifest focal point attached to the hero media by the
 * page seam) and passes the text/actions block as server-rendered children,
 * so no graph, context, or callbacks cross the server/client boundary. Only
 * serializable props cross: hero (DisplayMedia|null), theme tokens, the
 * character string, and children.
 */

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import type { DisplayMedia } from "../media/select";
import type { RenderViewerKind } from "../sitespec/render-projection";
import type { FYDThemeTokens } from "../sitespec/types";
import { WhyThis, type EvidenceStep } from "../ui/why-this";
import {
  heroFocalPointOf,
  heroScrimBackground,
  minScrimOpacityForAa,
} from "./hero-scrim";

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
 * Hydration-race detector, kept pure for node-based unit tests: an <img>
 * that finished loading (complete) but decoded zero intrinsic pixels
 * (naturalWidth === 0) has failed. Images still in flight report
 * complete === false and are left to the wired onError handlers.
 */
export function imageAlreadyFailed(
  img: { complete: boolean; naturalWidth: number } | null | undefined,
): boolean {
  return !!img && img.complete && img.naturalWidth === 0;
}

/**
 * Contextual provenance for the hero photo: the generic WhyThis drill-down
 * fed ONLY with the media's own provenance fields. No invented copy; steps
 * with empty values are omitted, and WhyThis renders nothing at all when
 * the lineage is empty.
 */
function HeroMediaWhyThis({
  media,
  viewerKind,
}: {
  media: DisplayMedia;
  viewerKind?: RenderViewerKind;
}) {
  if (viewerKind !== "engineer") return null;
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
      viewerKind={viewerKind}
    />
  );
}

/**
 * The photographic background block. Pure (no hooks): renders the
 * full-bleed photo layer or nothing, so node-based tests can drive the
 * failure transition directly by invoking the wired onError handlers.
 * HeroSection owns the state and passes it in.
 *
 * The images are presentation (the copy column carries the content), so
 * both are aria-hidden with empty alt. The manifest focal point steers
 * object-position; absent or malformed, the photo centers.
 */
export function HeroPhotoBlock({
  hero,
  failed,
  onMediaError,
  mainRef,
  blurRef,
  viewerKind,
}: {
  hero: DisplayMedia | null;
  failed: boolean;
  onMediaError: () => void;
  mainRef?: Ref<HTMLImageElement>;
  blurRef?: Ref<HTMLImageElement>;
  viewerKind?: RenderViewerKind;
}) {
  if (!hero || failed) return null;
  const focal = heroFocalPointOf(hero);
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      data-hero-media={hero.id}
      aria-hidden="true"
    >
      {hero.blurUrl ? (
        <img
          ref={blurRef}
          src={hero.blurUrl}
          alt=""
          onError={onMediaError}
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
        />
      ) : null}
      <img
        ref={mainRef}
        src={hero.src}
        alt=""
        width={hero.width}
        height={hero.height}
        loading="eager"
        onError={onMediaError}
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          objectPosition: focal
            ? `${(focal.x * 100).toFixed(1)}% ${(focal.y * 100).toFixed(1)}%`
            : "50% 50%",
        }}
      />
      <div className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-1">
        <HeroMediaWhyThis media={hero} viewerKind={viewerKind} />
      </div>
    </div>
  );
}

export function HeroSection({
  hero,
  theme,
  character,
  children,
  viewerKind,
}: {
  hero: DisplayMedia | null;
  theme: FYDThemeTokens;
  character: string;
  children: ReactNode;
  viewerKind?: RenderViewerKind;
}) {
  // The only client state in the hero: a failed image can never recover
  // (no retry affordance exists), so a boolean latch is sufficient. Either
  // <img> failing trips the same latch and removes the whole block.
  const [mediaFailed, setMediaFailed] = useState(false);
  const mainRef = useRef<HTMLImageElement>(null);
  const blurRef = useRef<HTMLImageElement>(null);
  const showPhoto = hero !== null && !mediaFailed;
  // Hydration race: a fast 404 fires the img error event before React
  // attaches onError, so the event is lost and the latch never trips.
  // On mount, check both images for an already-failed state and trip the
  // same latch. Images still in flight are left to the wired onError.
  useEffect(() => {
    if (
      imageAlreadyFailed(mainRef.current) ||
      imageAlreadyFailed(blurRef.current)
    ) {
      setMediaFailed(true);
    }
  }, []);
  // AA scrim alpha for the light hero copy (the text-background token,
  // near-white). The copy column is server-rendered children; the scrim is
  // the only hero-owned layer that touches their legibility.
  const scrimAlpha = showPhoto ? minScrimOpacityForAa() : 0;
  return (
    <section
      className="relative w-full overflow-hidden"
      data-motion="hero-settle"
      data-layout-character={character}
      data-hero-treatment={showPhoto ? "photo" : "typographic"}
      // VQ-004: designed no-media hero treatment. When the media stage has no
      // acquired photo for this business (hookup: page.tsx heroMediaFor ->
      // SiteClient prop -> ctx.heroMedia), the slab is not a flat empty panel:
      // a deterministic token-derived accent wash. Photo heroes sit on the
      // ink token while the image loads. A failed photo degrades to the wash
      // through the error latch above.
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
      {showPhoto ? (
        <>
          <HeroPhotoBlock
            hero={hero}
            viewerKind={viewerKind}
            failed={mediaFailed}
            onMediaError={() => setMediaFailed(true)}
            mainRef={mainRef}
            blurRef={blurRef}
          />
          {/* Localized AA scrim: hero-scoped, computed, no hand-picked
              opacity. The bottom deepening sits under the copy column. */}
          <div
            className="absolute inset-0"
            aria-hidden="true"
            style={{ background: heroScrimBackground(scrimAlpha) }}
          />
        </>
      ) : null}
      {/* Copy column over the photo: the container token caps the measure
          at 1280px; the column itself stays narrow for the display type.
          75/82/88svh minimum heights across breakpoints (HPP target). */}
      <div
        className="fyd-safe-area relative z-10 mx-auto flex min-h-[75svh] w-full items-center px-4 py-20 sm:min-h-[82svh] sm:px-6 sm:py-28 lg:min-h-[88svh]"
        style={{ maxWidth: "var(--fyd-container-max, 80rem)" }}
      >
        {children}
      </div>
    </section>
  );
}
