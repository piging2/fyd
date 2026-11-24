/**
 * Case 7 refusal form (desk ruling 2026-11-23, on T3's extended
 * battery distribution): the four non-graph tenant-naming surfaces
 * refuse anonymous tenant-specific reads in the graph repair's form:
 * 401 caller_key_required, placed after the unknown-tenant 404 and
 * before any tenant data is read. The operator view does not extend
 * to tenant-specific reads on a public surface.
 *
 * Surfaces: mission detail (mission id in the path), lineage
 * (missionId selector), marketingos (siteId selector),
 * marketingos/missions (siteId selector). On the id-addressed
 * surfaces the read is tenant-specific by construction, so the
 * refusal precedes the journal leg; the unknown-mission 404 remains
 * for credentialed callers.
 */
import { GET as missionDetailGET } from "../missions/[id]/route";
import { GET as lineageGET } from "../lineage/route";
import { GET as marketingosGET } from "../marketingos/route";
import { GET as marketingosMissionsGET } from "../marketingos/missions/route";

function anon(url: string): Request {
  return new Request(url);
}

describe("case 7 refusal form: anonymous tenant-specific reads", () => {
  it("mission detail refuses an anonymous read of a tenant mission", async () => {
    const res = await missionDetailGET(anon("http://localhost/api/mc/missions/mc-m-t3b"), {
      params: Promise.resolve({ id: "mc-m-t3b" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("caller_key_required");
  });

  it("lineage refuses an anonymous missionId read", async () => {
    const res = await lineageGET(anon("http://localhost/api/mc/lineage?missionId=mc-m-t3b"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("caller_key_required");
  });

  it("marketingos refuses an anonymous siteId read of a known tenant", async () => {
    const res = await marketingosGET(anon("http://localhost/api/mc/marketingos?siteId=coppersmith-plumbing"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("caller_key_required");
  });

  it("marketingos missions refuses an anonymous siteId read of a known tenant", async () => {
    const res = await marketingosMissionsGET(
      anon("http://localhost/api/mc/marketingos/missions?siteId=coppersmith-plumbing"),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("caller_key_required");
  });
});

describe("case 7 guards: postures outside the charge are unchanged", () => {
  it("an unknown tenant on marketingos stays 404 unknown_tenant", async () => {
    const res = await marketingosGET(anon("http://localhost/api/mc/marketingos?siteId=no-such-tenant"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("unknown_tenant");
  });

  it("marketingos with no tenant named keeps the operator empty state", async () => {
    const res = await marketingosGET(anon("http://localhost/api/mc/marketingos"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("lineage with no selector stays 400 bad_selector", async () => {
    const res = await lineageGET(anon("http://localhost/api/mc/lineage"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_selector");
  });

  it("the lineage proposal view is not a tenant-naming mission read and stays open", async () => {
    const res = await lineageGET(anon("http://localhost/api/mc/lineage?proposalId=p-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.view).toBe("proposal");
  });
});
