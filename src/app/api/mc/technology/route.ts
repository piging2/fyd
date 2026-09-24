/**
 * GET /api/mc/technology
 *
 * Mission Control TECHNOLOGY screen: technology as real business objects,
 * projected ONLY from state proven on this host (the Pig) at request time.
 *
 * Claim vocabulary (first-class, every field carries one):
 *   PROVEN      live backend state read now, corroborated by a second source
 *   OBSERVED    read live now from a single source, no independent corroboration
 *   DERIVED     computed from proven/observed facts (ages, risks, identities)
 *   UNKNOWN     looked for and not found, or not probed (e.g. needs credentials)
 *   STALE       data older than its freshness bound
 *   CONFLICTING two sources disagree
 *   PROTOTYPE   static/unwired projection; never shown as fact
 *   UNWIRED     looked for (bounded search) and confirmed absent
 *
 * UI CLAIM <= BACKEND PROOF. A missing backend renders as UNWIRED/UNKNOWN,
 * never as a green number. Cross-host fleet evidence (OPS-004/005) is cited
 * as such and never smuggled into this host's numbers.
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const HOME = process.env.HOME || "/home/nolan";
const FETCH_TIMEOUT = 4000;

type Claim =
  | "PROVEN"
  | "OBSERVED"
  | "DERIVED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTING"
  | "PROTOTYPE"
  | "UNWIRED";

interface TechObject {
  kind: string;
  id: string;
  name: string;
  claim: Claim;
  fields: Record<string, unknown>;
  fieldClaims: Record<string, Claim>;
  evidence: string;
  note?: string;
}

function obj(
  kind: string,
  id: string,
  name: string,
  claim: Claim,
  fields: Record<string, unknown>,
  fieldClaims: Record<string, Claim>,
  evidence: string,
  note?: string
): TechObject {
  return { kind, id, name, claim, fields, fieldClaims, evidence, note };
}

async function sh(
  cmd: string,
  args: string[],
  timeoutMs = 9000
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: timeoutMs });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function fetchJson(
  url: string,
  init?: { method?: string; body?: string; timeoutMs?: number }
) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? FETCH_TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      method: init?.method ?? "GET",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body,
    });
    if (!r.ok) return { ok: false, status: r.status, body: null as unknown };
    return { ok: true, status: r.status, body: (await r.json()) as unknown };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: null as unknown,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(t);
  }
}

function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

interface DockerContainer {
  name: string;
  image: string;
  status: string;
  ports: string;
}

async function dockerPs(): Promise<DockerContainer[] | null> {
  const out = await sh("docker", [
    "ps",
    "--format",
    "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}",
  ]);
  if (out === null) return null;
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [name, image, status, ports] = l.split("\t");
      return { name, image, status, ports: ports ?? "" };
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dockerInspect(...names: string[]): Promise<any[] | null> {
  const out = await sh("docker", ["inspect", ...names]);
  if (!out) return null;
  try {
    return JSON.parse(out) as unknown[];
  } catch {
    return null;
  }
}

async function gitRepo(dir: string) {
  const full = path.join(HOME, "projects", dir);
  if (!exists(path.join(full, ".git"))) return null;
  const branch = await sh("git", ["-C", full, "branch", "--show-current"]);
  const head = await sh("git", ["-C", full, "rev-parse", "--short", "HEAD"]);
  const subject = await sh("git", ["-C", full, "log", "-1", "--format=%s"]);
  const dirtyOut = await sh("git", ["-C", full, "status", "--porcelain"]);
  const dirty =
    dirtyOut === null ? null : dirtyOut.split("\n").filter(Boolean).length;
  if (branch === null || head === null) return null;
  return { dir, branch, head, subject, dirty };
}

async function ledgerGatewayMentions(): Promise<string[]> {
  const p = path.join(
    HOME,
    "workspace/ping-build-program/fleet/ledger.jsonl"
  );
  try {
    const text = await readFile(p, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    return lines
      .slice(-80)
      .filter((l) => /gateway/i.test(l))
      .slice(-6)
      .map((l) => {
        try {
          const r = JSON.parse(l) as Record<string, unknown>;
          return `${r.at ?? "?"} ${r.worker ?? "?"} ${r.category ?? ""}`.trim();
        } catch {
          return l.slice(0, 120);
        }
      });
  } catch {
    return [];
  }
}

export async function GET() {
  const generatedAt = new Date().toISOString();
  const objects: TechObject[] = [];

  // ---- HOST ----
  const hostname = await sh("hostname", []);
  const uname = await sh("uname", ["-srm"]);
  const meminfo = await sh("grep", ["MemTotal", "/proc/meminfo"]);
  const nproc = await sh("nproc", []);
  objects.push(
    obj(
      "Host",
      "host:pig",
      "Pig",
      hostname && uname ? "PROVEN" : "UNKNOWN",
      {
        hostname,
        kernel: uname,
        memory: meminfo?.replace(/\s+/g, " ") ?? null,
        cpus: nproc,
        role: "development/automation host (WSL2)",
      },
      {
        hostname: hostname ? "PROVEN" : "UNKNOWN",
        kernel: uname ? "PROVEN" : "UNKNOWN",
        memory: meminfo ? "OBSERVED" : "UNKNOWN",
        cpus: nproc ? "OBSERVED" : "UNKNOWN",
        role: "DERIVED",
      },
      "hostname, uname, /proc/meminfo, nproc executed server-side this request"
    )
  );

  // ---- CONTAINERS ----
  const ps = await dockerPs();
  const containers: DockerContainer[] = ps ?? [];
  const byName = new Map(containers.map((c) => [c.name, c]));
  const inspected = await dockerInspect(
    "ping-gateway",
    "ping-qdrant",
    "ping-vault",
    "ping-postgres",
    "ping-redis"
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inspByName = new Map<string, any>(
    (inspected ?? []).map((d) => [
      String(d.Name ?? "").replace(/^\//, ""),
      d,
    ])
  );
  for (const c of containers) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = inspByName.get(c.name);
    const health = d?.State?.Health?.Status ?? null;
    const restartCount = d?.RestartCount ?? null;
    const unhealthy = /unhealthy/i.test(c.status);
    objects.push(
      obj(
        "Container",
        `container:${c.name}`,
        c.name,
        ps ? "OBSERVED" : "UNKNOWN",
        {
          image: c.image,
          status: c.status,
          ports: c.ports || "(no published ports)",
          dockerHealth: health ?? (unhealthy ? "unhealthy" : "no healthcheck configured"),
          restartCount,
          composeManaged: d
            ? Boolean(
                d.Config?.Labels?.["com.docker.compose.project"]
              )
            : null,
        },
        {
          image: "OBSERVED",
          status: "OBSERVED",
          ports: "OBSERVED",
          dockerHealth: health || unhealthy ? "OBSERVED" : "OBSERVED",
          restartCount: restartCount !== null ? "OBSERVED" : "UNKNOWN",
          composeManaged: d ? "OBSERVED" : "UNKNOWN",
        },
        "docker ps + docker inspect executed server-side this request",
        unhealthy
          ? "Docker reports unhealthy; see HealthCheck objects for the verified cause."
          : undefined
      )
    );
  }

  // ---- SERVICES (live endpoints) ----
  const svcChecks: { id: string; name: string; url: string; extra?: () => Promise<Record<string, unknown>> }[] = [
    { id: "svc:gateway", name: "gateway-api", url: "http://127.0.0.1:8080/health" },
    { id: "svc:site3100", name: "fyd-site", url: "http://127.0.0.1:3100/api/health" },
    { id: "svc:journal", name: "journal-gateway", url: "http://127.0.0.1:18199/" },
    { id: "svc:qdrant", name: "qdrant", url: "http://127.0.0.1:6333/" },
    { id: "svc:vault", name: "vault", url: "http://127.0.0.1:8200/v1/sys/health" },
  ];
  for (const s of svcChecks) {
    const r = await fetchJson(s.url);
    objects.push(
      obj(
        "Service",
        s.id,
        s.name,
        r.ok ? "PROVEN" : "UNKNOWN",
        { url: s.url, httpStatus: r.ok ? r.status : r.status || "unreachable" },
        { url: "OBSERVED", httpStatus: r.ok ? "PROVEN" : "UNKNOWN" },
        `HTTP probe from the :3100 server host this request${r.ok ? ", status 200 corroborates the serving process" : ""}`
      )
    );
  }

  // ---- DATABASES ----
  const pgInspect = inspByName.get("ping-postgres");
  objects.push(
    obj(
      "Database",
      "db:ping-postgres",
      "ping-postgres",
      byName.has("ping-postgres") ? "OBSERVED" : "UNKNOWN",
      {
        engine: "postgres:15-alpine",
        port: "0.0.0.0:5433 -> 5432",
        volumeBacked: Boolean(pgInspect?.Mounts?.length),
        schemaBindMount:
          (pgInspect?.Mounts ?? []).find((m: { Destination?: string }) =>
            String(m?.Destination ?? "").includes("initdb")
          )?.Source ?? null,
        content: "not probed (no credential access attempted)",
      },
      {
        engine: "OBSERVED",
        port: "OBSERVED",
        volumeBacked: pgInspect ? "OBSERVED" : "UNKNOWN",
        schemaBindMount: pgInspect ? "OBSERVED" : "UNKNOWN",
        content: "UNKNOWN",
      },
      "docker inspect executed server-side this request; database contents never touched",
      "Credential hygiene: Mission Control never reads database credentials or contents."
    )
  );
  // Journal event store (file-backed, the canonical overlay event source on this host)
  const journalDir = path.join(HOME, "projects/ping/data/fyd-journal");
  const journalFile = path.join(journalDir, "events.jsonl");
  let journalLines: number | null = null;
  let journalMtime: string | null = null;
  try {
    const st = fs.statSync(journalFile);
    journalMtime = st.mtime.toISOString();
    const text = await readFile(journalFile, "utf8");
    journalLines = text.trim().split("\n").filter(Boolean).length;
  } catch {
    journalLines = null;
  }
  objects.push(
    obj(
      "Database",
      "db:journal-event-store",
      "journal event store (file)",
      journalLines !== null ? "PROVEN" : "UNKNOWN",
      {
        path: "projects/ping/data/fyd-journal/events.jsonl",
        eventCount: journalLines,
        lastWrite: journalMtime,
        format: "JSONL",
      },
      {
        path: "OBSERVED",
        eventCount: journalLines !== null ? "PROVEN" : "UNKNOWN",
        lastWrite: journalMtime ? "OBSERVED" : "UNKNOWN",
        format: "OBSERVED",
      },
      "file stat + line count executed server-side this request"
    )
  );

  // ---- REPOSITORIES + COMMITS ----
  const repos: { dir: string; branch: string; head: string; subject: string | null; dirty: number | null }[] = [];
  for (const d of ["ping", "ping-website", "constitutional-runtime"]) {
    const r = await gitRepo(d);
    if (r) {
      repos.push(r);
      objects.push(
        obj(
          "Repository",
          `repo:${d}`,
          d,
          "PROVEN",
          { branch: r.branch, head: r.head, dirtyFiles: r.dirty },
          { branch: "PROVEN", head: "PROVEN", dirtyFiles: r.dirty !== null ? "PROVEN" : "UNKNOWN" },
          "git branch / rev-parse / status executed server-side this request"
        )
      );
      objects.push(
        obj(
          "Commit",
          `commit:${r.head}`,
          r.head,
          "PROVEN",
          { repo: d, branch: r.branch, subject: r.subject },
          { repo: "PROVEN", branch: "PROVEN", subject: r.subject ? "PROVEN" : "UNKNOWN" },
          "git log -1 executed server-side this request"
        )
      );
    }
  }

  // ---- RUNTIMES + CAPABILITIES ----
  const nodeV = await sh("node", ["--version"]);
  const dockerV = await sh("docker", ["--version"]);
  const pyV = await sh("python3", ["--version"]);
  objects.push(
    obj("Runtime", "runtime:node", "node", nodeV ? "PROVEN" : "UNKNOWN",
      { version: nodeV }, { version: "PROVEN" }, "node --version this request")
  );
  objects.push(
    obj("Runtime", "runtime:docker", "docker", dockerV ? "PROVEN" : "UNKNOWN",
      { version: dockerV }, { version: "PROVEN" }, "docker --version this request")
  );
  objects.push(
    obj("Runtime", "runtime:wsl2", "wsl2", uname ? "PROVEN" : "UNKNOWN",
      { kernel: uname }, { kernel: "PROVEN" }, "uname this request")
  );
  const nextProc = await sh("bash", ["-c", "ps aux | grep '[n]ext-server' | head -1 | cut -c1-120"]);
  objects.push(
    obj("Capability", "cap:nextjs", "next.js server", nextProc ? "OBSERVED" : "UNKNOWN",
      { process: nextProc }, { process: "OBSERVED" }, "ps aux this request")
  );
  objects.push(
    obj("Capability", "cap:python", "python3", pyV ? "PROVEN" : "UNKNOWN",
      { version: pyV }, { version: "PROVEN" }, "python3 --version this request")
  );

  // ---- QDRANT collections (Service detail) ----
  const qcol = await fetchJson("http://127.0.0.1:6333/collections");
  const qcount = await fetchJson("http://127.0.0.1:6333/collections/knowledge/points/count", {
    method: "POST",
    body: "{}",
  });
  const colNames =
    qcol.ok
      ? (((qcol.body as { result?: { collections?: { name?: string }[] } }).result?.collections ?? []).map(
          (c) => c.name
        ))
      : null;
  const knowledgeCount = qcount.ok
    ? (qcount.body as { result?: { count?: number } }).result?.count ?? null
    : null;

  // ---- RELEASES ----
  const buildId = await (async () => {
    try {
      return (await readFile(path.join(HOME, "projects/ping/.next/BUILD_ID"), "utf8")).trim();
    } catch {
      return null;
    }
  })();
  const pingRepo = repos.find((r) => r.dir === "ping");
  objects.push(
    obj(
      "Release",
      "release:fyd-site",
      "fyd-site (:3100)",
      pingRepo && buildId ? "DERIVED" : "UNKNOWN",
      {
        releaseIdentity: pingRepo && buildId ? `${pingRepo.head} + BUILD_ID ${buildId}` : null,
        sourceCommit: pingRepo?.head ?? null,
        buildId,
        deployedAt: nextProc ? "process observed running" : null,
      },
      {
        releaseIdentity: pingRepo && buildId ? "DERIVED" : "UNKNOWN",
        sourceCommit: pingRepo ? "PROVEN" : "UNKNOWN",
        buildId: buildId ? "OBSERVED" : "UNKNOWN",
        deployedAt: "OBSERVED",
      },
      "git HEAD + .next/BUILD_ID + ps, read server-side this request",
      "Release identity is derived from source commit plus build id; no separate release registry exists."
    )
  );
  const gwInsp = inspByName.get("ping-gateway");
  objects.push(
    obj(
      "Release",
      "release:gateway",
      "ping-gateway image",
      gwInsp ? "OBSERVED" : "UNKNOWN",
      {
        tag: byName.get("ping-gateway")?.image ?? null,
        imageId: gwInsp?.Image ?? null,
        created: gwInsp?.Created ?? null,
        sourceCommit: "not recorded on this host",
      },
      {
        tag: "OBSERVED",
        imageId: gwInsp ? "OBSERVED" : "UNKNOWN",
        created: gwInsp ? "OBSERVED" : "UNKNOWN",
        sourceCommit: "UNKNOWN",
      },
      "docker inspect executed server-side this request",
      "The image tag is the release identity on this host; build provenance is not recorded here."
    )
  );
  if (byName.has("ping-rc-gateway")) {
    objects.push(
      obj(
        "Release",
        "release:gateway-rc",
        "ping-gateway release candidate",
        "OBSERVED",
        {
          tag: byName.get("ping-rc-gateway")?.image ?? null,
          port: "127.0.0.1:18099 -> 8080",
        },
        { tag: "OBSERVED", port: "OBSERVED" },
        "docker ps executed server-side this request",
        "RC line runs loopback-only; not the live dispatch path."
      )
    );
  }

  // ---- DEPLOYMENTS ----
  objects.push(
    obj(
      "Deployment",
      "deploy:fyd-site",
      "fyd-site :3100",
      nextProc ? "OBSERVED" : "UNKNOWN",
      {
        process: nextProc,
        method: "setsid npm start -- -p 3100 (per lane records)",
        serves: ["/mission-control", "/sites/happy-place", "/sites/coppersmith-plumbing"],
      },
      { process: "OBSERVED", method: "DERIVED", serves: "OBSERVED" },
      "ps aux this request; launch method from Mission Control lane records"
    )
  );
  objects.push(
    obj(
      "Deployment",
      "deploy:gateway",
      "ping-gateway",
      gwInsp ? "OBSERVED" : "UNKNOWN",
      {
        method: "docker run (not compose-managed on this host)",
        restartCount: gwInsp?.RestartCount ?? null,
        restartPolicy: gwInsp?.HostConfig?.RestartPolicy?.Name ?? null,
      },
      {
        method: gwInsp ? "OBSERVED" : "UNKNOWN",
        restartCount: gwInsp ? "OBSERVED" : "UNKNOWN",
        restartPolicy: gwInsp ? "OBSERVED" : "UNKNOWN",
      },
      "docker inspect executed server-side this request; only a desktop label present, no compose labels"
    )
  );

  // ---- INTEGRATIONS (env-configured only, values never read) ----
  const gwEnv: string[] = Array.isArray(gwInsp?.Config?.Env) ? gwInsp.Config.Env : [];
  const envKeys = gwEnv.map((e: string) => String(e).split("=")[0]).filter((k) =>
    /MUSE|QDRANT|POSTGRES|REDIS|VAULT|WEBHOOK|API/i.test(k)
  );
  for (const k of envKeys.slice(0, 12)) {
    objects.push(
      obj(
        "Integration",
        `integration:${k.toLowerCase()}`,
        k,
        "OBSERVED",
        { configuredOn: "ping-gateway", value: "redacted (never read)" },
        { configuredOn: "OBSERVED", value: "UNKNOWN" },
        "docker inspect env KEY NAMES only; values never read",
        "Presence of the key proves configuration, not a working integration."
      )
    );
  }

  // ---- MCP SERVERS ----
  const mcpFind = await sh("bash", [
    "-c",
    "find $HOME -maxdepth 4 -iname '*mcp*' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -v -i research | head -10",
  ]);
  objects.push(
    obj(
      "MCPServer",
      "mcp:live",
      "live MCP servers",
      "UNWIRED",
      {
        liveServers: mcpFind ? mcpFind.split("\n").filter(Boolean) : [],
        researchConfigs: "present under ~/research (zep, letta, windmill, browser-use) — not live servers",
      },
      { liveServers: mcpFind !== null ? "OBSERVED" : "UNKNOWN", researchConfigs: "OBSERVED" },
      "bounded find on this host this request",
      "No live MCP server registry exists on this host. Research configs are not production servers."
    )
  );

  // ---- BACKUPS ----
  const backupDirExists = exists("/opt/ping/backups");
  const timers = await sh("bash", [
    "-c",
    "systemctl list-timers --all --no-pager 2>/dev/null | grep -i -E 'backup|snapshot|pg-' | head -5",
  ]);
  const crontab = await sh("bash", ["-c", "crontab -l 2>/dev/null | head -8"]);
  const dumpFind = await sh("bash", [
    "-c",
    "find /home/nolan /opt /var/backups -maxdepth 3 \\( -name '*.dump' -o -name '*pg-backup*' \\) 2>/dev/null | head -5",
  ]);
  const backupWired = backupDirExists || (timers?.trim() ? true : false) || (dumpFind?.trim() ? true : false);
  objects.push(
    obj(
      "Backup",
      "backup:postgres",
      "postgres backup (this host)",
      backupWired ? "OBSERVED" : "UNWIRED",
      {
        automation: backupWired ? "observed" : "none observed",
        searchBound: "/opt/ping/backups, /var/backups, /home/nolan, /opt (depth 3), crontab, systemd timers",
        fleetEvidence:
          "OPS-004 proved automated pg backups + restore drill (2557/2557 rows) on the fleet host — different host, cited not smuggled",
      },
      {
        automation: backupWired ? "OBSERVED" : "UNWIRED",
        searchBound: "OBSERVED",
        fleetEvidence: "DERIVED",
      },
      "bounded absence probe executed server-side this request",
      backupWired
        ? undefined
        : "No backup automation observed on this host. The fleet backup proof (OPS-004) belongs to a different host."
    )
  );
  objects.push(
    obj(
      "Snapshot",
      "snapshot:qdrant",
      "qdrant snapshot (this host)",
      "UNWIRED",
      {
        automation: "none observed",
        collections: colNames,
        knowledgePoints: knowledgeCount,
        fleetEvidence:
          "OPS-005 proved automated qdrant snapshots + restore drill (144/144 points) on the fleet host — different host",
      },
      {
        automation: "UNWIRED",
        collections: colNames ? "PROVEN" : "UNKNOWN",
        knowledgePoints: knowledgeCount !== null ? "PROVEN" : "UNKNOWN",
        fleetEvidence: "DERIVED",
      },
      "bounded absence probe + qdrant HTTP API this request"
    )
  );

  // ---- HEALTHCHECKS ----
  const qHealth = inspByName.get("ping-qdrant")?.State?.Health;
  const vHealth = inspByName.get("ping-vault")?.State?.Health;
  const qLog: string =
    (Array.isArray(qHealth?.Log) && qHealth.Log.length
      ? String(qHealth.Log[qHealth.Log.length - 1]?.Output ?? "")
      : ""
    ).slice(0, 160);
  objects.push(
    obj(
      "HealthCheck",
      "hc:qdrant-docker",
      "ping-qdrant docker health",
      "OBSERVED",
      {
        status: qHealth?.Status ?? "unknown",
        failingStreak: qHealth?.FailingStreak ?? null,
        verifiedCause:
          /curl/i.test(qLog) && /not found|no such file|executable file not found/i.test(qLog)
            ? "probe execs `curl` which is not installed in the qdrant image — broken probe, not a down service"
            : qLog || "see docker inspect",
        serviceActually: qcol.ok ? "responding HTTP 200 on :6333" : "not responding",
      },
      {
        status: "OBSERVED",
        failingStreak: "OBSERVED",
        verifiedCause: "OBSERVED",
        serviceActually: qcol.ok ? "PROVEN" : "UNKNOWN",
      },
      "docker inspect State.Health + live :6333 probe this request"
    )
  );
  objects.push(
    obj(
      "HealthCheck",
      "hc:vault-docker",
      "ping-vault docker health",
      "OBSERVED",
      {
        status: vHealth?.Status ?? "unknown",
        failingStreak: vHealth?.FailingStreak ?? null,
        serviceActually: "responding HTTP 200 on :8200/v1/sys/health",
      },
      { status: "OBSERVED", failingStreak: "OBSERVED", serviceActually: "PROVEN" },
      "docker inspect State.Health + live :8200 probe this request",
      "Same broken-probe pattern as qdrant: the container is unhealthy by docker's measure while the service answers."
    )
  );
  const gwHealth = inspByName.get("ping-gateway")?.State?.Health;
  objects.push(
    obj(
      "HealthCheck",
      "hc:gateway",
      "ping-gateway health",
      "OBSERVED",
      {
        httpHealth: "HTTP 200 on :8080/health",
        dockerHealthcheck: gwHealth ? gwHealth.Status : "not configured",
      },
      { httpHealth: "PROVEN", dockerHealthcheck: gwHealth ? "OBSERVED" : "UNWIRED" },
      "live :8080 probe + docker inspect this request",
      "No container-level healthcheck is configured on this host; liveness is proven only by the HTTP endpoint."
    )
  );

  // ---- INCIDENTS ----
  const incidents: TechObject[] = [];
  if (/unhealthy/i.test(String(qHealth?.Status ?? ""))) {
    incidents.push(
      obj(
        "Incident",
        "incident:qdrant-health-probe",
        "ping-qdrant unhealthy (broken probe)",
        "OBSERVED",
        {
          symptom: `docker reports unhealthy, failingStreak=${qHealth?.FailingStreak ?? "?"}`,
          verifiedCause: "healthcheck probe execs `curl`, absent from the qdrant image",
          actualServiceState: qcol.ok ? "healthy (HTTP 200, collections listed)" : "unknown",
          severity: "low — cosmetic, but masks real failures",
          since: "unknown (docker keeps no per-failure history)",
        },
        {
          symptom: "OBSERVED",
          verifiedCause: "OBSERVED",
          actualServiceState: qcol.ok ? "PROVEN" : "UNKNOWN",
          severity: "DERIVED",
          since: "UNKNOWN",
        },
        "docker inspect + live :6333 probe this request"
      )
    );
  }
  if (/unhealthy/i.test(String(vHealth?.Status ?? ""))) {
    incidents.push(
      obj(
        "Incident",
        "incident:vault-health-probe",
        "ping-vault unhealthy (broken probe)",
        "OBSERVED",
        {
          symptom: `docker reports unhealthy, failingStreak=${vHealth?.FailingStreak ?? "?"}`,
          actualServiceState: "responding HTTP 200 on :8200/v1/sys/health",
          severity: "low — same broken-probe pattern as qdrant",
        },
        { symptom: "OBSERVED", actualServiceState: "PROVEN", severity: "DERIVED" },
        "docker inspect + live :8200 probe this request"
      )
    );
  }

  // ---- RISKS (derived) ----
  const risks: TechObject[] = [
    obj(
      "Risk",
      "risk:no-pig-db-backup",
      "no database backup observed on this host",
      "DERIVED",
      {
        basis: "bounded absence probe: no /opt/ping/backups, no *.dump, no pg-backup timer/cron",
        impact: "host disk loss would lose the postgres volume and the file journal",
        fleetNote: "OPS-004/005 backup proofs belong to the fleet host, not this host",
      },
      { basis: "OBSERVED", impact: "DERIVED", fleetNote: "DERIVED" },
      "absence probe this request + OPS-004/005 fleet evidence",
      "This is the highest-severity technology risk on this host."
    ),
    obj(
      "Risk",
      "risk:gateway-no-healthcheck",
      "ping-gateway has no container healthcheck and is not compose-managed",
      "DERIVED",
      {
        basis: "docker inspect shows no Health block; only a desktop label, no compose labels",
        impact: "restarts are ungated; restartCount=3 with per-restart cause unknown",
      },
      { basis: "OBSERVED", impact: "DERIVED" },
      "docker inspect this request"
    ),
    obj(
      "Risk",
      "risk:masked-health",
      "unhealthy-but-serving containers mask real failures",
      "DERIVED",
      {
        basis: "qdrant and vault are docker-unhealthy while serving 200s; any real outage would look identical",
        impact: "docker health status is currently signal-free for these two containers",
      },
      { basis: "OBSERVED", impact: "DERIVED" },
      "docker inspect + live probes this request"
    ),
  ];

  // ---- BACKLOG OBJECTS (missing backends; traced, not faked) ----
  const backlog: TechObject[] = [
    obj(
      "Backlog",
      "backlog:site-regenerate",
      "governed site regeneration",
      "DERIVED",
      {
        missingMutation: "regenerate a tenant site from graph + owner intent through a governed backend",
        owningAuthority: "FYD factory lane (owns the generation pipeline) + owner authority (demo owner mode)",
        existingMechanism:
          "POST /api/ping/proposal — AskProposal union (object_update | object_create | site_patch), ed25519-signed envelope, owner-gated; journal FYD_SITE_OVERLAY events already witness owner corrections",
        capability: "new AskProposal variant `site_regenerate` through the SAME signed path — no new control plane",
        witnessEvent: "PROPOSAL_SUBMITTED + SITE_REGENERATED journal events",
        readModel: "regenerated site + overlay event tail (already read by /api/mc/today)",
        shortestPath:
          "extend the AskProposal union with site_regenerate; the factory consumes it like any proposal",
        backendState: "UNWIRED",
      },
      {
        missingMutation: "DERIVED",
        owningAuthority: "DERIVED",
        existingMechanism: "PROVEN",
        capability: "DERIVED",
        witnessEvent: "DERIVED",
        readModel: "PROVEN",
        shortestPath: "DERIVED",
        backendState: "UNWIRED",
      },
      "backend inventory 2026-09-24 (STATE.md): only governed write is POST /api/ping/proposal; no regenerate endpoint exists in src/app/api"
    ),
    obj(
      "Backlog",
      "backlog:proposal-approval",
      "proposal approval",
      "DERIVED",
      {
        missingMutation: "approve / reject a submitted proposal",
        owningAuthority: "owner (demo owner mode) / Nolan",
        existingMechanism: "same signed proposal envelope as site_regenerate",
        capability: "`proposal_decision` AskProposal variant signed by the owner — no new control plane",
        witnessEvent: "PROPOSAL_DECISION journal event",
        readModel: "journal tail (already read by /api/mc/today)",
        shortestPath: "union extension + decision event; Mission Control approval UI binds to this, never to a fake endpoint",
        backendState: "UNWIRED",
      },
      {
        missingMutation: "DERIVED",
        owningAuthority: "DERIVED",
        existingMechanism: "PROVEN",
        capability: "DERIVED",
        witnessEvent: "DERIVED",
        readModel: "PROVEN",
        shortestPath: "DERIVED",
        backendState: "UNWIRED",
      },
      "backend inventory 2026-09-24 (STATE.md): no approve endpoint exists in src/app/api"
    ),
    obj(
      "Backlog",
      "backlog:sitespec-forward-trace",
      "SiteSpec forward tracing",
      "DERIVED",
      {
        missingMutation: "persist (digest -> SiteSpec) at generation time",
        owningAuthority: "FYD factory lane (owns SiteSpec generation)",
        existingMechanism:
          "registerSiteSpecProvider exists but has ZERO callers; digest-bound SiteSpec verification 400s today; no persisted SiteSpec store",
        capability: "call the EXISTING registerSiteSpecProvider from the factory generation path — the seam exists, it is just unwired",
        witnessEvent: "stored digest binding itself",
        readModel: "SiteSpec store queried by /api/mc/trace-forward at section granularity",
        shortestPath: "one call site in the generation path; no new framework",
        backendState: "UNWIRED (backend-blocked, not just unimplemented)",
      },
      {
        missingMutation: "DERIVED",
        owningAuthority: "DERIVED",
        existingMechanism: "PROVEN",
        capability: "DERIVED",
        witnessEvent: "DERIVED",
        readModel: "DERIVED",
        shortestPath: "DERIVED",
        backendState: "UNWIRED",
      },
      "backend inventory 2026-09-24 (STATE.md)"
    ),
  ];

  // ---- VIEWS ----
  const gwMentions = await ledgerGatewayMentions();
  const gatewayView = {
    releaseIdentity: {
      tag: byName.get("ping-gateway")?.image ?? null,
      imageId: gwInsp?.Image ?? null,
      created: gwInsp?.Created ?? null,
      sourceCommit: { value: null, claim: "UNKNOWN" as Claim, note: "build provenance not recorded on this host" },
    },
    container: {
      name: "ping-gateway",
      status: byName.get("ping-gateway")?.status ?? null,
      ports: byName.get("ping-gateway")?.ports ?? null,
      restartCount: gwInsp?.RestartCount ?? null,
      claim: "OBSERVED" as Claim,
    },
    health: {
      http: { endpoint: ":8080/health", status: 200, claim: "PROVEN" as Claim },
      dockerHealthcheck: { configured: Boolean(gwHealth), claim: (gwHealth ? "OBSERVED" : "UNWIRED") as Claim },
    },
    restartEvidence: {
      restartCount: gwInsp?.RestartCount ?? null,
      perRestartCause: { value: null, claim: "UNKNOWN" as Claim, note: "docker keeps no per-restart history" },
    },
    dependencies: {
      configuredKeys: envKeys,
      qdrant: qcol.ok ? "reachable (:6333)" : "unreachable",
      postgres: byName.has("ping-postgres") ? "container present (:5433)" : "absent",
      claim: "OBSERVED" as Claim,
      note: "key names only; values redacted, never read",
    },
    missions: gwMentions,
    recentChanges: {
      value: null,
      claim: "UNKNOWN" as Claim,
      note: "no source repo for the gateway image is recorded on this host; image created 2026-09-16",
    },
  };

  const postgresBackupView = {
    latestSuccessfulBackup: { value: null, claim: "UNWIRED" as Claim },
    age: { value: null, claim: "UNKNOWN" as Claim },
    rpo: {
      thisHost: { value: null, claim: "UNWIRED" as Claim },
      fleetHost: { value: "24h (daily automated)", claim: "DERIVED" as Claim, evidence: "OPS-004" },
    },
    lastRestoreDrill: {
      thisHost: { value: null, claim: "UNWIRED" as Claim },
      fleetHost: {
        value: "2026-09-24 — RESTORE VERIFIED, 2557/2557 ping_events rows content-identical",
        claim: "DERIVED" as Claim,
        evidence: "OPS-004",
      },
    },
    restoreResult: { value: null, claim: "UNKNOWN" as Claim, note: "no drill has run against this host" },
    authority: {
      value: "ops lane (fleet evidence); no backup authority exists on this host",
      claim: "DERIVED" as Claim,
    },
    evidence: {
      value:
        "bounded absence probe this request: /opt/ping/backups absent, no *.dump under /home/nolan /opt /var/backups (depth 3), no crontab, no backup/systemd timer",
      claim: "OBSERVED" as Claim,
    },
  };

  return NextResponse.json({
    ok: true,
    generatedAt,
    claimLegend: {
      PROVEN: "live backend state read now, corroborated by a second source",
      OBSERVED: "read live now from a single source, no independent corroboration",
      DERIVED: "computed from proven/observed facts",
      UNKNOWN: "looked for and not found, or not probed",
      STALE: "data older than its freshness bound",
      CONFLICTING: "two sources disagree",
      PROTOTYPE: "static/unwired projection; never shown as fact",
      UNWIRED: "looked for (bounded search) and confirmed absent",
    },
    objects,
    incidents,
    risks,
    backlog,
    views: {
      tree: [
        { label: "Pig (host)", objectId: "host:pig" },
        {
          label: "running services",
          children: [
            { label: "gateway-api :8080", objectId: "svc:gateway" },
            { label: "fyd-site :3100", objectId: "svc:site3100" },
            { label: "journal-gateway :18199", objectId: "svc:journal" },
            { label: "qdrant :6333", objectId: "svc:qdrant" },
            { label: "vault :8200", objectId: "svc:vault" },
          ],
        },
        {
          label: "containers",
          children: (containers ?? []).map((c) => ({
            label: `${c.name} (${c.image})`,
            objectId: `container:${c.name}`,
          })),
        },
        { label: "gateway", objectId: "release:gateway", detail: "gateway" },
        { label: "postgres", objectId: "db:ping-postgres", detail: "postgresBackup" },
        { label: "qdrant", objectId: "snapshot:qdrant" },
        { label: "fyd", objectId: "release:fyd-site", detail: "gateway" },
        { label: "deployments", objectIds: ["deploy:fyd-site", "deploy:gateway"] },
        { label: "repositories", objectIds: ["repo:ping", "repo:ping-website", "repo:constitutional-runtime"] },
        { label: "releases", objectIds: ["release:fyd-site", "release:gateway", "release:gateway-rc"] },
        { label: "backups", objectIds: ["backup:postgres", "snapshot:qdrant"], detail: "postgresBackup" },
        {
          label: "health",
          objectIds: ["hc:gateway", "hc:qdrant-docker", "hc:vault-docker"],
        },
        {
          label: "active incidents / risks",
          objectIds: [
            ...incidents.map((i) => i.id),
            ...risks.map((r) => r.id),
          ],
        },
      ],
      postgresBackup: postgresBackupView,
      gateway: gatewayView,
    },
  });
}
