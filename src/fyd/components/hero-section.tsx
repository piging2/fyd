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
 * (token-derived accent wash, data-hero-treatment="typographic"). A mount
 * check covers the hydration race (fast 404s fire error events before React
 * attaches onError); refs are threaded through the pure HeroPhotoBlock so
 * node-based tests keep driving it directly. No replacement imagery is ever
 * substituted; media selection stays out of scope.
 *
 * The server renderer resolves all hero data (heading, copy, actions,
 * heroMedia) and passes the text/actions block as server-rendered children,
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
import type { FYDThemeTokens } from "../sitespec/types";
import { WhyThis, mediaWhyThisSteps } from "../ui/why-this";

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
 * fed ONLY with the media's own provenance fields, in plain language
 * (PROD-5/PROD-6). No invented copy; steps with empty values are omitted,
 * and WhyThis renders nothing at all when the lineage is empty. The raw
 * technical values (digest, observedAt) live in non-visible data-media-*
 * attributes on the photo block; the visible caption is the photo's human
 * description (media.alt), rendered by HeroPhotoBlock.
 */
function HeroMediaWhyThis({ media }: { media: DisplayMedia }) {
  return (
    <WhyThis
      claim={media.alt || "Hero photo"}
      steps={mediaWhyThisSteps(media)}
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
  mainRef,
  blurRef,
}: {
  hero: DisplayMedia | null;
  failed: boolean;
  onMediaError: () => void;
  mainRef?: Ref<HTMLImageElement>;
  blurRef?: Ref<HTMLImageElement>;
}) {
  if (!hero || failed) return null;
  // PROD-5 (2026-09-27): the visible caption is the photo's human
  // description, never rights-basis/digest/timestamp metadata. The raw
  // technical values stay in the DOM as non-visible data-media-*
  // attributes for verification.
  const caption = hero.alt?.trim() ? hero.alt.trim() : null;
  return (
    <div
      className="relative h-64 w-full overflow-hidden sm:h-80"
      data-hero-media={hero.id}
      data-media-source-url={hero.sourceUrl || undefined}
      data-media-rights-basis={hero.rightsBasis || undefined}
      data-media-digest={hero.digest || undefined}
      data-media-observed-at={hero.observedAt || undefined}
    >
      {hero.blurUrl ? (
        <img
          ref={blurRef}
          src={hero.blurUrl}
          alt=""
          aria-hidden="true"
          onError={onMediaError}
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
        />
      ) : null}
      <img
        ref={mainRef}
        src={hero.src}
        alt={hero.alt}
        width={hero.width}
        height={hero.height}
        loading="eager"
        onError={onMediaError}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {caption ? (
        <div className="absolute bottom-2 left-2 max-w-[65%] rounded bg-black/55 px-2 py-1">
          <p className="text-xs text-white">{caption}</p>
        </div>
      ) : null}
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
        mainRef={mainRef}
        blurRef={blurRef}
      />
      {children}
    </section>
  );
}
