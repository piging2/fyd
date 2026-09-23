/**
 * Shared descriptor for one object in the margin object layer.
 *
 * Generic: every field is evidence-backed object data or layout input.
 * No per-customer logic may live in the layer; it only reads these.
 */
export interface RelatedObject {
  /** Id of the related object (e.g. "coppersmith-plumbing"). */
  objectId: string;
  /** Evidence-backed display name of the related object. */
  name: string;
  /** Relationship kind, e.g. "platform-peer". Shown as a small label. */
  kind: string;
  /** Evidence basis for the relationship, in plain words. Shown as a hint. */
  basis: string;
}

export interface MarginObjectDescriptor {
  /** PING object id (e.g. "happy-place"). Keys follow/like state. */
  objectId: string;
  /** Evidence-backed display name. */
  name: string;
  /** Identity image (website snapshot). Decorative; the name is the label. */
  imageSrc: string | null;
  imageSrcSet: string | null;
  /** Evidence-backed canonical public website URL, or null (fail closed). */
  websiteUrl: string | null;
  /** data-object-anchor key of the document element this object tracks. */
  anchorKey: string;
  /** Lower places first; ties break by anchor Y, then objectId. */
  priority: number;
  /** Real, evidence-backed relationships to other objects. Rendered as
   * peer-jump links on the expanded card. */
  relationships?: RelatedObject[];

  /**
   * OPTIONAL generic identity fields (all nullable). Evidence-backed
   * one-liners for the compact card; the layer never invents them. Null =
   * the line is omitted, never replaced with a guess.
   */
  /** Evidence-backed category, e.g. "Carpentry". Null when unknown. */
  category?: string | null;
  /** Evidence-backed location label, e.g. "Grand Junction, Colorado". Null when unknown. */
  location?: string | null;
  /**
   * One-line why-it's-here. Sourced from the object's evidence-backed
   * tagline (a fixed trim of its evidence-backed summary); never generated
   * prose. Null when the object has no tagline.
   */
  whyHere?: string | null;
  /**
   * OPTIONAL owner-authored short description (compact projection
   * override). When present it outranks the derived/excerpt tiers of the
   * short-description projection; it is owner copy, shown as-is within
   * the display budget. Null/absent = the projection derives it.
   */
  shortDescription?: string | null;
  /** Tenant site id that owns this object (Ask FYD path). Null when unknown;
   * the expanded card prefers the siteId returned by the objects route. */
  siteId?: string | null;
}

/**
 * Page context wired into Ask FYD (Nolan, 2026-09-22 FYD grill): the
 * concierge already knows the object, the page, the visible objects,
 * evidence, relationships, and allowed actions. This carries the
 * page-level half of that context into the ask request.
 */
export interface AskPageContext {
  /** Object ids visible in the margin layer on this page. */
  visibleObjectIds: string[];
  /** The context-active object id (the in-view anchor), if any. */
  contextObjectId: string | null;
}
