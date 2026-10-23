/** Browser-safe projections through the existing factual binding gate. */
import { resolveSafeLink, type SafeLinkResult } from './safe-link';
import type { PingObject } from '../../lib/ping/types';
import type { ObjectGraph } from './types';
import { classifyRenderAtom, ownerAssertionsFromGraph, type PresentationBinding } from './binding-verifier';
export function visitorBinding(graph: ObjectGraph, object: PingObject, field: string): PresentationBinding {
  const owner = ownerAssertionsFromGraph(graph).some(a => a.objectId === object.id && a.field === field);
  return { objectId: object.id, field, classification: owner ? 'owner_authored' : object.provenance?.kind === 'website-derived' ? 'direct' : 'derived' };
}

export function visitorField(graph: ObjectGraph, object: PingObject, field: string): string | null {
  if (object.visibility !== 'public') return null;
  const atom = classifyRenderAtom(visitorBinding(graph, object, field), graph, ownerAssertionsFromGraph(graph));
  return atom.classification === 'UNKNOWN' || typeof atom.value !== 'string' || !atom.value.trim() ? null : atom.value;
}

/** A complete sentence from the source, never completion of a truncated one. */
export function conciseSource(text: string): string {
  return text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim() ?? text;
}


/** Executable phone syntax is separate from the retained source value.
 * Explicit +1 numbers must follow NANPA's NXX-NXX-XXXX shape.
 * https://nanpa.com/about . This does not verify ownership or reachability. */
export function visitorCallLink(value: string | null): SafeLinkResult {
  const safe = resolveSafeLink(value, 'call');
  if (safe.kind !== 'safe' || !value) return safe;
  const digits = value.replace(/[^0-9]/g, '');
  if (value.trim().startsWith('+1') && !/^1[2-9][0-9]{2}[2-9][0-9]{6}$/.test(digits)) return {kind:'non_navigable'};
  return safe;
}

/** Field-level explanation over an already projected object. No raw reads. */
export function fieldExplanation(object: PingObject, field: string) {
  const effective = field === 'title' ? object.title : field === 'description' ? object.description : object.fields[field];
  if (typeof effective !== 'string' || !effective.trim()) return null;
  const correction = object.ownerFieldCorrections?.find(c => c.field === field);
  return {
    field, effectiveValue: effective,
    origin: correction ? 'owner' as const : object.provenance?.kind === 'website-derived' ? 'website' as const : 'record' as const,
    originalObservation: correction?.sourceValue ?? (correction ? null : effective),
    currentObservation: correction ? correction.currentSourceValue ?? correction.sourceValue : effective,
    ownerCorrection: correction?.ownerValue ?? null,
    actor: correction?.actorLabel ?? null,
    sourceDrifted: correction?.sourceDrifted ?? false,
  };
}
