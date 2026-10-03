"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { readObjectRelationship, setObjectRelationship, getRelationshipSessionGeneration, type RelationshipKind, type RelationshipResult, type RelationshipScope } from "@/fyd/capabilities/relationship-client";

export type RelationshipStatus = "loading" | "ready" | "pending" | "success" | "retryable-error" | "terminal-error";
export interface RelationshipSnapshot {
  state: boolean | null;
  status: RelationshipStatus;
  scope: RelationshipScope | null;
  message: string;
}
interface Transport {
  read: typeof readObjectRelationship;
  set: typeof setObjectRelationship;
}
const transport: Transport = { read: readObjectRelationship, set: setObjectRelationship };

/** Small testable async boundary: retain confirmed state and retry exact intent. */
export function createRelationshipController(objectId: string, kind: RelationshipKind, api: Transport = transport) {
  let snapshot: RelationshipSnapshot = { state: null, status: "loading", scope: null, message: "Loading your demo preference…" };
  const listeners = new Set<() => void>();
  let busy = false, generation = 0;
  let lastIntent: { desired?: boolean } | null = null;
  const update = (next: RelationshipSnapshot) => { snapshot = next; listeners.forEach(listener => listener()); };
  async function run(intent: { desired?: boolean }): Promise<void> {
    if (busy) return;
    busy = true;
    const version = ++generation;
    lastIntent = intent;
    update({ ...snapshot, status: intent.desired === undefined ? "loading" : "pending", message: intent.desired === undefined ? "Loading your demo preference…" : "Saving your demo preference…" });
    let result: RelationshipResult;
    try { result = intent.desired === undefined ? await api.read(objectId, kind) : await api.set(objectId, kind, intent.desired); }
    catch { result = { ok: false, code: "NETWORK_UNAVAILABLE", message: "Your choice could not be confirmed. Check your connection and retry.", retryable: true, scope: null }; }
    if (version !== generation) return;
    busy = false;
    if (!result.ok) {
      update({ ...snapshot, status: result.retryable ? "retryable-error" : "terminal-error", message: result.message });
      return;
    }
    update({ state: result.state, scope: result.scope, status: intent.desired === undefined ? "ready" : "success", message: intent.desired === undefined ? "Private demo preference for this browser." : "Saved for this browser’s demo session." });
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    load: () => run({}),
    toggle: () => {
      if (snapshot.state === null || busy || snapshot.status === "terminal-error" || snapshot.status === "retryable-error") return Promise.resolve();
      return run({ desired: !snapshot.state });
    },
    retry: () => snapshot.status === "retryable-error" && lastIntent ? run(lastIntent) : Promise.resolve(),
    cancel: () => { generation += 1; busy = false; },
  };
}

type Controller = ReturnType<typeof createRelationshipController>;
interface RegistryEntry { controller: Controller; refs: number; }

/**
 * Shared controllers, one per object+kind. Every mounted control for the
 * same object and relationship kind reads through the same controller, so
 * a follow from one view updates every other mounted view immediately and
 * the read is issued once no matter how many controls are mounted.
 */
const registry = new Map<string, RegistryEntry>();
let registrySessionGeneration = getRelationshipSessionGeneration();

function registryKey(objectId: string, kind: RelationshipKind): string {
  return `${objectId}:${kind}`;
}

function acquire(objectId: string, kind: RelationshipKind): RegistryEntry {
  const sessionGeneration = getRelationshipSessionGeneration();
  if (sessionGeneration !== registrySessionGeneration) {
    // Private session rotated (SESSION_REQUIRED): confirmed state belongs
    // to the old session and must not leak into the new one.
    for (const entry of registry.values()) entry.controller.cancel();
    registry.clear();
    registrySessionGeneration = sessionGeneration;
  }
  const key = registryKey(objectId, kind);
  let entry = registry.get(key);
  if (!entry) {
    entry = { controller: createRelationshipController(objectId, kind), refs: 0 };
    registry.set(key, entry);
  }
  entry.refs += 1;
  return entry;
}

function release(objectId: string, kind: RelationshipKind): void {
  const key = registryKey(objectId, kind);
  const entry = registry.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) registry.delete(key);
}

/** Test seam: drop all shared controllers. */
export function clearObjectRelationshipCache(): void {
  for (const entry of registry.values()) entry.controller.cancel();
  registry.clear();
}

export function useObjectRelationship(objectId: string, kind: RelationshipKind, enabled = true) {
  // Read the session generation during render so a rotation re-resolves
  // the shared entry even when objectId/kind are unchanged.
  const sessionGeneration = getRelationshipSessionGeneration();
  const key = registryKey(objectId, kind);
  const entry = useMemo(
    () => acquire(objectId, kind),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, sessionGeneration],
  );
  useEffect(() => {
    return () => release(objectId, kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sessionGeneration]);
  const controller = entry.controller;
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    if (enabled) void controller.load();
    // Intentionally no per-consumer cancel: the controller is shared across
    // every mounted control for this object+kind, and one consumer unmounting
    // (or toggling enabled) must not discard in-flight reads/writes still
    // serving the remaining consumers. Cancellation belongs to session
    // rotation and explicit cache teardown, which bump the generation.
  }, [controller, enabled]);
  return { ...snapshot, toggle: controller.toggle, retry: controller.retry };
}
