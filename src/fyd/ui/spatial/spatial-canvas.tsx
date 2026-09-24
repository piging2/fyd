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

  const stageRef = React.useRef<HTMLDivElement>(null);
  const collapsedBtnRef = React.useRef<HTMLButtonElement>(null);
  const engagedRef = React.useRef<HTMLDivElement>(null);
  const satRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

  const focusedId = spec.focusedObjectId;
  const focus = projections[focusedId] ?? initialProjection;
  const home = projections[HOME_ID] ?? initialProjection;
  const isHome = focusedId === HOME_ID;

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
  }, []);

  // Pointer capabilities.
  React.useEffect(() => {
    setCanHover(
      window.matchMedia("(hover: hover) and (pointer: fine)").matches,
    );
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  // Mirror availability is resolved server-side from the capture manifest;
  // the client only renders what the server verified. No client probing.

  const dispatch = React.useCallback((e: CircleEvent) => {
    setMachine((s) => circleReducer(s, e));
  }, []);

  const goHome = React.useCallback(() => {
    const next = deriveSpatialSpec({ focus: home });
    if (!next) return;
    setSpec(next);
    setMachine(INITIAL_CIRCLE_STATE);
    setContactOpen(false);
    setFetchError(null);
    setRoving(0);
  }, [home]);

  const refocus = React.useCallback(
    (projection: ObjectProjection, parent?: ObjectProjection) => {
      const next = deriveSpatialSpec({ focus: projection, parent });
      if (!next) {
        setFetchError("That object has no spatial view right now.");
        return;
      }
      setProjections((p) => ({ ...p, [projection.id]: projection }));
      setSpec(next);
      setMachine({ state: "expanded", evidence: false, closePending: false });
      setContactOpen(false);
      setFetchError(null);
      setPendingId(null);
      setRoving(0);
    },
    [],
  );

  const activateNode = React.useCallback(
    (node: SpatialNode) => {
      setFetchError(null);
      if (node.role === "ask") {
        setMachine({ state: "expanded", evidence: false, closePending: false });
        setContactOpen(false);
        dispatch({ type: "askOpen" });
        engagedRef.current?.focus({ preventScroll: true });
        return;
      }
      if (node.role === "evidence") {
        setMachine({ state: "expanded", evidence: false, closePending: false });
        setContactOpen(false);
        dispatch({ type: "evidenceToggle" });
        engagedRef.current?.focus({ preventScroll: true });
        return;
      }
      if (node.role === "contact") {
        setMachine({ state: "expanded", evidence: false, closePending: false });
        setContactOpen(true);
        engagedRef.current?.focus({ preventScroll: true });
        return;
      }
      if (node.role === "parent") {
        goHome();
        return;
      }
      // Real object satellite: fetch its projection, then refocus.
      if (projections[node.objectId]) {
        refocus(projections[node.objectId], home);
        return;
      }
      setPendingId(node.objectId);
      fetch(`/api/fyd/objects/${encodeURIComponent(node.objectId)}`)
        .then(async (res) => {
          let data: RelatedPayload | null = null;
          try {
            data = (await res.json()) as RelatedPayload;
          } catch {
            data = null;
          }
          if (!res.ok || !data || !data.ok || !data.projection) {
            setFetchError(
              "Could not load that object. Please try again.",
            );
            setPendingId(null);
            return;
          }
          refocus(data.projection, home);
        })
        .catch(() => {
          setFetchError("Could not load that object. Please try again.");
          setPendingId(null);
        });
    },
    [dispatch, goHome, home, projections, refocus],
  );

  // Escape backs out: ask -> expanded, engaged/contact -> home.
  const onStageKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (machine.state === "ask") {
        dispatch({ type: "askClose" });
        return;
      }
      if (machine.state === "expanded" || contactOpen || !isHome) {
        goHome();
        window.setTimeout(
          () => collapsedBtnRef.current?.focus({ preventScroll: true }),
          60,
        );
      }
      return;
    }
    const order = keyboardOrder(spec);
    const sats = order.filter((n) => n.role !== "center");
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

  const order = keyboardOrder(spec);
  const center = order.find((n) => n.role === "center");
  const satellites = order.filter((n) => n.role !== "center");

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

  // Reduced motion: plain vertical list, same semantics, no animation.
  if (reducedMotion) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        {!isHome && (
          <button
            type="button"
            onClick={goHome}
            className="mb-4 min-h-[44px] rounded-full border border-purple-300 bg-white px-5 py-2 text-sm font-semibold text-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
          >
            Back to {home.name}
          </button>
        )}
        <ul className="space-y-2">
          {order.map((node) => {
            const m = metaFor(node);
            return (
              <li key={node.objectId}>
                <button
                  type="button"
                  onClick={() => activateNode(node)}
                  aria-label={m.aria}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-purple-200 bg-white px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-900 text-sm font-bold text-amber-100"
                  >
                    {m.glyph}
                  </span>
                  <span className="text-sm font-medium text-stone-900">
                    {node.role === "center" ? focus.name : m.label}
                  </span>
                  <span className="ml-auto text-xs text-stone-500">
                    {node.role}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 rounded-2xl border border-purple-200 bg-white p-5">
          <h2 className="text-lg font-bold text-stone-900">{focus.name}</h2>
          <p className="text-sm text-stone-500">{focus.kindLabel}</p>
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
            <p className="mt-2 text-sm text-stone-700">{focus.summary.value}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`/o/${encodeURIComponent(focus.id)}`}
              className="flex min-h-[44px] items-center rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            >
              Open full node
            </a>
            <a
              href="/objects"
              className="flex min-h-[44px] items-center rounded-full border border-purple-300 px-5 py-2 text-sm font-semibold text-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            >
              Rectangle version
            </a>
          </div>
          <p className="mt-3 text-xs text-stone-500">
            {focus.provenance.label}
          </p>
        </div>
      </div>
    );
  }

  const engagedR = Math.min(stage.w, stage.h) * 0.36;
  const centerVp = center ? toViewport(center, stage) : { x: stage.w / 2, y: stage.h / 2, r: 90 };

  return (
    <div className="w-full">
      {!isHome && (
        <div className="mx-auto flex max-w-5xl justify-start px-4 pt-2">
          <button
            type="button"
            onClick={goHome}
            className="min-h-[44px] rounded-full border border-amber-200/40 bg-purple-950/90 px-5 py-2 text-sm font-semibold text-amber-100 hover:bg-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            Back to {home.name}
          </button>
        </div>
      )}
      <div
        ref={stageRef}
        onKeyDown={onStageKeyDown}
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
              snapshot={snapshot}
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
        {fetchError && (
          <p
            role="alert"
            className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-red-950/90 px-5 py-2 text-sm text-red-100"
          >
            {fetchError}
          </p>
        )}
      </div>
      <div className="mx-auto flex max-w-5xl justify-center px-4 pb-6">
        <a
          href="/objects"
          className="text-sm text-purple-200 underline decoration-dotted underline-offset-4 hover:text-purple-100"
        >
          Rectangle version
        </a>
      </div>
    </div>
  );
}
