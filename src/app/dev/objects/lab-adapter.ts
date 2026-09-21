/**
 * Lane C: INTERNAL /dev/objects lab adapter (server-only).
 *
 * Internal development infrastructure, never customer product. This module
 * bridges the PING-backed projection read model (getPingObjectGraph, the same
 * source the demo sites and Ask FYD use) to the lab's render slots:
 *
 * - Business objects -> the canonical ObjectView via loadObjectView
 *   (@/fyd/object/view), the SAME PING-backed projection loader the /o routes
 *   use. Center content is untouched.
 * - Non-business objects -> a minimal generic ObjectView built ONLY from the
 *   object's own observed fields (direct layer). Capabilities are emitted only
 *   when the underlying value exists; no ask/follow/like invented here.
 * - Object types with no objects in the current projection (Person, Post,
 *   Project today) produce EMPTY groups: the lab renders an explicit
 *   "renders nothing" state, never fake people, posts, or reactions.
 */

import type { ObjectGraph } from "@/fyd/sitespec/types";
import { schemaRole } from "@/fyd/sitespec/schemas";
import type { PingObject } from "@/lib/ping/types";
import { loadObjectView } from "@/fyd/object/view";
import type {
  ObjectCapability,
  ObjectContactView,
  ObjectView,
} from "@/fyd/object/types";

export const LAB_TYPE_ORDER = [
  "Business",
  "Service",
  "Person",
  "Location",
  "Post",
  "Project",
] as const;
export type LabTypeName = (typeof LAB_TYPE_ORDER)[number] | "Other";

export function typeNameForSchema(schema: string): LabTypeName {
  const role = schemaRole(schema);
  switch (role) {
    case "business":
      return "Business";
    case "service":
    case "product":
      return "Service";
    case "location":
      return "Location";
    case "person":
      return "Person";
    case "post":
    case "article":
      return "Post";
    default:
      // There is no "project" role in the current schema vocabulary, so
      // project-schema objects land in "Other" and the Project tab stays an
      // honest empty state until the vocabulary and projections carry them.
      return "Other";
  }
}

export interface LabObjectSummary {
  id: string;
  schema: string;
  title: string;
  visibility: string;
  provenanceKind: string;
  provenanceRef: string;
  derivedAt: string;
  description: string | null;
}

export interface LabTypeGroup {
  type: LabTypeName;
  objects: LabObjectSummary[];
}

function scalarField(obj: PingObject, key: string): string | null {
  const v = obj.fields?.[key];
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (
    Array.isArray(v) &&
    v.length > 0 &&
    typeof v[0] === "string" &&
    v[0].trim().length > 0
  )
    return v[0].trim();
  return null;
}

export function summarizeObject(obj: PingObject): LabObjectSummary {
  const desc =
    obj.description?.trim().length > 0 ? obj.description.trim() : null;
  return {
    id: obj.id,
    schema: obj.schema,
    title: obj.title,
    visibility: obj.visibility,
    provenanceKind: obj.provenance?.kind ?? "unknown",
    provenanceRef: obj.provenance?.ref ?? "",
    derivedAt: obj.provenance?.derivedAt ?? obj.updatedAt ?? "",
    description: desc ?? scalarField(obj, "description"),
  };
}

/**
 * Minimal ObjectView for a non-business object: DIRECT layer only, built
 * strictly from the object's own observed fields. Media/services/owner state
 * are absent (empty, not faked). Capabilities exist only when the underlying
 * value exists: no fake buttons, no invented relationships.
 */
export function genericObjectView(obj: PingObject): ObjectView {
  const contact: ObjectContactView = {
    phone: scalarField(obj, "phone"),
    email: scalarField(obj, "email"),
    website: scalarField(obj, "website"),
    locality: scalarField(obj, "locality"),
    addressVisibility: "public",
  };
  const capabilities: ObjectCapability[] = [];
  if (contact.phone)
    capabilities.push({
      kind: "call",
      href: "tel:" + contact.phone.replace(/\s/g, ""),
      label: "Call",
    });
  if (contact.email)
    capabilities.push({
      kind: "email",
      href: "mailto:" + contact.email,
      label: "Email",
    });
  if (contact.website)
    capabilities.push({
      kind: "website",
      href: contact.website,
      label: "Website",
    });
  // NOTE: ask/follow/like are product relationships, not observable on raw
  // objects. They are deliberately absent here rather than invented.
  return {
    id: obj.id,
    schema: obj.schema,
    name: obj.title,
    category: scalarField(obj, "category"),
    locationLabel: contact.locality,
    summary: obj.description?.trim() ?? "",
    media: [],
    services: [],
    serviceArea: [],
    contact,
    capabilities,
    provenance: {
      kind: obj.provenance?.kind ?? "unknown",
      ref: obj.provenance?.ref ?? "",
      derivedAt: obj.provenance?.derivedAt ?? obj.updatedAt ?? "",
      label: "Information from the business website",
    },
    ownerUpdatedAt: null,
    fieldCorrections: [],
    sampleQuestions: [],
  };
}

export interface LabData {
  typeGroups: LabTypeGroup[];
  views: Record<string, ObjectView>;
}

export function buildLabData(siteId: string, graph: ObjectGraph): LabData {
  const groups = new Map<LabTypeName, LabObjectSummary[]>();
  const views: Record<string, ObjectView> = {};
  for (const obj of graph.objects) {
    const type = typeNameForSchema(obj.schema);
    const list = groups.get(type) ?? [];
    list.push(summarizeObject(obj));
    groups.set(type, list);
    if (type === "Business") {
      // Canonical read-model loader (PING-backed, digest-verified). Same
      // source the /o routes and the demo sites render from.
      const v = loadObjectView(siteId);
      if (v) views[obj.id] = v;
    } else {
      views[obj.id] = genericObjectView(obj);
    }
  }
  // Every LAB_TYPE_ORDER type is listed even when empty, so the lab shows
  // explicit "renders nothing" states. "Other" only appears when non-empty.
  const ordered: LabTypeName[] = [...LAB_TYPE_ORDER, "Other"];
  const typeGroups: LabTypeGroup[] = ordered
    .map((type) => ({ type, objects: groups.get(type) ?? [] }))
    .filter(
      (g) =>
        g.objects.length > 0 ||
        (LAB_TYPE_ORDER as readonly string[]).includes(g.type),
    );
  return { typeGroups, views };
}
