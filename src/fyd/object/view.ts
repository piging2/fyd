/**
 * FYD object projection (server-only).
 *
 * loadObjectView(slug) composes the GENERIC ObjectView from three
 * strictly separated layers:
 *
 * - SOURCE STATE: the PING-backed projection read model
 *   (@/fyd/data/ping-object-source, digest-verified JSON dumped from the
 *   PING journal). Read-only. This is the ONLY customer-data source at
 *   runtime; the ingestion fixtures are test-only and are never imported
 *   here. (Two sources of truth once let the ObjectView and the rendered
 *   site pages disagree on the service list: FL-20260921-233.)
 * - DERIVED: deterministic transforms of source state (area parsing,
 *   category mapping). Always labeled with their basis.
 * - OWNER STATE: durable owner decisions from the owner store. Source
 *   re-ingestion can never erase owner intent.
 *
 * Services are STRUCTURED service objects linked from the business via
 * provides/offers relationships: the same semantics the site generator
 * and Ask FYD use. Evidence class is never collapsed: structured
 * records carry basis "structured", never the old "derived" prose-parse
 * label.
 *
 * The UI renders this projection. It never renders business-specific code.
 *
 * Phase 1 (per-object path): composeObjectView is the shared composition
 * core. loadObjectView keeps the legacy slug-keyed business behavior;
 * loadObjectViewById (./by-id) resolves ANY object id in the tenant graph
 * through the same core.
 */

import {
  getPingObjectGraphSync,
  listPingSiteIdsSync,
} from "@/fyd/data/ping-object-source";
import { SCHEMA_ROLES, capabilityOptionsForSchema, schemaRole } from "../sitespec/schemas";
import { resolveSafeLink } from "../sitespec/safe-link";
import type { ObjectGraph } from "../sitespec/types";
import type { PingObject } from "../../lib/ping/types";
import { readOverrides } from "./owner-store";
import { resolveCircleBackground } from "../media/circle-background";
import { listObjectMedia } from "../media/select";
import type {
  CircleProjection,
  FieldCorrectionView,
  ObjectCapability,
  ObjectContactView,
  ObjectMediaView,
  ObjectServiceView,
  ObjectView,
} from "./types";

/**
 * Predicates linking a business to its offerings. Mirrors the site
 * generator's role map (ROLE_PREDICATES.service) and the relationship
 * walk in src/fyd/components/renderer.tsx so the ObjectView enumerates
 * exactly the services the rendered pages show.
 */
const SERVICE_PREDICATES = ["provides", "offers"];

/** Site ids this loader can serve: the PING-backed projections on disk. */
export function listObjectIds(): string[] {
  return listPingSiteIdsSync();
}

function field(obj: PingObject, key: string): string | null {
  const v = obj.fields?.[key];
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0].trim();
  return null;
}

function categoryFor(keywords: string | null): string | null {
  if (!keywords) return null;
  const first = keywords.split(",")[0]?.trim().toLowerCase() ?? "";
  if (/carpent/.test(first)) return "Carpentry";
  if (/plumb/.test(first)) return "Plumbing";
  if (/hvac|heat|cool/.test(first)) return "HVAC";
  if (!first) return null;
  return first.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseServiceArea(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .replace(/\s+and\s+/gi, ", ")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Structured services on record: public service-role objects linked from
 * the business by an active provides/offers relationship. Same selection
 * the site generator's group() applies, so pages and ObjectView agree.
 */
function structuredServices(graph: ObjectGraph, businessId: string): PingObject[] {
  const byId = new Map(graph.objects.map((o) => [o.id, o]));
  const out = new Map<string, PingObject>();
  for (const r of graph.relationships) {
    if (r.subject !== businessId) continue;
    if (r.status !== "active") continue;
    if (!SERVICE_PREDICATES.includes(r.predicate)) continue;
    const target = byId.get(r.object);
    if (
      target &&
      SCHEMA_ROLES.service.includes(target.schema) &&
      target.visibility === "public"
    ) {
      out.set(target.id, target);
    }
  }
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function buildServices(
  structured: { id: string; name: string }[],
  objectId: string,
): { services: ObjectServiceView[]; knownIds: string[]; knownNames: Map<string, string> } {
  const overrides = readOverrides(objectId);
  const knownIds: string[] = [];
  const knownNames = new Map<string, string>();
  const basis: ObjectServiceView[] = structured.map(({ id, name }) => {
    knownIds.push(id);
    knownNames.set(id, name);
    return { id, name, basis: "structured" as const, basisLabel: "From the site data", visible: true };
  });
  for (const added of overrides.addedServices) {
    if (knownIds.includes(added.id)) continue;
    knownIds.push(added.id);
    knownNames.set(added.id, added.name);
    basis.push({
      id: added.id,
      name: added.name,
      basis: "owner",
      basisLabel: "Added by the owner",
      visible: !overrides.hiddenServices.includes(added.id),
    });
  }

  // Owner order wins; any ids not yet ordered keep structured order at the end.
  const ordered: ObjectServiceView[] = [];
  const byId = new Map(basis.map((s) => [s.id, s]));
  for (const id of overrides.serviceOrder) {
    const s = byId.get(id);
    if (s) {
      ordered.push(s);
      byId.delete(id);
    }
  }
  for (const s of basis) if (byId.has(s.id)) ordered.push(s);

  const hidden = new Set(overrides.hiddenServices);
  return {
    services: ordered.map((s) => ({ ...s, visible: !hidden.has(s.id) })),
    knownIds,
    knownNames,
  };
}

/**
 * Capability resolution for one object (G4).
 *
 * OBJECT + VIEWER + CONTEXT -> CAPABILITY RESOLUTION -> AVAILABLE ACTIONS
 * -> RENDER MODEL. The allowed action set comes from
 * capabilityOptionsForSchema (the capability authority in
 * ../sitespec/schemas); this function only maps each allowed kind to its
 * render model and applies executability gates (evidence for ask,
 * safe-link resolution for contact actions). There is no role switch
 * here: schema decides the actions, the view layer renders them.
 *
 * Executability notes:
 * - "open" is demoted: the full customer page is not a capability action.
 * - "ask" requires evidence (summary or visible services).
 * - contact kinds (call/email/website/directions) require a safe,
 *   evidence-backed value; resolveSafeLink "navigate" refuses hostile or
 *   non-public values, so no dead or unsafe button is emitted.
 * - "reply" is not emitted: no reply backend exists, and a button
 *   without a working action is a lie.
 * - "propose_update"/"site_propose" are owner-surface actions with no
 *   customer render model; they are allowed by the authority but not
 *   rendered here.
 */
export interface CapabilityViewer {
  viewerId: string | null;
  controllerId: string;
}

export function buildCapabilities(
  schemaId: string,
  objectId: string,
  contact: ObjectContactView,
  evidence: { summary: string; services: ObjectServiceView[] },
  viewer: CapabilityViewer = { viewerId: null, controllerId: "" },
): ObjectCapability[] {
  const allowed = capabilityOptionsForSchema(schemaId, {
    viewerId: viewer.viewerId,
    controllerId: viewer.controllerId,
    hasWebsite: contact.website !== null,
    hasPhone: contact.phone !== null,
    hasEmail: contact.email !== null,
    hasLocality: contact.locality !== null,
  });
  const caps: ObjectCapability[] = [];
  const hasAskEvidence =
    evidence.summary.trim().length > 0 ||
    evidence.services.some((s) => s.visible) ||
    contact.phone !== null ||
    contact.email !== null ||
    contact.website !== null ||
    contact.locality !== null;
  for (const kind of allowed) {
    switch (kind) {
      case "open":
        // Demoted: the full customer page is not a capability action.
        break;
      case "ask":
        if (hasAskEvidence) caps.push({ kind: "ask" });
        break;
      case "reference":
        caps.push({ kind: "reference", objectId });
        break;
      case "follow":
        caps.push({ kind: "follow" });
        break;
      case "like":
        caps.push({ kind: "like" });
        break;
      case "reply":
        // No reply backend: never render a button without a working action.
        break;
      case "propose_update":
      case "site_propose":
        // Owner-surface actions; no customer render model.
        break;
      case "open_website": {
        const resolved = resolveSafeLink(contact.website, "navigate");
        if (resolved.kind === "safe" && contact.website) {
          caps.push({ kind: "website", href: resolved.href, label: "Website" });
        }
        break;
      }
      case "call": {
        const resolved = resolveSafeLink(contact.phone, "call");
        if (resolved.kind === "safe" && contact.phone) {
          caps.push({ kind: "call", href: resolved.href, label: "Call" });
        }
        break;
      }
      case "email": {
        const resolved = resolveSafeLink(contact.email, "email");
        if (resolved.kind === "safe" && contact.email) {
          caps.push({ kind: "email", href: resolved.href, label: "Email" });
        }
        break;
      }
      case "directions": {
        // The locality is encoded into a Google Maps query; it never
        // becomes a navigated URL, so no safe-link gate applies. This
        // matches the pre-G4 construction exactly.
        if (contact.locality) {
          caps.push({
            kind: "directions",
            href:
              "https://www.google.com/maps/search/?api=1&query=" +
              encodeURIComponent(contact.locality),
            label: "Directions",
          });
        }
        break;
      }
    }
  }
  return caps;
}

/**
 * Shared composition core: build the ObjectView for ONE object in a
 * tenant graph.
 *
 * - siteId selects the tenant (media manifests, never cross-tenant).
 * - obj is the object the view describes (any schema, any public object).
 * - viewId is the public id carried on the view.
 * - overridesKey keys the owner store.
 *
 * The slug-keyed business path passes the site slug for viewId and
 * overridesKey (legacy behavior, unchanged). The per-object path
 * (loadObjectViewById in ./by-id) passes the PING object id for both.
 *
 * Not a public loader on its own: use loadObjectView / loadObjectViewById,
 * which enforce the tenant/object honesty gates (unknown tenant, unknown
 * id, non-public object).
 */
export function composeObjectView(
  graph: ObjectGraph,
  siteId: string,
  obj: PingObject,
  viewId: string,
  overridesKey: string,
): ObjectView {
  const overrides = readOverrides(overridesKey);
  const description = field(obj, "description") ?? obj.description ?? "";
  const website = field(obj, "website");
  const phone = field(obj, "phone");
  const email = field(obj, "email");
  const locality = field(obj, "locality");
  const keywords = field(obj, "keywords");

  const { services } = buildServices(
    structuredServices(graph, obj.id).map((s) => ({ id: s.id, name: s.title })),
    overridesKey,
  );

  // Media via the semantic attachment: the manifest is joined to the
  // graph (Business represented_by Media) and the selector walks those
  // relationships from the object. One truth for Page, Circle, and
  // ObjectView; reference-only assets can never surface here.
  const media: ObjectMediaView[] = listObjectMedia(siteId, graph, obj.id).map(
    (d) => ({
      id: d.id,
      role: d.role,
      src: d.src,
      alt: d.alt,
      rightsSource: d.rightsSource,
      rightsBasis: d.rightsBasis,
      sourceUrl: d.sourceUrl,
      digest: d.digest,
      observedAt: d.observedAt,
    }),
  );

  const contact: ObjectContactView = {
    phone,
    email,
    website,
    locality,
    addressVisibility: overrides.addressVisibility,
  };

  const domain = domainOf(website);
  const firstService = services.find((s) => s.visible)?.name ?? services[0]?.name;

  // Owner-attested field corrections, composed onto the graph by the read
  // seam (src/fyd/data/ping-object-source.ts -> owner-overlay.ts). The
  // contact block already carries the EFFECTIVE (owner-winning) values;
  // these records keep the SOURCE SAYS X / OWNER SAYS Y distinction and
  // the correction's own provenance for honest display.
  const fieldCorrections: FieldCorrectionView[] = (
    obj.ownerFieldCorrections ?? []
  ).map((c) => ({ ...c, sourceDrifted: c.sourceDrifted ?? false }));

  return {
    id: viewId,
    schema: obj.schema,
    name: obj.title,
    category: categoryFor(keywords),
    locationLabel: locality,
    summary: description,
    media,
    services,
    serviceArea: parseServiceArea(field(obj, "area_served")),
    contact,
    capabilities: buildCapabilities(
      obj.schema,
      obj.id,
      contact,
      { summary: description, services },
      { viewerId: null, controllerId: obj.controllerId },
    ),
    provenance: {
      kind: obj.provenance?.kind ?? "unknown",
      ref: obj.provenance?.ref ?? "",
      derivedAt: obj.provenance?.derivedAt ?? obj.updatedAt ?? "",
      label: domain ? "Information observed on " + domain : "Information from the business website",
    },
    ownerUpdatedAt: overrides.history.length > 0 ? overrides.updatedAt : null,
    fieldCorrections,
    sampleQuestions: [
      firstService ? "What kind of " + firstService.toLowerCase() + " work do you do?" : "What services do you offer?",
      "Where do you work?",
      "How can I get an estimate?",
    ],
  };
}

/**
 * Load the public ObjectView for a site slug from the PING-backed
 * projection. This is the canonical read-model loader; Card/Node lanes
 * should reuse it. Returns null for unknown slugs (the route turns this
 * into a 404). Throws only on programmer error, never on missing data.
 */
export function loadObjectView(slug: string): ObjectView | null {
  let graph: ObjectGraph;
  try {
    graph = getPingObjectGraphSync(slug).graph;
  } catch {
    return null;
  }
  const business = graph.objects.find(
    (o) => SCHEMA_ROLES.business.includes(o.schema) && o.visibility === "public",
  );
  if (!business) return null;
  return composeObjectView(graph, slug, business, slug, slug);
}

/**
 * @deprecated Use loadObjectView. Kept as an alias so in-flight lanes
 * importing the old name do not break; it will be removed in a later wave.
 */
export const buildObjectView = loadObjectView;

/** Service id/name sets for validating owner commands. Exposed for the API route. */
export function knownServices(objectId: string): { ids: string[]; names: Map<string, string> } {
  let graph: ObjectGraph;
  try {
    graph = getPingObjectGraphSync(objectId).graph;
  } catch {
    return { ids: [], names: new Map() };
  }
  const business = graph.objects.find(
    (o) => SCHEMA_ROLES.business.includes(o.schema) && o.visibility === "public",
  );
  if (!business) return { ids: [], names: new Map() };
  const { knownIds, knownNames } = buildServices(
    structuredServices(graph, business.id).map((s) => ({ id: s.id, name: s.title })),
    objectId,
  );
  return { ids: knownIds, names: knownNames };
}

/** First maxChars of the summary, cut back to the last word boundary. */
export function trimTagline(summary: string, maxChars: number): string {
  const s = summary.trim();
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * Load the FYD circle projection for a site slug.
 *
 * Composes loadObjectView pieces (name, category, locationLabel, summary,
 * services, capabilities, provenance, sampleQuestions) plus the circle
 * background. Returns null for unknown slugs (the route turns this into a
 * 404).
 */
export function loadCircleProjection(slug: string): CircleProjection | null {
  const view = loadObjectView(slug);
  if (!view) return null;
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
    background: resolveCircleBackground(view.id),
    capabilities: view.capabilities,
    provenanceLabel: view.provenance.label,
    provenanceDetail: view.provenance.ref,
    sampleQuestions: view.sampleQuestions.slice(0, 3),
  };
}

/**
 * @deprecated Use loadCircleProjection. Kept as an alias so in-flight
 * lanes importing the old name do not break; it will be removed later.
 */
export const buildCircleProjection = loadCircleProjection;
