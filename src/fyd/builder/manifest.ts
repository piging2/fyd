/**
 * Dependency manifests: WHY THIS, bidirectional.
 *
 * Every rendered binding records: the object field it binds, the owner
 * policy in force, the SiteSpec (planner) version, the component registry
 * version, the claim ref, and both confidence axes. This is the trust
 * escape hatch made structural:
 *
 *  - forward walk (Explain): section -> binding -> object fields, owner
 *    policy, claim ref, confidence. "Why does this section say that?"
 *  - reverse walk (change impact): object field or claim ref -> every
 *    binding that renders it. "If this fact changes, what moves?"
 *
 * The manifest is emitted by the planner alongside the spec and travels
 * with it; the semantic diff engine and the owner patch loop consume it.
 */

import type { BindingClassification } from "../sitespec/graph";

/** One rendered binding: the complete dependency record for a section. */
export interface BindingManifest {
  /** Section id this binding renders (pageSlug:component:index). */
  bindingId: string;
  /** Registry component name. */
  component: string;
  /** Component registry version at plan time. */
  componentVersion: string;
  /**
   * The object field(s) bound, in canonical form:
   * "owner" (the owner object), "related:<role>:<predicates>", "static",
   * or "slot:<slotId>" for generated presentation copy.
   */
  objectField: string;
  /** Owner policy in force for this binding. */
  ownerPolicy: "owner-wins" | "source-only";
  /** Site planner version that produced this binding. */
  siteSpecVersion: string;
  /** Provenance ref of the source objects, or null for static sections. */
  claimRef: string | null;
  /** Visible-statement classification (direct/derived/generated/owner_authored). */
  classification: BindingClassification;
  factConfidence: number;
  presentationConfidence: number;
}

export interface DependencyManifest {
  version: 1;
  plannerVersion: string;
  tenantId: string;
  bindings: BindingManifest[];
  /** Notes the planner recorded: unknown constraints, filtered sections. */
  notes: string[];
}

export function emptyManifest(plannerVersion: string, tenantId: string): DependencyManifest {
  return { version: 1, plannerVersion, tenantId, bindings: [], notes: [] };
}

/** Forward walk for Explain: section -> its binding record. */
export function forwardWalk(
  manifest: DependencyManifest,
  bindingId: string,
): BindingManifest | undefined {
  return manifest.bindings.find((b) => b.bindingId === bindingId);
}

/**
 * Reverse walk for change impact: every binding that renders a given
 * object field or claim ref. Pass an object id to find bindings whose
 * objectField references it, or a claim ref for evidence-level impact.
 */
export function reverseWalk(
  manifest: DependencyManifest,
  objectFieldOrClaimRef: string,
): BindingManifest[] {
  return manifest.bindings.filter(
    (b) =>
      b.objectField.includes(objectFieldOrClaimRef) ||
      b.claimRef === objectFieldOrClaimRef,
  );
}

/** All bindings for one component, in binding-id order. */
export function bindingsForComponent(
  manifest: DependencyManifest,
  component: string,
): BindingManifest[] {
  return manifest.bindings
    .filter((b) => b.component === component)
    .sort((a, b) => (a.bindingId < b.bindingId ? -1 : a.bindingId > b.bindingId ? 1 : 0));
}
