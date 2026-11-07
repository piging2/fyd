import dynamic from "next/dynamic";
import { getProjectById } from "@/lib/projects";
import { getStaticMediaForBootstrap } from "@/lib/media";

/**
 * Before/after slider restore (2026-11-07): the tenant's original site
 * carried a draggable before/after comparison for its fence project.
 * The pair was lost when commit 8536734c in the tenant repo's history
 * ("Canonicalize media authority", 2026-09-06) deleted the
 * fences-001-before media record and the project's before reference
 * with it; the component hides gracefully when a pair is incomplete,
 * so the loss was silent. The media record and the project reference
 * are restored in the config authorities (src/config/media.v1.json,
 * src/config/projects.v1.json) with their original values, and this
 * section mounts the resident BeforeAfterSlider for that one project
 * on this tenant's page only.
 *
 * Resolution note: the projects subsystem's runtime resolver
 * (getProjectWithResolvedMedia) reads the KV public authority only,
 * and that authority holds no records for this subsystem in this
 * deployment (no live surface renders project media), so it resolves
 * null here. This restore therefore reads the pair through the
 * guarded static path (getStaticMediaForBootstrap, which rejects
 * synthetic content identity). If the KV authority is ever seeded
 * for this subsystem, switch this section to the KV resolver.
 * Renders nothing when the pair is incomplete, matching the
 * component's own contract.
 */
const BeforeAfterSlider = dynamic(
  () => import("@/components/before-after-slider").then((m) => m.BeforeAfterSlider)
);

const SLIDER_PROJECT_ID = "fences-001";

export function SliderSection() {
  const base = getProjectById(SLIDER_PROJECT_ID);
  if (!base || !base.media.before || !base.media.after) return null;
  const beforeMedia = getStaticMediaForBootstrap(base.media.before);
  const afterMedia = getStaticMediaForBootstrap(base.media.after);
  if (!beforeMedia || !afterMedia) return null;
  const project = {
    ...base,
    media: { ...base.media, beforeMedia, afterMedia },
  };
  return (
    <section aria-label="Before and after" className="mx-auto max-w-3xl px-6 py-16">
      <h2 className="mb-6 text-2xl font-semibold">Before and after</h2>
      <BeforeAfterSlider project={project} />
    </section>
  );
}
