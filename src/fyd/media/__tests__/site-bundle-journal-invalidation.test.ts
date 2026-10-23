/**
 * Journal-path invalidation: emitOverlayEvent commits -> cache dropped.
 *
 * Uses a stub HTTP journal (preflight marker + POST /events) pointed at via
 * FYD_CUSTOMIZE_GATEWAY_URL. Verifies the full sequence:
 * READ V1 -> CACHE V1 -> JOURNAL WRITE (commit) -> NEXT READ V2.
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { getSiteBundle, invalidateSiteBundle } from "../site-bundle";
import { emitOverlayEvent } from "@/fyd/customize/server";

const SITE = "happy-place";

let server: Server;
let gatewayUrl: string;
const originalGatewayUrl = process.env.FYD_CUSTOMIZE_GATEWAY_URL;

beforeEach(async () => {
  invalidateSiteBundle(SITE);
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const u = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && (u.pathname === "/" || u.pathname === "")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ journal: "fyd-demo-journal" }));
      return;
    }
    if (req.method === "POST" && u.pathname === "/events") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ event_id: "evt-test-invalidation-1" }));
      });
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  gatewayUrl = `http://127.0.0.1:${port}/events`;
  process.env.FYD_CUSTOMIZE_GATEWAY_URL = gatewayUrl;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  invalidateSiteBundle(SITE);
  if (originalGatewayUrl === undefined) delete process.env.FYD_CUSTOMIZE_GATEWAY_URL;
  else process.env.FYD_CUSTOMIZE_GATEWAY_URL = originalGatewayUrl;
});

test("journal commit invalidates: next bundle read rebuilds (V2)", async () => {
  const v1 = await getSiteBundle(SITE);
  expect(v1).not.toBeNull();
  const v1again = await getSiteBundle(SITE);
  expect(v1again).toBe(v1); // cache hit

  // Authoritative journal write commits.
  const result = await emitOverlayEvent(SITE, [
    { op: "set_presentation_intent", intent: { directives: [] } } as never,
  ]);
  expect(result.eventId).toBe("evt-test-invalidation-1");

  // Cache must be dropped: next read rebuilds from the new truth.
  const v2 = await getSiteBundle(SITE);
  expect(v2).not.toBeNull();
  expect(v2).not.toBe(v1);
});
