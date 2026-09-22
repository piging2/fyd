/**
 * ObjectView -> CircleProjection adapter (pure: no I/O, no network).
 *
 * Evidence-preserving: every field is copied or deterministically derived
 * from the view; nothing is invented.
 * - tagline: 90-char word-boundary trim of the view summary.
 * - topFacts: first 3 VISIBLE service names, in view order.
 * - background: the first rights-authorized hero/logo media entry's local
 *   derivative when the view carries one; otherwise the deterministic warm
 *   gradient from sha256(view.id) — the same gradientFor() the media lane
 *   uses for circle backgrounds (hues 18..42), with the media entry's
 *   observation date when the view carries media at all.
 * - capabilities, provenance, sampleQuestions: copied through
 *   (sampleQuestions capped at 3, matching the slug-keyed loader).
 */

import { GRADIENT_BASIS, gradientFor } from "../media/circle-background";
import type {
  CircleBackground,
  CircleProjection,
  ObjectView,
} from "./types";
import { trimTagline } from "./view";

/**
 * Circle background from the view's own media (all entries are
 * rights-authorized by construction of ObjectView.media): first
 * hero/logo entry wins; otherwise the deterministic gradient fallback.
 */
function backgroundFor(view: ObjectView): CircleBackground {
  const hero = view.media.find((m) => m.role === "hero" || m.role === "logo");
  if (hero) {
    return {
      kind: "image",
      src: hero.src,
      digest: hero.digest,
      observedAt: hero.observedAt,
      basis: hero.rightsBasis,
    };
  }
  const { css, digest } = gradientFor(view.id);
  return {
    kind: "gradient",
    css,
    digest,
    observedAt: view.media[0]?.observedAt ?? "",
    basis: GRADIENT_BASIS,
  };
}

export function objectViewToCircleProjection(view: ObjectView): CircleProjection {
  return {
    id: view.id,
    name: view.name,
    category: view.category,
    locationLabel: view.locationLabel,
    tagline: trimTagline(view.summary, 90),
    topFacts: view.services
      .filter((s) => s.visible)
      .slice(0, 3)
      .map((s) => s.name),
    background: backgroundFor(view),
    capabilities: view.capabilities,
    provenanceLabel: view.provenance.label,
    provenanceDetail: view.provenance.ref,
    sampleQuestions: view.sampleQuestions.slice(0, 3),
  };
}
