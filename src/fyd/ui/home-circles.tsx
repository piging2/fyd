"use client";

/**
 * HomeCircles: the circle layer of the PING homepage.
 *
 * Client composition boundary for the Circle-Only Product Reset
 * (2026-09-22). The page (server) builds portal projections keyed by site
 * id; this component owns the single source of truth for the assistant's
 * context:
 *
 * - Hovering or selecting a Circle tells PortalHost, which reports the
 *   currently aware-or-engaged circle id via onContextChange.
 * - Pressing a Circle's "Ask FYD" orbit control opens the ONE global
 *   assistant dock with that circle's site + object as its context.
 *
 * There is exactly one assistant. There are never per-circle ask views.
 * The siteId (tenant) is threaded through because Ask FYD's trusted path
 * (POST /api/fyd/ask/[siteId]) takes the tenant from the route path; the
 * circle's object id alone is not a tenant.
 */

import * as React from "react";
import { PortalHost } from "@/fyd/ui/portal-host";
import { GlobalAskDock, type AskDockContext } from "@/fyd/ui/global-ask-dock";
import type { PortalProjection } from "@/fyd/preview/types";

export interface HomePortal {
  siteId: string;
  projection: PortalProjection;
}

export function HomeCircles({ portals }: { portals: HomePortal[] }) {
  const [askContextId, setAskContextId] = React.useState<string | null>(null);
  const [dockOpen, setDockOpen] = React.useState(false);

  const projections = React.useMemo(
    () => portals.map((p) => p.projection),
    [portals],
  );

  const handleAskRequest = React.useCallback((id: string) => {
    setAskContextId(id);
    setDockOpen(true);
  }, []);

  // Attention follows the circles: engaged wins, then aware. Only a
  // non-null report updates the assistant's context; when attention
  // clears, the dock keeps its last identity rather than going blank.
  const handleContextChange = React.useCallback((id: string | null) => {
    if (id !== null) setAskContextId(id);
  }, []);

  const context: AskDockContext | null = React.useMemo(() => {
    if (!askContextId) return null;
    const home = portals.find((p) => p.projection.circle.id === askContextId);
    if (!home) return null;
    return {
      siteId: home.siteId,
      objectId: home.projection.circle.id,
      name: home.projection.circle.name,
    };
  }, [askContextId, portals]);

  return (
    <>
      <PortalHost
        portals={projections}
        onAskRequest={handleAskRequest}
        onContextChange={handleContextChange}
      />
      <GlobalAskDock context={context} open={dockOpen} onOpenChange={setDockOpen} />
    </>
  );
}
