/** Scroll only when the focused target is outside the unobscured viewport. */
export function focusScrollDelta(
  rect: { top: number; bottom: number },
  viewportTop: number,
  viewportBottom: number,
  gap = 8,
): number {
  const top = viewportTop + gap;
  const bottom = viewportBottom - gap;
  if (rect.top < top || rect.bottom - rect.top > bottom - top) {
    return rect.top - top;
  }
  return rect.bottom > bottom ? rect.bottom - bottom : 0;
}

export function focusAndReveal(element: HTMLElement): void {
  element.focus({ preventScroll: true });
  const viewport = window.visualViewport;
  let top = viewport?.offsetTop ?? 0;
  const bottom = top + (viewport?.height ?? window.innerHeight);
  const header = document.querySelector<HTMLElement>("header");
  if (header) {
    const position = window.getComputedStyle(header).position;
    const bounds = header.getBoundingClientRect();
    if ((position === "sticky" || position === "fixed") && bounds.top <= top && bounds.bottom > top) {
      top = bounds.bottom;
    }
  }
  const delta = focusScrollDelta(element.getBoundingClientRect(), top, bottom);
  if (delta !== 0) window.scrollBy({ top: delta, behavior: "instant" });
}
