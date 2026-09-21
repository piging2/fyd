import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPingObjectReader } from "@/lib/ping/ping-object-reader";
import { getPracticeIdentityId } from "@/lib/ping/session";
import { NodeClient } from "./node-client";

interface NodePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: NodePageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const viewerId = await getPracticeIdentityId();
    const node = await getPingObjectReader().getNode(id, viewerId);
    return {
      title: `${node.object.title} | PING`,
      description: node.object.description?.slice(0, 160),
    };
  } catch {
    return { title: "Node | PING" };
  }
}

export default async function NodePage({ params }: NodePageProps) {
  const { id } = await params;
  const viewerId = await getPracticeIdentityId();
  try {
    const node = await getPingObjectReader().getNode(id, viewerId);
    return <NodeClient node={node} />;
  } catch {
    notFound();
  }
}
