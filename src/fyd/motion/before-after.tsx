/**
 * FYD motion primitive: keyboard-accessible before/after comparison slider.
 *
 * The trade-vertical killer feature for project photography: two stacked
 * images, the before layer clipped by `clip-path: inset()` driven by the
 * slider position. Pointer events update the split with no layout work.
 *
 * Accessibility:
 * - The handle is `role="slider"` with aria-valuemin/max/now/valuetext,
 *   arrow keys step +-2, Home/End jump, PageUp/PageDown step +-10.
 * - Text Before/After labels, not color or position alone.
 * - 44px minimum grip hit area.
 * - prefers-reduced-motion does NOT disable the slider: it is user-driven
 *   input, not ambient animation.
 *
 * Pairing rule (enforced by the caller, not this component): render only
 * for real before/after pairs of the same scene. Never fake a pair from
 * unrelated photos.
 */
"use client";

import * as React from "react";

/** Arrow-key step in percent (harvested: +/-2). */
export const SLIDER_KEY_STEP = 2;
/** PageUp/PageDown step in percent. */
export const SLIDER_PAGE_STEP = 10;
/** Grip hit-area floor in px. */
export const SLIDER_GRIP_SIZE_PX = 44;

/** Clamp a split percentage into [0, 100]; non-finite input yields 50. */
export function clampPosition(p: number): number {
  if (!Number.isFinite(p)) return 50;
  return Math.min(100, Math.max(0, p));
}

/**
 * Map a pointer clientX to a split percentage inside a track rect.
 * Pure and testable; the component feeds it getBoundingClientRect().
 */
export function splitFromPointer(clientX: number, left: number, width: number): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(left) || !(width > 0)) {
    return 50;
  }
  return clampPosition(((clientX - left) / width) * 100);
}

/**
 * Pure keyboard model for the slider handle. Returns the next split
 * percentage for a key, or null when the key is not handled (so the
 * component knows whether to preventDefault). Clamped to [0, 100].
 * Harvested step: arrows move +-2, Home/End jump.
 */
export function nextSliderPosition(position: number, key: string): number | null {
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return clampPosition(position - SLIDER_KEY_STEP);
    case "ArrowRight":
    case "ArrowUp":
      return clampPosition(position + SLIDER_KEY_STEP);
    case "PageDown":
      return clampPosition(position - SLIDER_PAGE_STEP);
    case "PageUp":
      return clampPosition(position + SLIDER_PAGE_STEP);
    case "Home":
      return 0;
    case "End":
      return 100;
    default:
      return null;
  }
}

export interface BeforeAfterImage {
  src: string;
  alt: string;
}

export interface BeforeAfterProps {
  before: BeforeAfterImage;
  after: BeforeAfterImage;
  beforeLabel?: string;
  afterLabel?: string;
  /** Initial split in percent from the left. Defaults to 50. */
  initialPosition?: number;
  /** CSS aspect-ratio for the frame. Defaults to "4 / 3". */
  aspectRatio?: string;
  className?: string;
  id?: string;
}

export function BeforeAfter({
  before,
  after,
  beforeLabel = "Before",
  afterLabel = "After",
  initialPosition = 50,
  aspectRatio = "4 / 3",
  className,
  id,
}: BeforeAfterProps): React.ReactElement {
  const [position, setPosition] = React.useState<number>(() => clampPosition(initialPosition));
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const dragging = React.useRef(false);

  const updateFromClientX = React.useCallback((clientX: number): void => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition(splitFromPointer(clientX, rect.left, rect.width));
  }, []);

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      dragging.current = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        // setPointerCapture is best-effort; drag still works via move events.
      }
      updateFromClientX(e.clientX);
    },
    [updateFromClientX]
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (!dragging.current) return;
      if (e.buttons !== 0 && e.buttons !== 1) return;
      updateFromClientX(e.clientX);
    },
    [updateFromClientX]
  );

  const endDrag = React.useCallback((): void => {
    dragging.current = false;
  }, []);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      const next = nextSliderPosition(position, e.key);
      if (next !== null) {
        e.preventDefault();
        setPosition(next);
      }
    },
    [position]
  );

  const rounded = Math.round(position);

  return (
    <div
      ref={trackRef}
      id={id}
      className={["fyd-before-after", className].filter(Boolean).join(" ")}
      data-fyd-before-after=""
      style={{ aspectRatio }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <img className="fyd-before-after__layer" src={after.src} alt={after.alt} draggable={false} />
      <img
        className="fyd-before-after__layer"
        src={before.src}
        alt={before.alt}
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />
      <span className="fyd-before-after__label fyd-before-after__label--before">{beforeLabel}</span>
      <span className="fyd-before-after__label fyd-before-after__label--after">{afterLabel}</span>
      <div
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-valuetext={`${rounded} percent`}
        aria-label={`${beforeLabel} and ${afterLabel} comparison slider. Press left and right arrow keys to compare.`}
        className="fyd-before-after__handle"
        style={{ left: `${position}%` }}
        onKeyDown={onKeyDown}
      >
        <span className="fyd-before-after__grip" aria-hidden="true" />
      </div>
    </div>
  );
}
