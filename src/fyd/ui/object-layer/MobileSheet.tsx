"use client";

/**
 * MobileSheet: the mobile projection of the object layer.
 * (Nolan, 2026-09-22: do NOT emulate desktop margins on mobile;
 * course correction: Circle -> tap -> bottom sheet, NOT a floating
 * oval.)
 *
 * Same object model, different spatial projection: a small edge tab
 * (no hover, no obscured article text, no horizontal overflow) opens a
 * bottom sheet listing the page's objects; tapping one opens the FYD
 * workspace as a bottom sheet directly (Ask | Evidence | Contact |
 * Related tabs). The workspace is the exact same component the
 * desktop layer renders; the sheet only changes its spatial
 * projection. No browser verification has been run yet; do not claim
 * widths or behavior as tested.
 */

import * as React from "react";
import { ChevronRight, X } from "lucide-react";
import { claimExpanded, subscribeExpanded, subscribeOpenRequest } from "./expansion";
import { useObjectProjection } from "./ObjectCircle";
import { WorkspaceSheet } from "./WorkspaceSheet";
import { buildPresentationSpec } from "./presentation-spec";
import { useViewportCapabilities } from "./viewport";
import { identityTransitionName, transitionViews } from "./view-transitions";
import { fyd } from "./fyd-tokens";
import type { MarginObjectDescriptor } from "./types";

/**
 * The list row's avatar. It carries the object's shared identity name
 * so the tap -> workspace view transition morphs this avatar into the
 * workspace header (the list unmounts as the sheet mounts).
 */
function IdentityAvatar({ object }: { object: MarginObjectDescriptor }) {
  const o = object;
  const ref = React.useCallback(
    (el: HTMLSpanElement | null) => {
      if (el) el.style.setProperty("view-transition-name", identityTransitionName(o.objectId));
    },
    [o.objectId],
  );
  return (
    <span
      ref={ref}
      className="relative block h-11 w-11 shrink-0 overflow-hidden rounded-full bg-neutral-200"
    >
      {o.imageSrc ? (
        <img
          src={o.imageSrc}
          srcSet={o.imageSrcSet ?? undefined}
          sizes="88px"
          alt=""
          aria-hidden="true"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white"
          style={{
            background: fyd.gradient.identity,
          }}
        >
          {o.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
}

export function MobileSheet({
  objects,
  initialSelectedId = null,
  onClose,
}: {
  objects: MarginObjectDescriptor[];
  /** Object preselected when the sheet opens (very-right overlay tap). */
  initialSelectedId?: string | null;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialSelectedId ?? null,
  );
  const selected = objects.find((o) => o.objectId === selectedId) ?? null;
  // The sheet's workspace shares the slot-level projection fetch.
  const sheetProj = useObjectProjection(selected?.objectId ?? "");
  // ViewportCapabilities: the spec seam adapts without forking, and no
  // mobile feature depends on hover (the tap path opens the workspace
  // directly; there is no hover affordance to miss).
  const viewport = useViewportCapabilities();

  /** List -> workspace (ENTER): the tapped row's avatar shares its
   * identity name with the workspace header, so the object persists
   * through the transition. Plain update without support. */
  const select = React.useCallback((id: string | null) => {
    transitionViews(() => setSelectedId(id));
  }, []);

  // Peer jump: a related-object link selects that object here.
  React.useEffect(
    () =>
      subscribeOpenRequest((id) => {
        if (objects.some((o) => o.objectId === id)) select(id);
      }),
    [objects, select],
  );

  // Claim the sheet slot on mount (collapses any stray expanded card);
  // being superseded closes the sheet.
  React.useEffect(() => {
    claimExpanded("sheet");
    const unsub = subscribeExpanded((active) => {
      if (active !== "sheet") onClose();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unsub();
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const spec = React.useMemo(
    () =>
      selected
        ? buildPresentationSpec({
            projection: sheetProj.status === "ok" ? sheetProj.projection : null,
            descriptor: {
              objectId: selected.objectId,
              name: selected.name,
              websiteUrl: selected.websiteUrl,
            },
            viewer: { role: "visitor" },
            surface: {
              surface: "workspace",
              viewport,
            },
          })
        : null,
    [selected, sheetProj, viewport],
  );

  const transitionId = selected ? identityTransitionName(selected.objectId) : undefined;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50" data-testid="mobile-object-sheet">
      <div aria-hidden="true" className="absolute inset-0 bg-black/60" onClick={onClose} />
      {selected && spec ? (
        <WorkspaceSheet
          spec={spec}
          siteId={sheetProj.status === "ok" ? sheetProj.siteId : selected.objectId}
          mobile
          transitionId={transitionId}
          onClose={() => select(null)}
        />
      ) : (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="PING objects on this page"
          className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-[20px] border border-[rgba(26,23,41,0.10)] bg-white p-4 pt-5 text-[#1A1729]"
          style={{
            boxShadow: "0 24px 64px rgba(26,23,41,0.18)",
            paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold uppercase tracking-widest text-[#6b7280]">
              PING objects
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close object list"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[rgba(26,23,41,0.16)] bg-white text-[#1A1729]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <ul className="flex flex-col gap-1">
            {objects.map((o) => (
              <li key={o.objectId}>
                <button
                  type="button"
                  onClick={() => select(o.objectId)}
                  aria-label={`View ${o.name}`}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-[16px] border border-[rgba(26,23,41,0.10)] bg-white p-2 text-left text-[#1A1729]"
                >
                  <IdentityAvatar object={o} />
                  <span className="line-clamp-2 flex-1 text-sm font-semibold leading-tight">
                    {o.name}
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
