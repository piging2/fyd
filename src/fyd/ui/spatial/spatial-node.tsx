"use client";

/**
 * SpatialNodeButton: one satellite orbiting the focused center.
 *
 * A small circle with a one-word label beneath, positioned by transform
 * translate (never left/top). Enter/exit through AnimatePresence springs
 * from @/motion/motionTokens. One motion system: no CSS transitions here.
 */

import * as React from "react";
import { motion } from "framer-motion";
import { spring } from "@/motion/motionTokens";
import type { SpatialNode } from "@/fyd/spatial/object-space";
import { resolveObjectPresentationIdentity } from "../../presentation/identity";
import { ObjectIdentityMark } from "../../presentation/object-identity-mark";

export function SpatialNodeButton({
  node,
  x,
  y,
  r,
  label,
  glyph,
  ariaLabel,
  tabIndex,
  onActivate,
  buttonRef,
}: {
  node: SpatialNode;
  x: number;
  y: number;
  r: number;
  label: string;
  glyph: string;
  ariaLabel: string;
  tabIndex: number;
  onActivate: (node: SpatialNode) => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const d = Math.max(2 * r, 44);
  const identity = resolveObjectPresentationIdentity({ id: node.objectId, name: node.label }, "dark");
  return (
    <motion.button
      type="button"
      ref={buttonRef}
      layoutId={`spatial-node-${node.objectId}`}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, x, y }}
      exit={{ scale: 0, opacity: 0 }}
      transition={spring.snappy}
      onClick={() => onActivate(node)}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      className="absolute left-0 top-0 flex flex-col items-center focus-visible:outline-none"
      style={{ width: d }}
    >
      {identity.mark ? <ObjectIdentityMark identity={identity} size={d} decorative /> : <span
        aria-hidden="true"
        className="flex items-center justify-center rounded-full border border-amber-200/40 bg-purple-950/90 shadow-[0_0_18px_rgba(232,180,90,0.25)] backdrop-blur-sm transition-none"
        style={{ width: d, height: d }}
      >
        <span className="px-1 text-center text-base font-bold leading-tight text-amber-100">
          {glyph}
        </span>
      </span>}
      <span className="mt-1 max-w-full truncate text-[11px] font-medium text-purple-100/90">
        {label}
      </span>
    </motion.button>
  );
}
