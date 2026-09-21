/**
 * AttentionController: at most 1 PRIMARY ACTIVE + 1 SECONDARY AWARE object.
 * Everything else stays quiet. This is how the constellation stays
 * beautiful instead of becoming Times Square.
 *
 * Hysteresis is mandatory: entry threshold, exit threshold, minimum
 * residency time, interaction lock, cooldown. Scrolling produces stable
 * contextual evolution, never musical chairs.
 */

export type AttentionLevel = "quiet" | "aware" | "primary";

export const ATTENTION = {
  /** Minimum ms a primary holds its slot before yielding to a challenger. */
  minResidencyMs: 1200,
  /** Ms after release before the same object may become primary again. */
  cooldownMs: 800,
} as const;

export class AttentionController {
  private primary: string | null = null;
  private secondary: string | null = null;
  private primarySince = 0;
  private lastRelease = new Map<string, number>();
  private locked = new Set<string>();

  level(id: string): AttentionLevel {
    if (this.primary === id) return "primary";
    if (this.secondary === id) return "aware";
    return "quiet";
  }

  getPrimary(): string | null {
    return this.primary;
  }

  /** Interaction lock: while set, the object cannot be demoted (e.g. Ask open). */
  lock(id: string): void {
    this.locked.add(id);
  }

  unlock(id: string): void {
    this.locked.delete(id);
  }

  isLocked(id: string): boolean {
    return this.locked.has(id);
  }

  /**
   * Request primary attention. Returns true when granted. A challenger
   * must beat the residency + cooldown thresholds; the current primary
   * never loses to a marginally more relevant candidate.
   */
  requestPrimary(id: string, now: number = Date.now()): boolean {
    if (this.locked.has(id)) return this.primary === id;
    if (this.primary === id) return true;
    const releasedAt = this.lastRelease.get(id);
    const neverReleased = releasedAt === undefined;
    if (!neverReleased && now - (releasedAt as number) < ATTENTION.cooldownMs) return false;
    if (this.primary !== null) {
      if (this.locked.has(this.primary)) return false;
      if (now - this.primarySince < ATTENTION.minResidencyMs) return false;
      // Demote the incumbent to secondary rather than dropping it.
      this.secondary = this.primary;
    }
    this.primary = id;
    this.primarySince = now;
    if (this.secondary === id) this.secondary = null;
    return true;
  }

  setAware(id: string): void {
    if (this.primary === id) return;
    this.secondary = id;
  }

  clearAware(id: string): void {
    if (this.secondary === id) this.secondary = null;
  }

  /** Release primary. Returns the id that was released, if any. */
  release(id: string, now: number = Date.now()): string | null {
    if (this.primary !== id) {
      if (this.secondary === id) this.secondary = null;
      return null;
    }
    this.primary = null;
    this.lastRelease.set(id, now);
    // Promote the secondary if one is waiting.
    if (this.secondary && this.secondary !== id) {
      const next = this.secondary;
      this.secondary = null;
      this.primary = next;
      this.primarySince = now;
    }
    return id;
  }

  /** Force everything quiet (route change, host teardown). */
  reset(): void {
    this.primary = null;
    this.secondary = null;
    this.locked.clear();
  }
}
