/**
 * Lane 3 template composer: public entry.
 *
 * compileTemplate(manifest, profile, options) deterministically compiles
 * a Lane 1 template manifest against a Lane 2 verified tenant profile
 * into a complete FYDSiteSpec plus a compile report. See DESIGN.md in the
 * lane record for the architecture and binding law.
 */
export { compileTemplate, canonicalStringify, slugify } from "./compile";
export { parseManifest, KNOWN_TEMPLATES, KNOWN_PAGE_IDS } from "./manifest";
export type { TemplateManifest, ManifestPage, ManifestSection, ManifestForm } from "./manifest";
export { ComposerManifestError } from "./manifest";
export { parseProfile, BindingView, omissionFor } from "./profile";
export type { TenantProfile, ProfileField, ProfileFieldStatus, FieldOmission } from "./profile";
export { ComposerProfileError } from "./profile";
export { ComposerError } from "./types";
export type {
  ComposeOptions,
  ComposeResult,
  CompileReport,
  PageOmission,
  SectionOmission,
  InexpressibleSection,
  FunctionalComponentRequirement,
  ComposerErrorCode,
} from "./types";
export {
  renderSpecToHtml,
  isStaticallyCovered,
  STATIC_RENDER_COMPONENTS,
} from "./render-static";
export type {
  CoverageManifest,
  PageCoverage,
  RenderedPage,
  StaticRenderResult,
  SuppressedSection,
  UncoveredSection,
} from "./render-static";
