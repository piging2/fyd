"use client";

/**
 * Lane C: INTERNAL /dev/objects lab shell.
 * Lane D: Card and Node slots wired to the real ObjectCard / ObjectNode
 * (Lane B), fed by objectViewToProjection (Lane B adapter) over the same
 * ObjectView (Lane A loader) the Circle renders. Circle, Card, and Node are
 * three projections of the SAME object data.
 *
 * Internal development infrastructure, never customer product. No nav links
 * point here, robots are noindex/nofollow, and it is absent from the sitemap.
 *
 * Controls:
 * - object type: Business, Service, Person (first), Location, Post, Project
 *   (as the current PING projection allows; empty types render an explicit
 *   "renders nothing" state, never invented content)
 * - projection: Circle, Card, Node (all live: ObjectCircle, ObjectCard,
 *   ObjectNode)
 * - viewport preset: mobile 390 / tablet 768 / desktop 1280 / wide 1600,
 *   applied as a max-width frame so the projection can be inspected at size
 * - viewer context: anonymous / owner / follower / unrelated authenticated.
 *   Owner reuses the demo-owner-mode pattern: dev-only, visibly labeled
 *   "not real authentication", and this page has zero write operations so it
 *   is structurally unable to authorize production actions.
 * - evidence state filter: direct / derived / inferred / owner-corrected.
 *   The filter is a labeled layer over the real projection data: layers with
 *   no content in the current projection render an honest empty state.
 *
 * Deep-link presets (dev convenience, same controls the selects drive):
 *   /dev/objects?site=<siteId>&type=<LabTypeName>&projection=<Kind>&viewport=<Preset>
 */

import { useMemo, useState } from "react";
import { ObjectCircle } from "@/fyd/ui/object-circle";
import { ObjectCard } from "@/fyd/object/card";
import { ObjectNode } from "@/fyd/object/node";
import { objectViewToProjection } from "@/fyd/object/object-projection";
import { DemoOwnerMode } from "@/fyd/owner-mode/demo-owner-mode";
import type { ObjectView } from "@/fyd/object/types";
import type {
  LabObjectSummary,
  LabTypeGroup,
  LabTypeName,
} from "./lab-adapter";

export type ProjectionKind = "Circle" | "Card" | "Node";
export type ViewportPreset = "mobile" | "tablet" | "desktop" | "wide";
export type ViewerContext = "anonymous" | "owner" | "follower" | "unrelated";
export type EvidenceState =
  | "direct"
  | "derived"
  | "inferred"
  | "owner-corrected";

const VIEWPORTS: Record<ViewportPreset, { width: number; label: string }> = {
  mobile: { width: 390, label: "Mobile 390px" },
  tablet: { width: 768, label: "Tablet 768px" },
  desktop: { width: 1280, label: "Desktop 1280px" },
  wide: { width: 1600, label: "Wide 1600px" },
};

export interface LabMeta {
  dumpedAt: string;
  dumperVersion: string;
  graphDigest: string;
  generatedAt: string;
  objectCount: number;
  relationshipCount: number;
}

interface LabClientProps {
  siteIds: string[];
  siteId: string;
  meta: LabMeta;
  typeGroups: LabTypeGroup[];
  views: Record<string, ObjectView>;
  initialType?: LabTypeName;
  initialProjection?: ProjectionKind;
  initialViewport?: ViewportPreset;
}

function Control({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
      <span className="uppercase tracking-widest">{label}</span>
      {children}
    </label>
  );
}

const selectClass =
  "rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900";

function EmptyState({ type }: { type: LabTypeName }) {
  return (
    <div
      data-testid="empty-state"
      className="rounded-lg border border-stone-300 bg-stone-100 p-6 text-center"
    >
      <p className="text-sm font-semibold text-stone-800">
        No {type} objects in the current PING projection.
      </p>
      <p className="mt-1 text-xs text-stone-500">
        The lab renders nothing here rather than inventing content.
      </p>
    </div>
  );
}

function EvidenceLayer({
  state,
  view,
}: {
  state: EvidenceState;
  view: ObjectView;
}) {
  if (state === "direct") {
    return (
      <section
        data-testid="evidence-direct"
        className="mt-6 rounded-lg border border-stone-200 bg-white p-4"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">
          Direct evidence layer
        </p>
        <dl className="mt-3 space-y-2 text-sm text-stone-800">
          <div>
            <dt className="text-xs text-stone-500">Name (direct)</dt>
            <dd className="font-medium">{view.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Summary (direct)</dt>
            <dd>{view.summary || "No summary observed."}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Contact (direct)</dt>
            <dd>
              {[view.contact.phone, view.contact.email, view.contact.website]
                .filter(Boolean)
                .join(" · ") || "No contact fields observed."}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Provenance (direct)</dt>
            <dd className="font-mono text-xs">
              {view.provenance.kind} · {view.provenance.ref} ·{" "}
              {view.provenance.derivedAt}
            </dd>
          </div>
        </dl>
      </section>
    );
  }
  if (state === "derived") {
    return (
      <section
        data-testid="evidence-derived"
        className="mt-6 rounded-lg border border-stone-200 bg-white p-4"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-sky-800">
          Derived evidence layer
        </p>
        {view.services.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-sm text-stone-800">
            {view.services.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded border border-stone-100 px-2 py-1"
              >
                <span>{s.name}</span>
                <span className="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-900">
                  {s.basisLabel}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-stone-500">
            No derived fields on this object. Nothing rendered, nothing
            invented.
          </p>
        )}
      </section>
    );
  }
  if (state === "inferred") {
    return (
      <section
        data-testid="evidence-inferred"
        className="mt-6 rounded-lg border border-stone-200 bg-white p-4"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-violet-800">
          Inferred evidence layer
        </p>
        <p className="mt-2 text-sm text-stone-500">
          No inferred content exists in this projection. Renders nothing.
        </p>
      </section>
    );
  }
  return (
    <section
      data-testid="evidence-owner-corrected"
      className="mt-6 rounded-lg border border-stone-200 bg-white p-4"
    >
      <p className="text-xs font-bold uppercase tracking-widest text-orange-800">
        Owner-corrected evidence layer
      </p>
      {view.ownerUpdatedAt ? (
        <p className="mt-2 text-sm text-stone-800">
          Owner decisions recorded at{" "}
          <span className="font-mono text-xs">{view.ownerUpdatedAt}</span>.
          Source re-ingestion cannot erase them.
        </p>
      ) : (
        <p className="mt-2 text-sm text-stone-500">
          No owner corrections on this object. Nothing rendered, nothing
          invented.
        </p>
      )}
    </section>
  );
}

export function ObjectsLabClient({
  siteIds,
  siteId,
  meta,
  typeGroups,
  views,
  initialType,
  initialProjection,
  initialViewport,
}: LabClientProps) {
  const [type, setType] = useState<LabTypeName>(initialType ?? "Business");
  const [projection, setProjection] = useState<ProjectionKind>(
    initialProjection ?? "Circle",
  );
  const [viewport, setViewport] = useState<ViewportPreset>(
    initialViewport ?? "desktop",
  );
  const [viewer, setViewer] = useState<ViewerContext>("anonymous");
  const [evidence, setEvidence] = useState<EvidenceState>("direct");
  const [objectId, setObjectId] = useState<string | null>(null);

  const group: LabTypeGroup | undefined = useMemo(
    () => typeGroups.find((g) => g.type === type),
    [typeGroups, type],
  );

  // Anonymous viewers see public objects only, matching the read model's
  // public-visibility contract. Other contexts are simulated labels; this
  // page has no authentication and makes no authorization decisions.
  const visibleObjects: LabObjectSummary[] = useMemo(() => {
    if (!group) return [];
    if (viewer === "anonymous")
      return group.objects.filter((o) => o.visibility === "public");
    return group.objects;
  }, [group, viewer]);

  const activeObject =
    visibleObjects.find((o) => o.id === objectId) ?? visibleObjects[0] ?? null;
  const view = activeObject ? views[activeObject.id] : null;

  // Lane D: Card/Node share the SAME ObjectView the Circle renders.
  // objectViewToProjection is the Lane B adapter; the lab only overrides
  // kindLabel for non-Business objects (the adapter hardcodes "Business"
  // because it was built for the business view). Every claim the Card/Node
  // render — facts, contact, capabilities, evidence — comes from the same
  // view. Wiring, not rewriting: Lane B's module is untouched.
  const projectionData = useMemo(() => {
    if (!view) return null;
    return { ...objectViewToProjection(view), kindLabel: type };
  }, [view, type]);

  return (
    <div data-testid="lab-root" className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <p className="text-xs font-bold uppercase tracking-widest text-red-800">
            Internal dev lab - not a customer surface
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            FYD Objects Lab
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Projection:{" "}
            <span className="font-mono text-xs">
              {meta.dumperVersion} · dumped {meta.dumpedAt} · {meta.objectCount}{" "}
              objects / {meta.relationshipCount} relationships
            </span>
          </p>
          <p className="mt-1 font-mono text-xs text-stone-500">
            graphDigest {meta.graphDigest.slice(0, 16)}...
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-stone-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Control label="Site">
            <select
              data-testid="control-site"
              className={selectClass}
              value={siteId}
              onChange={(e) => {
                window.location.search =
                  "?site=" + encodeURIComponent(e.target.value);
              }}
            >
              {siteIds.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Control>
          <Control label="Object type">
            <select
              data-testid="control-type"
              className={selectClass}
              value={type}
              onChange={(e) => {
                setType(e.target.value as LabTypeName);
                setObjectId(null);
              }}
            >
              {typeGroups.map((g) => (
                <option key={g.type} value={g.type}>
                  {g.type} ({g.objects.length})
                </option>
              ))}
            </select>
          </Control>
          <Control label="Projection">
            <select
              data-testid="control-projection"
              className={selectClass}
              value={projection}
              onChange={(e) => setProjection(e.target.value as ProjectionKind)}
            >
              <option value="Circle">Circle</option>
              <option value="Card">Card</option>
              <option value="Node">Node</option>
            </select>
          </Control>
          <Control label="Viewport">
            <select
              data-testid="control-viewport"
              className={selectClass}
              value={viewport}
              onChange={(e) => setViewport(e.target.value as ViewportPreset)}
            >
              {(Object.keys(VIEWPORTS) as ViewportPreset[]).map((v) => (
                <option key={v} value={v}>
                  {VIEWPORTS[v].label}
                </option>
              ))}
            </select>
          </Control>
          <Control label="Viewer context">
            <select
              data-testid="control-viewer"
              className={selectClass}
              value={viewer}
              onChange={(e) => setViewer(e.target.value as ViewerContext)}
            >
              <option value="anonymous">Anonymous</option>
              <option value="owner">Owner (demo)</option>
              <option value="follower">Follower (simulated)</option>
              <option value="unrelated">Unrelated auth (simulated)</option>
            </select>
          </Control>
          <Control label="Evidence state">
            <select
              data-testid="control-evidence"
              className={selectClass}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value as EvidenceState)}
            >
              <option value="direct">Direct</option>
              <option value="derived">Derived</option>
              <option value="inferred">Inferred</option>
              <option value="owner-corrected">Owner-corrected</option>
            </select>
          </Control>
        </div>

        {viewer === "owner" && (
          <div
            data-testid="demo-owner-warning"
            className="mt-4 rounded-lg border-2 border-red-700 p-4"
            style={{
              background:
                "repeating-linear-gradient(45deg, #fef2f2 0 16px, #fff7ed 16px 32px)",
            }}
          >
            <p className="text-sm font-bold uppercase tracking-widest text-red-900">
              Demo owner mode - not real authentication
            </p>
            <p className="mt-1 text-sm text-stone-700">
              This viewer context is simulated for development: no session, no
              credential check, no authorization decision. This page exposes
              zero write operations, so it is structurally unable to authorize
              production actions.
            </p>
            <DemoOwnerMode siteId={siteId} />
          </div>
        )}

        {viewer !== "anonymous" && viewer !== "owner" && (
          <p
            data-testid="viewer-simulated-note"
            className="mt-4 rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-600"
          >
            Viewer context &quot;{viewer}&quot; is a simulated label; this page
            has no authentication. Object visibility is shown as observed in the
            projection (
            {visibleObjects.length} object{visibleObjects.length === 1 ? "" : "s"}
            ).
          </p>
        )}

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700">
              {type} · {projection} · {VIEWPORTS[viewport].label}
            </h2>
            {visibleObjects.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-stone-600">
                Object
                <select
                  data-testid="control-object"
                  className={selectClass}
                  value={activeObject?.id ?? ""}
                  onChange={(e) => setObjectId(e.target.value)}
                >
                  {visibleObjects.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div
            data-testid="viewport-frame"
            data-viewport={viewport}
            style={{ maxWidth: VIEWPORTS[viewport].width }}
            className="mx-auto rounded-lg border border-stone-300 bg-white p-4 shadow-sm"
          >
            {visibleObjects.length === 0 || !activeObject ? (
              <EmptyState type={type} />
            ) : projection === "Circle" ? (
              view ? (
                <div data-testid="circle-slot">
                  <ObjectCircle view={view} />
                </div>
              ) : (
                <EmptyState type={type} />
              )
            ) : projection === "Card" ? (
              projectionData ? (
                <div data-testid="card-slot">
                  <ObjectCard projection={projectionData} />
                </div>
              ) : (
                <EmptyState type={type} />
              )
            ) : projectionData ? (
              <div data-testid="node-slot">
                <ObjectNode projection={projectionData} />
              </div>
            ) : (
              <EmptyState type={type} />
            )}
          </div>

          {activeObject && view && (
            <EvidenceLayer state={evidence} view={view} />
          )}

          {activeObject && (
            <p
              data-testid="object-provenance"
              className="mt-4 font-mono text-xs text-stone-500"
            >
              {activeObject.schema} · visibility {activeObject.visibility} ·{" "}
              {activeObject.provenanceKind} · {activeObject.provenanceRef}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
