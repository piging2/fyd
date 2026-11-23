/**
 * Lane 3 composer: template manifest loading and fail-closed validation.
 *
 * The manifest is the Lane 1 template declaration (template-manifest.json).
 * The composer validates the manifest itself before compiling: a manifest
 * that declares a required page it cannot identify, a required page with
 * no sections (and not a declared shell page), or duplicate page ids is a
 * compile error (MANIFEST_INVALID), never a warning. An unknown template
 * reference is likewise a hard failure: the composer holds a registry of
 * the templates it knows and refuses anything else.
 */

export interface ManifestSection {
  /** Base section kind, with any "(n)" arity or "|fallback" stripped. */
  kind: string;
  optional: boolean;
  raw: string;
}

export interface ManifestPage {
  id: string;
  required: boolean;
  perRecord?: string;
  provisional?: boolean;
  aliases?: string[];
  sections: ManifestSection[];
}

export interface ManifestForm {
  id: string;
  kind: string;
  destination: string;
  properties: Record<string, unknown>;
}

export interface TemplateManifest {
  templateId: string;
  version: string;
  archetypeName: string;
  pages: ManifestPage[];
  forms: ManifestForm[];
  navigationPattern: string[];
  navigationSecondaryAction?: string;
  ratingsConsumed: Record<string, number>;
  raw: Record<string, unknown>;
}

export class ComposerManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComposerManifestError";
  }
}

/** Templates this composer knows how to compile. Anything else fails closed. */
export const KNOWN_TEMPLATES: ReadonlySet<string> = new Set(["trades-premium"]);

/** Page ids the composer knows how to synthesize. Unknown required page = error. */
export const KNOWN_PAGE_IDS: ReadonlySet<string> = new Set([
  "home",
  "servicesIndex",
  "serviceDetail",
  "workIndex",
  "projectDetail",
  "about",
  "reviews",
  "faq",
  "contact",
  "estimate",
  "blogIndex",
  "blogArticle",
  "newsletterArchive",
  "privacy",
  "notFound",
  "error",
]);

/** Required pages allowed to declare no sections (router shells). */
export const SHELL_PAGE_IDS: ReadonlySet<string> = new Set(["notFound", "error"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function parseSection(raw: string): ManifestSection {
  let s = raw.trim();
  let optional = false;
  if (s.endsWith("?")) {
    optional = true;
    s = s.slice(0, -1);
  }
  // "ServiceGallery|EmptyState" -> primary kind wins; fallback is a
  // rendering concern, and the composer reports it like any unmapped kind.
  const kind = s.split("|")[0].replace(/\(\d+\)$/, "").trim();
  return { kind, optional, raw };
}

function parsePage(raw: unknown, index: number): ManifestPage {
  if (!isRecord(raw)) throw new ComposerManifestError("manifest: page[" + index + "] is not an object");
  const id = raw["id"];
  if (typeof id !== "string" || id.length === 0) {
    throw new ComposerManifestError("manifest: page[" + index + "] has no id");
  }
  const rawSections = raw["sections"];
  const sections: ManifestSection[] = [];
  if (rawSections !== undefined) {
    if (!Array.isArray(rawSections)) {
      throw new ComposerManifestError("manifest: page '" + id + "' sections is not an array");
    }
    for (const s of rawSections) {
      if (typeof s !== "string") {
        throw new ComposerManifestError("manifest: page '" + id + "' has a non-string section");
      }
      sections.push(parseSection(s));
    }
  }
  const page: ManifestPage = {
    id,
    required: raw["required"] === true,
    sections,
  };
  if (typeof raw["perRecord"] === "string") page.perRecord = raw["perRecord"];
  if (raw["provisional"] === true) page.provisional = true;
  if (Array.isArray(raw["aliases"])) {
    page.aliases = raw["aliases"].filter((a): a is string => typeof a === "string");
  }
  return page;
}

/**
 * Parse and validate a template manifest. Throws ComposerManifestError on
 * any violation (fail closed). `templateRef`, when given, is the template
 * the caller asked for; an unknown or mismatched ref fails closed.
 */
export function parseManifest(raw: unknown, templateRef?: string): TemplateManifest {
  if (!isRecord(raw)) throw new ComposerManifestError("manifest: not an object");
  const templateId = raw["templateId"];
  if (typeof templateId !== "string" || !KNOWN_TEMPLATES.has(templateId)) {
    throw new ComposerManifestError("manifest: unknown template '" + String(templateId) + "'");
  }
  if (templateRef !== undefined && templateRef !== templateId) {
    throw new ComposerManifestError(
      "manifest: requested template '" + templateRef + "' does not match manifest '" + templateId + "'",
    );
  }
  const version = raw["version"];
  if (typeof version !== "string" || version.length === 0) {
    throw new ComposerManifestError("manifest: missing version");
  }
  const archetypeRaw = raw["archetype"];
  if (!isRecord(archetypeRaw) || typeof archetypeRaw["fydArchetype"] !== "string") {
    throw new ComposerManifestError("manifest: missing archetype.fydArchetype");
  }
  const rawPages = raw["pages"];
  if (!Array.isArray(rawPages) || rawPages.length === 0) {
    throw new ComposerManifestError("manifest: pages missing or empty");
  }
  const pages: ManifestPage[] = [];
  const seen = new Set<string>();
  rawPages.forEach((p, i) => {
    const page = parsePage(p, i);
    if (seen.has(page.id)) {
      throw new ComposerManifestError("manifest: duplicate page id '" + page.id + "'");
    }
    seen.add(page.id);
    if (page.required) {
      if (!KNOWN_PAGE_IDS.has(page.id)) {
        throw new ComposerManifestError(
          "manifest: required page '" + page.id + "' is not a page the composer can synthesize",
        );
      }
      if (page.sections.length === 0 && !SHELL_PAGE_IDS.has(page.id)) {
        throw new ComposerManifestError(
          "manifest: required page '" + page.id + "' declares no sections and is not a shell page",
        );
      }
      if (page.perRecord !== undefined && page.perRecord !== "service" && page.perRecord !== "project" && page.perRecord !== "article") {
        throw new ComposerManifestError(
          "manifest: page '" + page.id + "' has non-expandable perRecord '" + page.perRecord + "'",
        );
      }
    }
    pages.push(page);
  });

  const forms: ManifestForm[] = [];
  const rawForms = raw["forms"];
  if (isRecord(rawForms)) {
    for (const key of Object.keys(rawForms).sort()) {
      const f = rawForms[key];
      if (!isRecord(f)) continue;
      const props: Record<string, unknown> = {};
      for (const k of Object.keys(f).sort()) {
        if (k !== "destination") props[k] = f[k];
      }
      forms.push({
        id: key,
        kind: key === "estimateWizard" ? "estimate-wizard" : key === "newsletterSignup" ? "newsletter-signup" : key,
        destination: typeof f["destination"] === "string" ? (f["destination"] as string) : "tenant binding",
        properties: props,
      });
    }
  }

  let navigationPattern: string[] = [];
  let navigationSecondaryAction: string | undefined;
  const nav = raw["navigation"];
  if (isRecord(nav)) {
    if (Array.isArray(nav["primaryPattern"])) {
      navigationPattern = nav["primaryPattern"].filter((x): x is string => typeof x === "string");
    }
    if (typeof nav["secondaryAction"] === "string") {
      const m = /^(\w+)/.exec(nav["secondaryAction"] as string);
      if (m) navigationSecondaryAction = m[1];
    }
  }

  const ratingsConsumed: Record<string, number> = {};
  const rc = raw["ratingsConsumed"];
  if (isRecord(rc)) {
    for (const k of Object.keys(rc).sort()) {
      const v = rc[k];
      if (typeof v === "number") ratingsConsumed[k] = v;
    }
  }

  return {
    templateId,
    version,
    archetypeName: archetypeRaw["fydArchetype"] as string,
    pages,
    forms,
    navigationPattern,
    navigationSecondaryAction,
    ratingsConsumed,
    raw,
  };
}
