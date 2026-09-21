/**
 * SemanticTargetResolver: binds a PING object to semantic DOM targets.
 *
 * Explicit `data-ping-object="<objectId>"` attributes win. The resolver
 * assigns a CSS anchor name (--ping-<objectId>) so capable browsers get
 * native semantic tethering; unsupported browsers ignore it and the JS
 * fallback positions from getBoundingClientRect. Anchor positioning is
 * progressive enhancement, never a hard dependency.
 */

export interface SemanticTarget {
  objectId: string;
  anchorName: string;
  /** Viewport rect at resolve time. */
  rect: { x: number; y: number; width: number; height: number } | null;
}

const OBJECT_ID_PATTERN = /^[a-z0-9-]+$/;

export function resolveSemanticTargets(root: ParentNode = document): SemanticTarget[] {
  const out: SemanticTarget[] = [];
  if (typeof document === "undefined") return out;
  const els = root.querySelectorAll("[data-ping-object]");
  els.forEach((el) => {
    const id = el.getAttribute("data-ping-object") ?? "";
    if (!OBJECT_ID_PATTERN.test(id)) return;
    const anchorName = `--ping-${id}`;
    try {
      (el as HTMLElement).style.setProperty("anchor-name", anchorName);
    } catch {
      // Unsupported browser: JS fallback positioning still works.
    }
    let rect: SemanticTarget["rect"] = null;
    try {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        rect = { x: r.x, y: r.y, width: r.width, height: r.height };
      }
    } catch {
      rect = null;
    }
    out.push({ objectId: id, anchorName, rect });
  });
  return out;
}

/**
 * Semantic proximity 0..1 between a target rect and a slot rect.
 * 1 = target center inside the slot; decays with distance.
 */
export function proximityScore(
  target: { x: number; y: number; width: number; height: number } | null,
  slot: { x: number; y: number; width: number; height: number },
): number {
  if (!target) return 0.25;
  const tx = target.x + target.width / 2;
  const ty = target.y + target.height / 2;
  const sx = slot.x + slot.width / 2;
  const sy = slot.y + slot.height / 2;
  const inside =
    tx >= slot.x && tx <= slot.x + slot.width && ty >= slot.y && ty <= slot.y + slot.height;
  if (inside) return 1;
  const dx = Math.max(slot.x - tx, 0, tx - (slot.x + slot.width));
  const dy = Math.max(slot.y - ty, 0, ty - (slot.y + slot.height));
  const dist = Math.hypot(dx, dy);
  return 1 / (1 + dist / 400);
}
