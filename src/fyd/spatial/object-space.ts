/**
 * FYD spatial object: normalized object-space layout.
 *
 * Pure module, no React. Derives a deterministic SpatialSpec from an
 * ObjectProjection: one center node plus graph-derived satellite nodes
 * positioned in normalized object-space coordinates (x/y in [-1, 1],
 * center at the origin). The UI layer projects these to viewport pixels
 * with toViewport and animates with framer-motion.
 *
 * Fail-closed: deriveSpatialSpec returns null when the focus projection
 * is missing or has no id. Satellites come only from the projection's
 * already-gated related refs (serviceRefs, locationRef); this layer never
 * invents nodes and never sees private-visibility services.
 */

import type { ObjectProjection } from "@/fyd/object/object-projection";

export type SpatialRole =
  | "center"
  | "service"
  | "location"
  | "contact"
  | "evidence"
  | "ask"
  | "parent";

export interface SpatialNode {
  objectId: string;
  role: SpatialRole;
  label: string;
  /** Normalized object-space x in [-1, 1]. */
  x: number;
  /** Normalized object-space y in [-1, 1]. */
  y: number;
  /** Normalized radius, as a fraction of half the min viewport dimension. */
  radius: number;
  scale: number;
  /** Lower priority sorts earlier in keyboardOrder. Unique per spec. */
  priority: number;
  evidenceRef?: string;
}

export interface SpatialSpec {
  focusedObjectId: string;
  focusKind: "business" | "service";
  nodes: SpatialNode[];
}

/** Orbit radius for satellites in object-space units. */
const ORBIT_RADIUS = 0.68;
/** Satellite radius in object-space units. */
const SATELLITE_RADIUS = 0.16;
/** Center radius in object-space units. */
const CENTER_RADIUS = 0.3;
/** Singleton action node id for the Ask FYD satellite. */
const ASK_OBJECT_ID = "ask-fyd";
/** Parent business satellite recedes visually behind the focused service. */
const PARENT_SCALE = 0.85;

interface SatelliteSeed {
  objectId: string;
  role: SpatialRole;
  label: string;
  scale?: number;
  evidenceRef?: string;
}

function hasContactValue(focus: ObjectProjection): boolean {
  const facts = [
    focus.contact.phone,
    focus.contact.email,
    focus.contact.website,
  ];
  return facts.some(
    (fact) => fact !== null && fact !== undefined && fact.value.trim().length > 0,
  );
}

function contactSeed(
  focus: ObjectProjection,
  fallback?: ObjectProjection | null,
): SatelliteSeed | null {
  const source =
    hasContactValue(focus) ? focus : fallback && hasContactValue(fallback) ? fallback : null;
  if (!source) return null;
  return {
    objectId: `${focus.id}-contact`,
    role: "contact",
    label: "Contact",
  };
}

function evidenceSeed(focus: ObjectProjection): SatelliteSeed | null {
  const ref = focus.provenance?.ref;
  if (!ref || ref.trim().length === 0) return null;
  return {
    objectId: `${focus.id}-evidence`,
    role: "evidence",
    label: "Evidence",
    evidenceRef: ref,
  };
}

function askSeed(): SatelliteSeed {
  return { objectId: ASK_OBJECT_ID, role: "ask", label: "Ask FYD" };
}

/**
 * Places satellite seeds on the orbit: satellite i of n sits at
 * -90deg + i*(360/n), i.e. the first satellite starts at the top and the
 * rest spread clockwise. Deterministic for a given seed list.
 */
function layoutSatellites(seeds: SatelliteSeed[]): SpatialNode[] {
  const n = seeds.length;
  return seeds.map((seed, i) => {
    const angleRad = ((-90 + (i * 360) / n) * Math.PI) / 180;
    return {
      objectId: seed.objectId,
      role: seed.role,
      label: seed.label,
      x: Math.cos(angleRad) * ORBIT_RADIUS,
      y: Math.sin(angleRad) * ORBIT_RADIUS,
      radius: SATELLITE_RADIUS,
      scale: seed.scale ?? (i === 0 ? 1.1 : 1),
      priority: i + 1,
      ...(seed.evidenceRef ? { evidenceRef: seed.evidenceRef } : {}),
    };
  });
}

function businessSeeds(focus: ObjectProjection): SatelliteSeed[] {
  const seeds: SatelliteSeed[] = [];
  for (const ref of focus.serviceRefs.slice(0, 2)) {
    seeds.push({ objectId: ref.id, role: "service", label: ref.name });
  }
  if (focus.locationRef) {
    seeds.push({
      objectId: focus.locationRef.id,
      role: "location",
      label: focus.locationRef.name,
    });
  }
  const contact = contactSeed(focus);
  if (contact) seeds.push(contact);
  const evidence = evidenceSeed(focus);
  if (evidence) seeds.push(evidence);
  seeds.push(askSeed());
  return seeds;
}

function serviceSeeds(
  focus: ObjectProjection,
  parent?: ObjectProjection | null,
): SatelliteSeed[] {
  const seeds: SatelliteSeed[] = [];
  if (parent && parent.id) {
    seeds.push({
      objectId: parent.id,
      role: "parent",
      label: parent.name,
      scale: PARENT_SCALE,
    });
  }
  const evidence = evidenceSeed(focus);
  if (evidence) seeds.push(evidence);
  seeds.push(askSeed());
  const contact = contactSeed(focus, parent);
  if (contact) seeds.push(contact);
  return seeds;
}

/**
 * Derives the spatial layout for a focused object. Returns null when the
 * focus projection is missing (fail-closed); the caller must not render
 * a spatial object in that case.
 */
export function deriveSpatialSpec(input: {
  focus: ObjectProjection | null | undefined;
  parent?: ObjectProjection | null;
}): SpatialSpec | null {
  const focus = input?.focus;
  if (!focus || typeof focus.id !== "string" || focus.id === "") {
    return null;
  }

  const focusKind: "business" | "service" =
    focus.kindLabel?.toLowerCase() === "service" ? "service" : "business";

  const center: SpatialNode = {
    objectId: focus.id,
    role: "center",
    label: focus.name,
    x: 0,
    y: 0,
    radius: CENTER_RADIUS,
    scale: 1,
    priority: 0,
  };

  const seeds =
    focusKind === "business"
      ? businessSeeds(focus)
      : serviceSeeds(focus, input?.parent);

  return {
    focusedObjectId: focus.id,
    focusKind,
    nodes: [center, ...layoutSatellites(seeds)],
  };
}

/**
 * Projects one object-space node to viewport pixels.
 * cx=w/2, cy=h/2, unit=min(w,h)/2.
 */
export function toViewport(
  node: SpatialNode,
  vp: { w: number; h: number },
): { x: number; y: number; r: number } {
  const cx = vp.w / 2;
  const cy = vp.h / 2;
  const unit = Math.min(vp.w, vp.h) / 2;
  return {
    x: cx + node.x * unit,
    y: cy + node.y * unit,
    r: node.radius * unit * node.scale,
  };
}

/**
 * Keyboard traversal order: nodes sorted by ascending priority
 * (center first, then satellites in layout order).
 */
export function keyboardOrder(spec: SpatialSpec): SpatialNode[] {
  return [...spec.nodes].sort((a, b) => a.priority - b.priority);
}
