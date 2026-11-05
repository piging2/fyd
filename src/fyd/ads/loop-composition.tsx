/**
 * The loop surface's composition render (lane B4; DESIGN.md
 * component D). Renders the render seam's items through the
 * EXISTING presentation path: every item is the standard ObjectCard,
 * and a sponsored item's display context carries the eligible
 * placement, so the card itself renders the existing Sponsored
 * disclosure chip. No new visual language exists in this file.
 *
 * The collector wrapper mounts only around a sponsored item (the
 * only items that carry an event context). Organic items render as
 * bare cards, which is what makes the flag-off and no-placement
 * renders byte-identical to the unwired render.
 */

import * as React from "react";
import { ObjectCard } from "../object/card";
import type { ObjectProjection } from "../object/object-projection";
import { AdsSponsoredCollector } from "./collector-client";
import type { LoopSurfaceItem } from "./render";

export interface LoopCompositionEntry {
  item: LoopSurfaceItem;
  projection: ObjectProjection;
}

export function LoopComposition({
  entries,
}: {
  entries: readonly LoopCompositionEntry[];
}) {
  return (
    <>
      {entries.map(({ item, projection }) => {
        const card = (
          <ObjectCard
            projection={projection}
            displayContext={item.displayContext ?? undefined}
          />
        );
        if (!item.eventContext) {
          return <React.Fragment key={item.objectId}>{card}</React.Fragment>;
        }
        return (
          <AdsSponsoredCollector key={item.objectId} context={item.eventContext}>
            {card}
          </AdsSponsoredCollector>
        );
      })}
    </>
  );
}
