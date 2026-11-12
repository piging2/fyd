"use client";

/**
 * SpatialCanvas: the spatial object stage for /objects/spatial.
 *
 * Renders nodes from a SpatialSpec via toViewport. The center node is the
 * focused object (Happy Place at home); satellites orbit it. Activating a
 * service/location satellite fetches its projection and refocuses: the
 * spec re-derives, layoutId morphs the newly focused node to center, and
 * Happy Place recedes to a parent satellite. Action satellites (ask,
 * evidence, contact) engage the center in a mode instead of refocusing.
 *
 * Keyboard: roving tabindex over satellites, ArrowRight/ArrowDown = next,
 * ArrowLeft/ArrowUp = previous, Enter/Space activates, Escape backs out
 * (engaged -> home). Reduced motion: a plain vertical list with identical
 * semantics and zero-duration transitions.
 */

import * as React from "react";
import { AnimatePresence, useReducedMotion } from "framer-motion";
import type {
  ContactProjection,
  ObjectProjection,
  RelatedRef,
} from "@/fyd/object/object-projection";
import {
  deriveSpatialSpec,
  keyboardOrder,
  toViewport,
  type SpatialNode,
  type SpatialSpec,
} from "@/fyd/spatial/object-space";
import {
  CenterPortal,
  INITIAL_CIRCLE_STATE,
  circleReducer,
  type CircleEvent,
  type CircleMachineState,
  type SnapshotInfo,
} from "./center-portal";
import { SpatialNodeButton } from "./spatial-node";
import { ContactFacts, EvidenceView } from "./center-portal";
import { SpatialAskPanel } from "./spatial-ask-panel";
import { focusAndReveal } from "./focus-and-reveal";

const HOME_ID = "happy-place";

interface RelatedPayload {
  ok: boolean;
  projection?: ObjectProjection;
  error?: string;
}

function firstWord(name: string): string {
  const w = name.trim().split(/\s+/)[0];
  return w && w.length <= 14 ? w : name.slice(0, 12);
}

const GLYPHS: Record<string, string> = {
  ask: "?",
  evidence: "!",
  contact: "@",
  parent: "<-",
};

function findRef(
  refs: RelatedRef[],
  id: string,
): RelatedRef | undefined {
  return refs.find((r) => r.id === id);
}

export function SpatialCanvas({
  initialProjection,
  initialSpec,
  snapshot,
}: {
  initialProjection: ObjectProjection;
  initialSpec: SpatialSpec;
  /** Website snapshot for the center; null until the capture lands. */
  snapshot: SnapshotInfo | null;
}) {
  const reducedMotion = useReducedMotion();
  const [spec, setSpec] = React.useState<SpatialSpec>(initialSpec);
  const [projections, setProjections] = React.useState<
    Record<string, ObjectProjection>
  >({ [initialProjection.id]: initialProjection });
  const [machine, setMachine] = React.useState<CircleMachineState>(
    INITIAL_CIRCLE_STATE,
  );
  const [contactOpen, setContactOpen] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [canHover, setCanHover] = React.useState(false);
  const [coarse, setCoarse] = React.useState(false);
  const [stage, setStage] = React.useState({ w: 960, h: 620 });
  const [roving, setRoving] = React.useState(0);
  const [view, setView] = React.useState<"orbit" | "list">("orbit");
  const [narrow, setNarrow] = React.useState(false);
  const listView = Boolean(reducedMotion || narrow || view === "list");

  const stageRef = React.useRef<HTMLDivElement>(null);
  const collapsedBtnRef = React.useRef<HTMLButtonElement>(null);
  const engagedRef = React.useRef<HTMLDivElement>(null);
  const satRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());
  const contextHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const requestRef = React.useRef<AbortController | null>(null);
  const returnNodeIdRef = React.useRef<string | null>(null);
  const focusIntentRef = React.useRef<string | null>(null);
  const retryNodeRef = React.useRef<SpatialNode | null>(null);
  const retryButtonRef = React.useRef<HTMLButtonElement>(null);

  const focusedId = spec.focusedObjectId;
  const focus = projections[focusedId] ?? initialProjection;
  const home = projections[HOME_ID] ?? initialProjection;
  const isHome = focusedId === HOME_ID;
  const order = keyboardOrder(spec);
  const center = order.find((node) => node.role === "center");
  const satellites = order.filter((node) => node.role !== "center");
  // The parent already has a Back control in list view. Keyboard traversal
  // must use exactly the nodes that have rendered satellite controls.
  const renderedSatellites = listView
    ? satellites.filter((node) => node.role !== "parent")
    : satellites;

  // Ask FYD scoping: the business slug is not a graph object id, so the
  // home focus asks with no objectId (the pipeline defaults to the site's
  // business object). Service/location focuses pass their graph ids.
  const askObjectId = isHome ? undefined : focusedId;

  // Contact fallback (Worker A contract): a service focus with no contact
  // facts of its own shows the parent business's contact, labeled as such.
  const hasContactFacts = (c: ContactProjection) =>
    Boolean(c.phone || c.email || c.website);
  const useFallbackContact = !hasContactFacts(focus.contact);
  const effectiveContact = useFallbackContact ? home.contact : focus.contact;
  const contactOwnerName = useFallbackContact ? home.name : focus.name;

  // Stage measurement.
  React.useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStage({ w: rect.width, h: rect.height });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [listView]);

  // Pointer capabilities.
  React.useEffect(() => {
    const narrowViewport = window.matchMedia("(max-width: 639px)");
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const active = document.activeElement;
      const selectedSatellite = [...satRefs.current].find(([, element]) => element === active);
      if (selectedSatellite) focusIntentRef.current = selectedSatellite[0];
      else if (active === collapsedBtnRef.current || engagedRef.current?.contains(active)) {
        focusIntentRef.current = "heading";
      }
      setNarrow(narrowViewport.matches);
      setCanHover(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
      setCoarse(window.matchMedia("(pointer: coarse)").matches);
    };
    update();
    narrowViewport.addEventListener("change", update);
    motionPreference.addEventListener("change", update);
    return () => {
      narrowViewport.removeEventListener("change", update);
      motionPreference.removeEventListener("change", update);
      requestRef.current?.abort();
    };
  }, []);

  React.useLayoutEffect(() => {
    const target = focusIntentRef.current;
    if (!target) return;
    const element = target === "heading"
      ? contextHeadingRef.current
      : target === "details"
        ? engagedRef.current
        : target === "center"
          ? (listView ? contextHeadingRef.current : collapsedBtnRef.current)
          : (satRefs.current.get(target) ?? contextHeadingRef.current);
    if (element) {
      focusIntentRef.current = null;
      focusAndReveal(element);
    }
  }, [focusedId, listView, machine, contactOpen, pendingId]);

  // Mirror availability is resolved server-side from the capture manifest;
  // the client only renders what the server verified. No client probing.

  const dispatch = React.useCallback((e: CircleEvent) => {
    setMachine((s) => circleReducer(s, e));
  }, []);

  const cancelPending = React.useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setPendingId(null);
  }, []);

  const goHome = React.useCallback(() => {
    cancelPending();
    focusIntentRef.current = returnNodeIdRef.current ?? "heading";
    const next = deriveSpatialSpec({ focus: home });
    if (!next) return;
    setSpec(next);
    setMachine(INITIAL_CIRCLE_STATE);
    setContactOpen(false);
    setFetchError(null);
    const originIndex = keyboardOrder(next)
      .filter(node => node.role !== "center")
      .findIndex(node => node.objectId === returnNodeIdRef.current);
    setRoving(Math.max(0, originIndex));
  }, [cancelPending, home]);

  const refocus = React.useCallback(
    (projection: ObjectProjection, parent?: ObjectProjection) => {
      const next = deriveSpatialSpec({ focus: projection, parent });
      if (!next) {
        setPendingId(null);
        setFetchError("That object has no spatial view right now.");
        return false;
      }
      focusIntentRef.current = "heading";
      setProjections((p) => ({ ...p, [projection.id]: projection }));
      setSpec(next);
      setMachine({ state: "expanded", evidence: false, closePending: false });
      setContactOpen(false);
      setFetchError(null);
      setPendingId(null);
      setRoving(0);
      return true;
    },
    [],
  );

  const activateNode = React.useCallback(
    (node: SpatialNode) => {
      // Retry disappears while a request is pending. Return focus to the
      // stable originating control before removing the focused button.
      if (document.activeElement === retryButtonRef.current) {
        const origin = satRefs.current.get(node.objectId) ?? contextHeadingRef.current;
        if (origin) focusAndReveal(origin);
        // Recheck after removing the error panel changes the layout.
        focusIntentRef.current = node.objectId;
      }
      cancelPending();
      retryNodeRef.current = null;
      setFetchError(null);
      if (node.role === "ask") {
        setMachine({ state: "expanded", evidence: false, closePending: false });
        setContactOpen(false);
        dispatch({ type: "askOpen" });
        focusIntentRef.current = "details";
        return;
      }
      if (node.role === "evidence") {
        setMachine(current => ({ state: "expanded", evidence: !current.evidence, closePending: false }));
        setContactOpen(false);
        focusIntentRef.current = "details";
        return;
      }
      if (node.role === "contact") {
        setMachine({ state: "expanded", evidence: false, closePending: false });
        setContactOpen(true);
        focusIntentRef.current = "details";
        return;
      }
      if (node.role === "parent") {
        goHome();
        return;
      }
      // Real object satellite: fetch its projection, then refocus.
      returnNodeIdRef.current = node.objectId;
      if (projections[node.objectId]) {
        refocus(projections[node.objectId], home);
        return;
      }
      const request = new AbortController();
      requestRef.current = request;
      setPendingId(node.objectId);
      fetch(`/api/fyd/objects/${encodeURIComponent(node.objectId)}`, { signal: request.signal })
        .then(async (res) => {
          let data: RelatedPayload | null = null;
          try {
            data = (await res.json()) as RelatedPayload;
          } catch {
            data = null;
          }
          if (requestRef.current !== request) return;
          if (!res.ok || !data || !data.ok || !data.projection) {
            retryNodeRef.current = node;
            setFetchError(
              "Could not load that object. Please try again.",
            );
            setPendingId(null);
            return;
          }
          if (!refocus(data.projection, home)) retryNodeRef.current = node;
        })
        .catch(() => {
          if (requestRef.current !== request || request.signal.aborted) return;
          retryNodeRef.current = node;
          setFetchError("Could not load that object. Please try again.");
          setPendingId(null);
        });
    },
    [cancelPending, dispatch, goHome, home, projections, refocus],
  );

  // Escape closes the current detail before returning to the business.
  const onStageKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (pendingId) {
        cancelPending();
        return;
      }
      if (machine.state === "ask") {
        focusIntentRef.current = "ask-fyd";
        dispatch({ type: "askClose" });
      } else if (contactOpen || machine.evidence) {
        focusIntentRef.current = contactOpen ? `${focusedId}-contact` : `${focusedId}-evidence`;
        setContactOpen(false);
        setMachine({ state: "expanded", evidence: false, closePending: false });
      } else if (!isHome) {
        goHome();
      } else if (machine.state === "expanded") {
        focusIntentRef.current = "center";
        setMachine(INITIAL_CIRCLE_STATE);
      }
      return;
    }
    const sats = renderedSatellites;
    const active = document.activeElement;
    const idx = sats.findIndex((n) => satRefs.current.get(n.objectId) === active);
    if (idx === -1) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % sats.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (idx - 1 + sats.length) % sats.length;
    else return;
    e.preventDefault();
    const node = sats[next];
    if (!node) return;
    setRoving(next);
    satRefs.current.get(node.objectId)?.focus();
  };

  const metaFor = (node: SpatialNode): { label: string; glyph: string; aria: string } => {
    const focusName = focus.name;
    switch (node.role) {
      case "ask":
        return {
          label: "Ask",
          glyph: GLYPHS.ask,
          aria: `Ask about ${focusName}`,
        };
      case "evidence":
        return {
          label: "Why",
          glyph: GLYPHS.evidence,
          aria: `Why this: evidence for ${focusName}`,
        };
      case "contact":
        return {
          label: "Contact",
          glyph: GLYPHS.contact,
          aria: `Contact details for ${focusName}`,
        };
      case "parent": {
        const p = projections[node.objectId];
        const name = p ? p.name : "Happy Place";
        return {
          label: "Back",
          glyph: GLYPHS.parent,
          aria: `Back to ${name}`,
        };
      }
      case "service": {
        const ref = findRef(focus.serviceRefs, node.objectId);
        const name = ref ? ref.name : node.objectId;
        return {
          label: firstWord(name),
          glyph: firstWord(name).slice(0, 1).toUpperCase(),
          aria: `${name}, service offered by ${focusName}`,
        };
      }
      case "location": {
        const ref = focus.locationRef;
        const name = ref ? ref.name : node.objectId;
        return {
          label: firstWord(name),
          glyph: "L",
          aria: `${name}, location of ${focusName}`,
        };
      }
      default:
        return { label: node.role, glyph: "?", aria: node.role };
    }
  };

  const orientation = (
    <div className="mx-auto max-w-5xl px-4 pt-6">
      <h2 ref={contextHeadingRef} tabIndex={-1} className="scroll-mt-24 text-lg font-semibold text-purple-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-200">
        {isHome ? home.name : `${home.name} › ${focus.name}`}
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!isHome && (
          <button type="button" onClick={goHome} className="min-h-11 rounded-full border border-amber-200/40 px-4 text-sm font-semibold text-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2">
            Back to {home.name}
          </button>
        )}
        <div role="group" aria-label="Object view" className="flex gap-2">
          <button
            type="button"
            aria-pressed={!listView}
            disabled={Boolean(reducedMotion || narrow)}
            onClick={() => setView("orbit")}
            className="min-h-11 rounded-full border border-purple-300/50 px-4 text-sm font-semibold text-purple-50 aria-pressed:bg-purple-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Orbit
          </button>
          <button type="button" aria-pressed={listView} onClick={() => setView("list")} className="min-h-11 rounded-full border border-purple-300/50 px-4 text-sm font-semibold text-purple-50 aria-pressed:bg-purple-800 focus-visible:outline-2 focus-visible:outline-offset-2">
            List
          </button>
        </div>
        <a href="/objects" className="inline-flex min-h-11 items-center px-2 text-sm text-purple-100 underline underline-offset-4">
          Open object directory
        </a>
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm text-purple-100">
        {pendingId ? `Loading ${retryNodeRef.current?.label ?? satellites.find(node => node.objectId === pendingId)?.label ?? "object"}…` : ""}
      </p>
      {fetchError && (
        <div role="alert" className="mb-3 rounded-xl border border-red-300/50 bg-red-950/80 p-3 text-sm text-red-100">
          <p>{fetchError}</p>
          {retryNodeRef.current && (
            <button ref={retryButtonRef} type="button" onClick={() => activateNode(retryNodeRef.current!)} className="min-h-11 font-semibold underline underline-offset-4">
              Retry loading {retryNodeRef.current.label}
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (listView) {
    return (
      <div onKeyDown={onStageKeyDown} className="w-full">
        {orientation}
        <div className="mx-auto w-full max-w-xl px-4 pb-6">
          <ul className="space-y-2">
            {renderedSatellites.map((node, i) => {
              const m = metaFor(node);
              return (
                <li key={node.objectId}>
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) satRefs.current.set(node.objectId, el);
                      else satRefs.current.delete(node.objectId);
                    }}
                    tabIndex={i === Math.min(roving, renderedSatellites.length - 1) ? 0 : -1}
                    onClick={() => activateNode(node)}
                    aria-label={m.aria}
                    aria-busy={pendingId === node.objectId}
                    className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-purple-200 bg-white px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-900 text-sm font-bold text-amber-100"
                    >
                      {m.glyph}
                    </span>
                    <span className="text-sm font-medium text-stone-900">
                      {m.label}
                    </span>
                    <span className="ml-auto text-xs text-stone-500">
                      {node.role}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div ref={engagedRef} tabIndex={-1} role="region" aria-label={focus.name + " details"} className="mt-6 rounded-2xl border border-purple-300/40 bg-purple-950 p-5 text-purple-50 focus-visible:outline-2 focus-visible:outline-offset-4">
            {machine.state === "ask" ? (
              <SpatialAskPanel key={focus.id} siteId={HOME_ID} objectId={askObjectId} objectName={focus.name} sampleQuestions={focus.sampleQuestions} />
            ) : contactOpen ? (
              <>
                <h3 className="font-semibold">Contact {contactOwnerName}</h3>
                <ContactFacts contact={effectiveContact} />
              </>
            ) : machine.evidence ? (
              <EvidenceView projection={focus} snapshot={isHome ? snapshot : null} />
            ) : (
              <>
                <h3 className="text-lg font-bold">{focus.name}</h3>
                <p className="text-sm text-purple-200">{focus.kindLabel}</p>
                {snapshot && isHome && (
                  <img
                    src={snapshot.src}
                    srcSet={snapshot.srcSet || undefined}
                    alt={`${focus.name} website snapshot`}
                    className="mt-3 w-full rounded-xl"
                    style={{ aspectRatio: "16 / 10", objectFit: "cover" }}
                  />
                )}
                {focus.summary && focus.summary.evidence.state !== "unknown" && (
                  <p className="mt-2 text-sm text-purple-100">{focus.summary.value}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={`/o/${encodeURIComponent(focus.id)}`}
                    className="flex min-h-[44px] items-center rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                  >
                    Open full node
                  </a>
                </div>
                <p className="mt-3 text-xs text-purple-200">
                  {focus.provenance.label}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const engagedR = Math.min(stage.w, stage.h) * 0.36;
  const centerVp = center ? toViewport(center, stage) : { x: stage.w / 2, y: stage.h / 2, r: 90 };

  return (
    <div className="w-full" onKeyDown={onStageKeyDown}>
      {orientation}
      <div
        ref={stageRef}
        className="relative mx-auto w-full overflow-hidden"
        style={{ minHeight: "70vh" }}
        aria-label={`${focus.name} object space`}
      >
        <AnimatePresence>
          {center && (
            <CenterPortal
              key={`center-${center.objectId}`}
              projection={focus}
              x={centerVp.x}
              y={centerVp.y}
              r={centerVp.r}
              engagedR={engagedR}
              snapshot={isHome ? snapshot : null}
              askObjectId={askObjectId}
              contact={effectiveContact}
              contactOwnerName={contactOwnerName}
              machine={machine}
              dispatch={dispatch}
              contactOpen={contactOpen}
              onContactClose={() => setContactOpen(false)}
              canHover={canHover}
              collapsedBtnRef={collapsedBtnRef}
              engagedRef={engagedRef}
            />
          )}
          {satellites.map((node, i) => {
            const vp = toViewport(node, stage);
            const rr = coarse ? Math.max(vp.r, 24) : vp.r;
            const m = metaFor(node);
            const pending = pendingId === node.objectId;
            return (
              <SpatialNodeButton
                key={node.objectId}
                node={node}
                x={vp.x}
                y={vp.y}
                r={rr}
                label={pending ? "..." : m.label}
                glyph={pending ? "..." : m.glyph}
                ariaLabel={pending ? `Loading ${m.label}` : m.aria}
                tabIndex={i === roving ? 0 : -1}
                onActivate={activateNode}
                buttonRef={(el) => {
                  if (el) satRefs.current.set(node.objectId, el);
                  else satRefs.current.delete(node.objectId);
                }}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
