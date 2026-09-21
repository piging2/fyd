/**
 * Tests for engagement/placement reconciliation.
 *
 * Policy only: given the previous and current placement derivation, does
 * engagement survive? The defect: Circle engaged -> viewport resize ->
 * placement mode changed (RAIL -> COLLAPSED) -> engagement was NOT
 * released, leaving a stale engaged id that remounted as an invisible
 * launcher when geometry returned.
 */
import { reconcileEngagementOnModeChange } from "../engagement-reconcile";

const snap = (engagedId: string, mode: string) => ({ engagedId, mode });

describe("reconcileEngagementOnModeChange", () => {
  it("releases engagement when the mode changes while engaged (RAIL -> COLLAPSED)", () => {
    const d = reconcileEngagementOnModeChange(
      snap("c1", "right"),
      snap("c1", "none"),
    );
    expect(d.releaseEngagedId).toBe("c1");
  });

  it("releases on any mode change while engaged (side swap, slot lost, slot moved)", () => {
    expect(
      reconcileEngagementOnModeChange(snap("c1", "right"), snap("c1", "left"))
        .releaseEngagedId,
    ).toBe("c1");
    expect(
      reconcileEngagementOnModeChange(snap("c1", "band-right"), snap("c1", "none"))
        .releaseEngagedId,
    ).toBe("c1");
    expect(
      reconcileEngagementOnModeChange(
        snap("c1", "band-right"),
        snap("c1", "band-left"),
      ).releaseEngagedId,
    ).toBe("c1");
  });

  it("keeps engagement when the mode is unchanged", () => {
    const d = reconcileEngagementOnModeChange(
      snap("c1", "right"),
      snap("c1", "right"),
    );
    expect(d.releaseEngagedId).toBeNull();
  });

  it("keeps engagement on the first derivation (no previous mode)", () => {
    const d = reconcileEngagementOnModeChange(null, snap("c1", "right"));
    expect(d.releaseEngagedId).toBeNull();
  });

  it("never releases when nothing is engaged", () => {
    expect(
      reconcileEngagementOnModeChange(snap("c1", "right"), null).releaseEngagedId,
    ).toBeNull();
    expect(reconcileEngagementOnModeChange(null, null).releaseEngagedId).toBeNull();
  });

  it("does not release when the user moves engagement to another Circle", () => {
    const d = reconcileEngagementOnModeChange(
      snap("c1", "band-right"),
      snap("c2", "band-left"),
    );
    expect(d.releaseEngagedId).toBeNull();
  });

  it("is deterministic: same inputs give the same decision", () => {
    const a = reconcileEngagementOnModeChange(snap("c1", "right"), snap("c1", "none"));
    const b = reconcileEngagementOnModeChange(snap("c1", "right"), snap("c1", "none"));
    expect(a).toEqual(b);
  });
});
