/**
 * GENERATED_PRESENTATION: generated marketing copy that cannot introduce
 * unsupported factual predicates.
 *
 * The site planner NEVER manufactures business facts. When it needs
 * presentation copy (a hero tagline, a section heading), it emits a
 * GeneratedCopySlot: text plus one CopyBinding per factual predicate in
 * the text. The evidence-binding verifier checks that every factual
 * binding resolves along the full chain:
 *
 *   object field -> claim/evidence -> visibility -> render binding
 *
 * A slot whose text makes a factual claim with no binding is refused
 * (ungrounded copy). A binding that names an unknown object, an unknown
 * field, a mismatched claim ref, or a non-public object is refused. Text
 * containing a prohibited-positioning predicate is refused. Refusal is
 * fail-closed: the planner throws and no spec is produced, because a spec
 * with unverified copy must never exist.
 *
 * What counts as a factual predicate here is deliberately narrow and
 * mechanical: every non-empty slot must carry at least one binding, and
 * every binding must resolve. The planner's templates are built so their
 * slots only interpolate bound fields; anything else is caught.
 */

import type { PingObject } from "@/lib/ping/types";
import type { ObjectGraph } from "../sitespec/types";

/** One factual predicate inside generated copy, bound to an object field. */
export interface CopyBinding {
  objectId: string;
  /** "title" | "description" | a key of fields. */
  field: string;
  /** The object's provenance ref at bind time; must still match. */
  claimRef: string | null;
}

/**
 * Copy classification (Nolan 2026-09-25, binding).
 *
 * - "DIRECT_FACT": a recorded fact, e.g. "Open 24 hours". Text is bound
 *   to object fields; every binding must resolve.
 * - "DERIVED_FACT": a fact derived from evidence, e.g. "Serves Grand
 *   Junction and surrounding areas". Text is bound; derivation is labeled
 *   downstream, never presented as a verified fact.
 * - "GENERATED_COPY": AI-generated marketing copy, e.g. "Comfort you can
 *   count on". Pure presentation: it may exist, but it MUST NOT carry
 *   evidence bindings, because a binding would let marketing copy ride an
 *   evidence seam and silently become a factual object claim.
 * - "USER_COPY": owner-written text. Bound like a fact; the citation basis
 *   downstream names the owner as the source.
 *
 * Maps to the render layer's BindingClassification vocabulary
 * ("direct" | "derived" | "generated" | "owner_authored", owned by
 * src/fyd/sitespec/graph.ts) via copyClassToBindingClassification. This
 * module owns copy-level enforcement; the binding verifier owns
 * render-level enforcement. No duplication.
 */
export type CopyClass = "DIRECT_FACT" | "DERIVED_FACT" | "GENERATED_COPY" | "USER_COPY";

/** CopyClass -> the render layer's binding classification vocabulary. */
export function copyClassToBindingClassification(
  copyClass: CopyClass,
): "direct" | "derived" | "generated" | "owner_authored" {
  switch (copyClass) {
    case "DIRECT_FACT":
      return "direct";
    case "DERIVED_FACT":
      return "derived";
    case "GENERATED_COPY":
      return "generated";
    case "USER_COPY":
      return "owner_authored";
  }
}

/** Generated copy for one render slot. */
export interface GeneratedCopySlot {
  slotId: string;
  /** Section id this copy renders in. */
  sectionId: string;
  text: string;
  bindings: CopyBinding[];
  /**
   * The copy classification. Required: unclassified copy cannot be
   * verified, and unverifiable copy must never reach the renderer.
   * GENERATED_COPY slots must carry zero bindings (pure presentation);
   * factual classes must carry at least one resolved binding.
   */
  copyClass: CopyClass;
}

export interface GeneratedPresentation {
  version: 1;
  slots: GeneratedCopySlot[];
}

export interface GeneratedPresentationFinding {
  slotId: string;
  code:
    | "ungrounded-copy"
    | "unknown-object"
    | "unknown-field"
    | "claim-mismatch"
    | "private-object-in-public-copy"
    | "prohibited-positioning"
    | "generated-copy-with-bindings";
  message: string;
}

function fieldPresent(o: PingObject, field: string): boolean {
  if (field === "title") return o.title.trim() !== "";
  if (field === "description") return o.description.trim() !== "";
  const v = o.fields[field];
  return typeof v === "string" ? v.trim() !== "" : Array.isArray(v) && v.length > 0;
}

function containsProhibited(text: string, prohibited: string[]): string | null {
  const lower = text.toLowerCase();
  for (const p of prohibited) {
    const needle = p.toLowerCase().trim();
    if (needle === "") continue;
    // Word-boundary match so "best" does not fire inside "bestiality",
    // but multi-word phrases match as substrings.
    const pattern = new RegExp(
      "(^|[^a-z0-9])" + needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)",
    );
    if (pattern.test(lower)) return p;
  }
  return null;
}

/**
 * Verify every slot. Returns { valid, findings }; empty findings means the
 * presentation is fully evidence-bound. Deterministic: pure function of
 * (slots, graph, prohibited list).
 */
export function verifyGeneratedPresentation(
  gp: GeneratedPresentation,
  graph: ObjectGraph,
  prohibitedPositioning: string[],
): { valid: boolean; findings: GeneratedPresentationFinding[] } {
  const findings: GeneratedPresentationFinding[] = [];
  const byId = new Map(graph.objects.map((o) => [o.id, o]));
  for (const slot of gp.slots) {
    const at = (code: GeneratedPresentationFinding["code"], message: string) =>
      findings.push({ slotId: slot.slotId, code, message });

    if (slot.text.trim() === "") continue; // empty copy makes no claims.

    const hit = containsProhibited(slot.text, prohibitedPositioning);
    if (hit !== null) {
      at(
        "prohibited-positioning",
        "slot text contains prohibited positioning \"" + hit + "\": refused.",
      );
    }
    if (slot.copyClass === "GENERATED_COPY") {
      // Generated marketing copy is pure presentation: it may exist, but
      // it must NEVER ride an evidence binding, because a binding would
      // let it silently become a factual object claim in the render.
      // Refused outright, never silently stripped: stripping would
      // reclassify the author's intent without saying so.
      if (slot.bindings.length > 0) {
        at(
          "generated-copy-with-bindings",
          "GENERATED_COPY slot carries " + slot.bindings.length +
            " evidence binding(s): generated copy may never bind object facts. Refused.",
        );
      }
      continue;
    }

    if (slot.bindings.length === 0) {
      at("ungrounded-copy", "slot has text but no factual bindings: refused.");
      continue;
    }
    const lowerText = slot.text.toLowerCase();
    for (const b of slot.bindings) {
      const o = byId.get(b.objectId);
      if (!o) {
        at("unknown-object", "binding references unknown object \"" + b.objectId + "\".");
        continue;
      }
      if (!fieldPresent(o, b.field)) {
        at(
          "unknown-field",
          "binding references field \"" + b.field + "\" on \"" + b.objectId +
            "\" which is absent or empty.",
        );
        continue;
      }
      // THE evidence-binding check: the slot text must actually contain the
      // bound field's value. A slot whose text drifts from its bindings is
      // ungrounded copy wearing a binding as camouflage.
      const value = fieldText(o, b.field).toLowerCase().trim();
      if (value === "" || !lowerText.includes(value)) {
        at(
          "claim-mismatch",
          "slot text does not contain the bound value of field \"" + b.field +
            "\" on \"" + b.objectId + "\": the copy is not grounded in its bindings.",
        );
      }
      const actualRef = o.provenance?.ref ?? null;
      if (b.claimRef !== actualRef) {
        at(
          "claim-mismatch",
          "binding claim ref does not match the object's provenance ref.",
        );
      }
      if (o.visibility !== "public") {
        at(
          "private-object-in-public-copy",
          "binding references non-public object \"" + b.objectId +
            "\": visibility is an owner decision, the fact is untouched, the copy is refused.",
        );
      }
    }
  }
  return { valid: findings.length === 0, findings };
}

/** The bound field's text, for the grounding check. */
function fieldText(o: PingObject, field: string): string {
  if (field === "title") return o.title;
  if (field === "description") return o.description;
  const v = o.fields[field];
  return typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : "";
}

/** Fail closed: throw on the first finding. The planner calls this. */
export function assertGeneratedPresentationVerified(
  gp: GeneratedPresentation,
  graph: ObjectGraph,
  prohibitedPositioning: string[],
): void {
  const { findings } = verifyGeneratedPresentation(gp, graph, prohibitedPositioning);
  if (findings.length > 0) {
    const f = findings[0];
    throw new Error(
      "Generated presentation refused (" + f.code + ") in slot \"" + f.slotId + "\": " + f.message,
    );
  }
}
