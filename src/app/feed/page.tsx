import type { Metadata } from "next";
import { getPingObjectReader } from "@/lib/ping/ping-object-reader";
import { getPracticeIdentityId } from "@/lib/ping/session";
import { FeedClient } from "./feed-client";

export const metadata: Metadata = {
  title: "Discovery feed | PING",
  description: "Deterministically ranked objects, relationships, and website content from PING.",
};

export default async function FeedPage() {
  const viewerId = await getPracticeIdentityId();
  const reader = getPingObjectReader();
  const result = await reader.getDiscoveryFeed(viewerId, 30).catch(() => null);
  const feed = result?.items ?? [];
  const items = await Promise.all(
    feed.map(async (item) => ({
      ...item,
      plan: await reader.planActions(viewerId ?? null, item.object.id).catch(() => null),
    })),
  );
  return <FeedClient initialItems={items} />;
}
