/** Read-only adapters for verified public records. No alternate business state. */
import type { ObjectGraph } from "../sitespec/types";
import type { PingObject } from "@/lib/ping/types";
import {
  resolveBoundFieldVerified,
  ownerAssertionsFromGraph,
} from "../sitespec/binding-verifier";

export interface EditorialRecord {
  id: string;
  title: string;
  description: string;
  kind: string;
  status?: string;
  href?: string;
  source: string;
  date?: string;
}
export function editorialHref(
  value: string | undefined,
  origin = "",
): string | undefined {
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return undefined;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.origin !== origin ||
        parsed.username ||
        parsed.password
      )
        return undefined;
    } catch {
      return undefined;
    }
  }
  if (/^#[A-Za-z0-9_-]+$/.test(value)) return value;
  if (/^\/(?!\/)[^\\]*$/.test(value)) return origin + value;
  return undefined;
}
export function editorialRecords(
  objects: PingObject[],
  graph: ObjectGraph,
  origin = "",
): EditorialRecord[] {
  const assertions = ownerAssertionsFromGraph(graph);
  return objects.flatMap((o) => {
    const bound = (field: string) =>
      resolveBoundFieldVerified(
        graph,
        { objectId: o.id, field, classification: "direct" },
        assertions,
      );
    const title = bound("title");
    if (!title) return [];
    return [
      {
        id: o.id,
        title,
        description: bound("description") ?? "",
        kind: o.schema.split(".").pop()?.split("@")[0] ?? "record",
        status: bound("status"),
        href: editorialHref(bound("url"), origin),
        source: o.provenance?.ref ?? "Source not recorded",
        date: bound("date"),
      },
    ];
  });
}
