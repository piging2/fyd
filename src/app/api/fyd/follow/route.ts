import { NextRequest } from "next/server";
import { relationshipRoute } from "@/fyd/object/relationship-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Viewer selection, persistence and errors share one private-demo boundary.
export function GET(request: NextRequest) { return relationshipRoute(request, "follow", false); }
export function POST(request: NextRequest) { return relationshipRoute(request, "follow", true); }
