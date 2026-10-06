"use client";

/**
 * CenterPortal: the focused object at the middle of the spatial stage.
 *
 * One physical object across collapsed -> peek -> engaged, driven by the
 * shared circleReducer (collapsed | peek | expanded | ask). The Happy Place
 * center holds the sanctioned static website snapshot: a same-origin <img>
 * (src + srcSet) rendered object-fit: cover with object-position from the
 * manifest focal point. No iframe, no scripts, no invented visuals. When
 * the capture has not landed, the center fails closed with plain text.
 *
 * Engaged interior modes: site (snapshot), contact (evidence-graded facts),
 * evidence (provenance drill-down, including snapshot provenance), ask
 * (Ask FYD scoped to the focus). No cards, no modals, no sidebars.
 */

import * as React from "react";
import { motion } from "framer-motion";
import { spring } from "@/motion/motionTokens";
import type {
  ContactProjection,
  ObjectProjection,
} from "@/fyd/object/object-projection";
import {
  circleReducer,
  INITIAL_CIRCLE_STATE,
  type CircleEvent,
  type CircleMachineState,
} from "@/fyd/ui/circle-machine";
import { EvidenceStateLabel } from "@/fyd/ui/evidence-state";
import { WhyThis } from "@/fyd/ui/why-this";
import { focalToObjectPosition } from "@/fyd/preview/focal";
import { SpatialAskPanel } from "./spatial-ask-panel";

export type { CircleMachineState, CircleEvent };
export { circleReducer, INITIAL_CIRCLE_STATE };

/** Server-loaded website snapshot for the center. Null until capture lands. */
export interface SnapshotInfo {
  src: string;
  srcSet: string;
  width: number;
  height: number;
  focalX: number;
  focalY: number;
  provenance: {
    url: string;
    capturedAt: string;
    captureMethod: string;
    captureNote?: string;
  };
}

const SNAPSHOT_OBJECT_ID = "happy-place";
const SITE_UNAVAILABLE = "Site preview unavailable";

function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function GradientFace({ id, name }: { id: string; name: string }) {
  const hue = hashHue(id);
  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full items-center justify-center"
      style={{
        background: `radial-gradient(circle at 35% 30%, hsl(${hue},45%,42%), hsl(${(hue + 40) % 360},50%,18%))`,
      }}
    >
      <span className="px-6 text-center text-lg font-bold leading-snug text-amber-100">
        {name}
      </span>
    </div>
  );
}

function ContactFacts({ contact }: { contact: ContactProjection }) {
  const facts = [contact.phone, contact.email, contact.website].filter(
    (f): f is NonNullable<typeof f> => f !== null,
  );
  if (facts.length === 0) {
    return (
      <p className="text-sm text-purple-100">
        No contact details on record.
      </p>
    );
  }
  return (
    <ul className="w-full space-y-3 text-left">
      {facts.map((f) => (
        <li key={f.label}>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-purple-200">
            {f.label}
          </span>
          {f.evidence.state === "unknown" ? (
            <span className="text-sm text-purple-200">Not on record</span>
          ) : f.label === "Website" && f.value.startsWith("https://") ? (
            <a
              href={f.value}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-sm text-amber-200 underline underline-offset-2"
            >
              {f.value}
            </a>
          ) : (
            <span className="break-all text-sm text-purple-50">{f.value}</span>
          )}
          <span className="mt-1 block">
            <EvidenceStateLabel
              state={f.evidence.state}
              receipt={f.evidence.receipt}
              asOf={f.evidence.asOf}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function EvidenceView({
  projection,
  snapshot,
}: {
  projection: ObjectProjection;
  snapshot: SnapshotInfo | null;
}) {
  const p = projection.provenance;
  const steps = [
    { step: "Source", detail: p.ref, state: "observed" as const },
    { step: "Derived", detail: p.derivedAt, state: "inferred" as const },
  ];
  if (snapshot) {
    const cap = snapshot.provenance;
    const capturedDetail =
      `${cap.capturedAt} via ${cap.captureMethod}` +
      (cap.captureNote ? ` (${cap.captureNote})` : "");
    steps.push(
      {
        step: "Site snapshot",
        detail: cap.url,
        state: "observed" as const,
      },
      {
        step: "Captured",
        detail: capturedDetail,
        state: "observed" as const,
      },
    );
  }
  return (
    <div className="mx-auto w-full max-w-md px-6 text-left">
      <p className="text-center text-sm font-semibold text-purple-100">
        Why this object
      </p>
      <div className="mt-3">
        <WhyThis
          claim={p.label}
          steps={steps}
          className="text-purple-100 [&_div]:border-white/15 [&_div]:bg-black/30 [&_p]:text-purple-50"
        />
      </div>
      <p className="mt-3 text-center text-xs text-purple-200">
        Every fact shown carries its own evidence label. Unknown stays unknown.
      </p>
    </div>
  );
}

export function CenterPortal({
  projection,
  x,
  y,
  r,
  engagedR,
  snapshot,
  askObjectId,
  contact,
  contactOwnerName,
  machine,
  dispatch,
  contactOpen,
  onContactClose,
  canHover,
  collapsedBtnRef,
  engagedRef,
}: {
  projection: ObjectProjection;
  x: number;
  y: number;
  r: number;
  engagedR: number;
  /** Null until the website capture lands; center fails closed without it. */
  snapshot: SnapshotInfo | null;
  /** Graph object id for Ask FYD, or undefined for the site business object. */
  askObjectId?: string;
  /** Effective contact facts (service focus falls back to the business). */
  contact: ContactProjection;
  contactOwnerName: string;
  machine: CircleMachineState;
  dispatch: (e: CircleEvent) => void;
  contactOpen: boolean;
  onContactClose: () => void;
  canHover: boolean;
  collapsedBtnRef: React.Ref<HTMLButtonElement>;
  engagedRef: React.Ref<HTMLDivElement>;
}) {
  const engaged =
    machine.state === "expanded" || machine.state === "ask" || contactOpen;
  const d = engaged ? engagedR * 2 : Math.max(2 * r, 44);
  const engagedYOffset = -56;

  const hoverTimer = React.useRef<number | null>(null);
  const blurTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      if (blurTimer.current) window.clearTimeout(blurTimer.current);
    },
    [],
  );

  const onMouseEnter = () => {
    if (!canHover || engaged) return;
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    dispatch({ type: "hover" });
  };
  const onMouseLeave = () => {
    if (!canHover || engaged) return;
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(
      () => dispatch({ type: "unhover" }),
      250,
    );
  };
  const onFocus = () => {
    if (engaged) return;
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
    dispatch({ type: "focus" });
  };
  const onBlur = () => {
    if (engaged) return;
    dispatch({ type: "blur" });
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
    blurTimer.current = window.setTimeout(
      () => dispatch({ type: "blurSettled" }),
      150,
    );
  };

  const isSnapshotObject = projection.id === SNAPSHOT_OBJECT_ID;

  const face = () => {
    if (isSnapshotObject) {
      if (!snapshot) {
        return (
          <div className="flex h-full w-full items-center justify-center bg-purple-950 p-6">
            <p className="text-center text-sm text-purple-200">
              {SITE_UNAVAILABLE}
            </p>
          </div>
        );
      }
      return (
        <img
          src={snapshot.src}
          srcSet={snapshot.srcSet || undefined}
          alt={`${projection.name} website snapshot`}
          width={snapshot.width || undefined}
          height={snapshot.height || undefined}
          draggable={false}
          className="h-full w-full select-none"
          style={{
            objectFit: "cover",
            objectPosition: focalToObjectPosition({
              x: snapshot.focalX,
              y: snapshot.focalY,
            }),
          }}
        />
      );
    }
    return <GradientFace id={projection.id} name={projection.name} />;
  };

  if (!engaged) {
    const peek = machine.state === "peek";
    return (
      <motion.button
        type="button"
        ref={collapsedBtnRef}
        layoutId={`spatial-node-${projection.id}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: peek ? 1.12 : 1, opacity: 1, x, y }}
        exit={{ scale: 0, opacity: 0 }}
        transition={spring.snappy}
        onClick={() => dispatch({ type: "tap" })}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            dispatch({ type: "key", key: e.key });
          }
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-expanded={false}
        aria-label={`${projection.name}. Activate to expand.`}
        className="absolute left-0 top-0 overflow-hidden rounded-full border border-amber-200/40 bg-purple-950 shadow-[0_0_28px_rgba(232,180,90,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        style={{ width: d, height: d }}
      >
        {face()}
        {peek && (
          <span className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] font-semibold text-amber-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {projection.name}
          </span>
        )}
      </motion.button>
    );
  }

  return (
    <motion.div
      layoutId={`spatial-node-${projection.id}`}
      ref={engagedRef}
      tabIndex={-1}
      role="region"
      aria-label={`${projection.name}, expanded`}
      initial={{ scale: 0.6, opacity: 0, x, y: y + engagedYOffset }}
      animate={{ scale: 1, opacity: 1, x, y: y + engagedYOffset }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={spring.gentle}
      className="absolute left-0 top-0 focus-visible:outline-none"
      style={{ width: d, height: d }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-full border-2 border-amber-200/60 bg-purple-950 shadow-[0_0_60px_rgba(232,180,90,0.35)]">
        {machine.state === "ask" ? (
          <div className="flex h-full w-full items-center overflow-y-auto py-[16%]">
            <SpatialAskPanel
              objectId={askObjectId}
              objectName={projection.name}
              sampleQuestions={projection.sampleQuestions}
            />
          </div>
        ) : contactOpen ? (
          <div className="flex h-full w-full items-center overflow-y-auto">
            <div className="mx-auto w-full max-w-md px-[20%] py-[16%]">
              <p className="text-center text-sm font-semibold text-purple-100">
                Contact {contactOwnerName}
              </p>
              <div className="mt-3">
                <ContactFacts contact={contact} />
              </div>
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={onContactClose}
                  className="min-h-[44px] rounded-full border border-white/25 bg-white/10 px-5 py-2 text-sm text-purple-50 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  Back to site
                </button>
              </div>
            </div>
          </div>
        ) : machine.evidence ? (
          <div className="flex h-full w-full items-center overflow-y-auto py-[14%]">
            <EvidenceView projection={projection} snapshot={snapshot} />
          </div>
        ) : (
          face()
        )}
      </div>
      <div className="mt-3 flex flex-col items-center gap-2">
        <p className="text-center text-sm font-semibold text-purple-50">
          {projection.name}
          <span className="ml-2 text-xs font-normal text-purple-200">
            {projection.kindLabel}
          </span>
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() =>
              dispatch(
                machine.state === "ask"
                  ? { type: "askClose" }
                  : { type: "evidenceToggle" },
              )
            }
            aria-pressed={machine.evidence}
            className="min-h-[44px] rounded-full border border-amber-200/40 bg-purple-950/90 px-5 py-2 text-sm text-amber-100 hover:bg-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            {machine.state === "ask"
              ? "Back to site"
              : machine.evidence
                ? "Hide why"
                : "Why this?"}
          </button>
          <a
            href={`/o/${encodeURIComponent(projection.id)}`}
            className="flex min-h-[44px] items-center rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-purple-950 hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
          >
            Open full node
          </a>
        </div>
      </div>
    </motion.div>
  );
}
