/**
 * One-expanded coordination for the object layer.
 *
 * Module-level on purpose: every expandable on the page (margin circle,
 * cluster popover, mobile sheet card) shares the rule no matter where it
 * renders. Claim ids are plain strings: object ids for objects,
 * "cluster:<id>" for cluster popovers, "sheet" for the mobile sheet.
 * Generic; no per-object logic.
 */

type Listener = (activeId: string | null) => void;

const listeners = new Set<Listener>();
let activeId: string | null = null;

/** Claim the expanded slot (or pass null to release it). Collapses others. */
export function claimExpanded(id: string | null): void {
  activeId = id;
  listeners.forEach((fn) => fn(id));
}

export function subscribeExpanded(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function currentExpandedId(): string | null {
  return activeId;
}

type OpenRequestListener = (objectId: string) => void;

const openRequestListeners = new Set<OpenRequestListener>();

/**
 * Ask the slot that owns `objectId` to expand it. Generic peer-jump bus:
 * a card's "related object" link resolves through navigation first (see
 * requestObjectNavigate); whichever slot (single circle, cluster, or
 * sheet) owns the id opens it. Unknown ids no-op.
 */
export function requestObjectOpen(objectId: string): void {
  openRequestListeners.forEach((fn) => fn(objectId));
}

export function subscribeOpenRequest(fn: OpenRequestListener): () => void {
  openRequestListeners.add(fn);
  return () => {
    openRequestListeners.delete(fn);
  };
}

type NavigateRequestListener = (objectId: string) => void;

const navigateRequestListeners = new Set<NavigateRequestListener>();

/**
 * Ask the LAYER to navigate to `objectId`: collapse the current card,
 * scroll the owning slot into view when it is offscreen, then open it
 * via the open-request bus. Relationship links call this (not
 * requestObjectOpen directly) so an offscreen target is brought into
 * view first. The layer owns the scroll-then-open choreography;
 * requestObjectOpen stays the primitive the slots (and the mobile
 * sheet) listen on. Unknown ids no-op downstream.
 */
export function requestObjectNavigate(objectId: string): void {
  navigateRequestListeners.forEach((fn) => fn(objectId));
}

export function subscribeNavigateRequest(fn: NavigateRequestListener): () => void {
  navigateRequestListeners.add(fn);
  return () => {
    navigateRequestListeners.delete(fn);
  };
}
