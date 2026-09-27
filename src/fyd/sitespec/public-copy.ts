/**
 * Public-copy purity authority (polish lane, 2026-09-26).
 *
 * ONE authority for what counts as usable public copy on the visitor
 * projection, shared by the planner (builder/planner.ts) and the renderer
 * (components/renderer.tsx). The visitor page shows the business only:
 * provenance narration ("Person described in the website's structured
 * data.", "Coarse public location claim from the website's structured
 * data.") and bare handle-fragment titles ("coppersmithplm") are ingestion
 * residue, never public content. Generic: no tenant, URL, or customer
 * conditions.
 *
 * The rule is title-centric: the title is the object's public identity.
 * A handle fragment with a narration description is not content. The
 * renderer additionally reads titles through the binding verifier
 * (boundTitle); this module judges the raw copy so the planner can omit
 * narration/handle-only objects and sections at plan time, before the
 * spec is emitted.
 */

/**
 * Provenance narration never binds as public copy. The ingestion lanes
 * synthesize sentences like "Coarse public location claim from the
 * website's structured data." and "Person described in the website's
 * structured data." to describe the EVIDENCE; they describe nothing about
 * the business and must never render as an object's public description. A
 * narration match falls back to title-only.
 */
const PROVENANCE_NARRATION_PATTERNS: RegExp[] = [
  /the website's structured data\.?\s*$/i,
  /^coarse public location claim from the website\.?\s*$/i,
];

/** True when the text is provenance narration, not public copy. */
export function isProvenanceNarration(
  text: string | null | undefined,
): boolean {
  const t = (text ?? "").trim();
  if (t === "") return false;
  return PROVENANCE_NARRATION_PATTERNS.some((re) => re.test(t));
}

/**
 * A title that is a bare social/URL handle fragment ("coppersmithplm"): one
 * long lowercase token with no word breaks. The observed handles are person
 * identities ("name": "coppersmithplm" on ping.social.person@1), so the
 * rule applies to person-schema objects (and to objects with no schema,
 * fail-closed). Business names are not bare handles; a lowercase one-word
 * business brand must not be filtered as a handle.
 */
const HANDLE_FRAGMENT_RE = /^[a-z0-9][a-z0-9._-]{8,}[a-z0-9]$/;
const PERSON_SCHEMA = "ping.social.person@1";

/** True when the title is a bare handle fragment, not a name. */
export function isHandleFragmentTitle(
  title: string | null | undefined,
  schema?: string | null,
): boolean {
  const t = (title ?? "").trim();
  if (!HANDLE_FRAGMENT_RE.test(t)) return false;
  // Non-person schemas are businesses/services, never handle identities.
  if (schema != null && schema !== PERSON_SCHEMA) return false;
  return true;
}

/**
 * Whether a title is usable as public content: non-empty, not provenance
 * narration, and not a bare handle fragment. An unusable title means the
 * object carries no usable public identity. The optional schema scopes
 * the handle rule to person identities; narration is never public copy
 * for any schema.
 */
export function isUsablePublicTitle(
  title: string | null | undefined,
  schema?: string | null,
): boolean {
  const t = (title ?? "").trim();
  if (t === "") return false;
  if (isProvenanceNarration(t)) return false;
  if (isHandleFragmentTitle(t, schema)) return false;
  return true;
}

/**
 * Object-level usable-public-copy judgment on raw copy (planner seam).
 * The title is the object's public identity: an object whose title is not
 * usable carries no usable public copy, even when its description reads
 * fine (a handle fragment with a narration description is ingestion
 * residue, not content). Mirrors the renderer's sectionHasUsableContent,
 * which applies the same title-centric rule to verified (bound) titles.
 */
export function hasUsablePublicCopy(o: {
  title?: string | null;
  description?: string | null;
  schema?: string | null;
}): boolean {
  return isUsablePublicTitle(o.title ?? null, o.schema ?? null);
}
