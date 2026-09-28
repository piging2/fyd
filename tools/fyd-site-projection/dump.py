#!/usr/bin/env python3
"""FYD site projection dump (PING tooling, NOT the website repo).

Builds the canonical PING-backed object-graph projection for one FYD demo
site and writes it as JSON for the Next.js app to serve. Nothing is
hand-authored:

  BASE: mechanically extracted from the committed machine-generated fixture
        TS (strip the TS wrapper, parse the JSON body). Byte-deterministic;
        base sha256 recorded in the manifest.
  OVERLAYS: FYD_SITE_OVERLAY events read (read-only) from the journal,
        applied in (timestamp, event_id) order. Each overlay records the
        journal event id that produced it. No overlay without a journaled
        event. In demo mode the journal is the repo-booted JSONL demo
        journal gateway (the store the customize approve route journals
        to, and the store the :3100 FYD site server reads). The demo
        Postgres shadow (ping-test-pg, db ping-fyd-demo) was retired as a
        read source 2026-09-24: its rows are logical duplicates of the
        JSONL events under different event_ids, and the two-store merge
        double-applied add_object, aborting the happy-place dump
        fail-closed. The Postgres rows are left intact;
        query_overlays_demo_pg remains for forensics.

Usage:
  dump.py <site-slug>            # happy-place | coppersmith-plumbing
  dump.py --all                  # both sites

Output (atomic write via tmp+rename):
  /home/nolan/ping/var/fyd-projections/<slug>.json
  { meta: { siteId, dumpedAt, dumperVersion, baseDigest, fixtureFileDigest,
            fixtureHeader, overlayEventIds[], graphDigest,
            generatedAt, eventSequences, presentationIntentDigest },
    graph: { objects: [...], relationships: [...] },
    presentationIntent: { directives: [...],        # owner-approved display
                          provenance: {...} } }    # directives; digest = meta
                                                   # .presentationIntentDigest

  graphDigest = sha256 over the canonical form of graph: recursive key sort,
  arrays keep their order, JSON separators (',', ':') — the same rule as the
  website repo's canonicalize() in src/lib/ping/ask-composer.ts. The Next.js
  source module recomputes this digest and FAILS CLOSED on mismatch.

Overlay ops (event_data.ops is a list; every op is validated, unknown op
kinds abort the dump):
  {op:"set_field", objectId, field, value}        # fields[field]=value, or
                                                  # title/description top-level
  {op:"add_object", object}                        # full PingObject; provenance
                                                  # is FORCED to canonical-journal
                                                  # ref ping-event:<event_id>
  {op:"add_relationship", relationship}           # full PingRelationship;
                                                  # evidenceRef forced to
                                                  # ping-event:<event_id>
  {op:"deactivate_object", objectId}              # visibility -> "private"
                                                  # (drops out of public render)
  {op:"set_presentation_intent", intentId,        # PRESENTATION INTENT layer:
      siteIntent, proposal, approval}             # approval carries the demo-owner
                                                  # marker and the proposal digest;
                                                  # upserted by intentId
  {op:"clear_presentation_intent", intentId}     # remove an intent directive

Exit codes: 0 ok, 1 usage/internal error, 2 overlay query failed (fail closed:
no projection is written). Exit 2 also covers FYD-037 WRONG_JOURNAL: the
overlay journal did not prove the expected identity (marker mismatch or
unreadable marker) on its pre-flight GET.
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

DUMPER_VERSION = "fyd-projection-dump@1.2.1"
REPO = "/home/nolan/projects/ping"
OUT_DIR = "/home/nolan/ping/var/fyd-projections"

# Overlay journal selection. "main" (default) reads overlays from the 8080
# deployment gateway's Postgres via the ping-gateway container. "demo" reads
# from FYD's own demo journal: the repo-booted JSONL journal gateway on
# 127.0.0.1:18199 (the store the customize approve route actually journals
# to). The demo Postgres shadow (ping-test-pg:55433, db ping-fyd-demo) was
# retired as a read source 2026-09-24 (see query_overlays_demo): earlier
# lanes journaled there while following this file's old docstring, and its
# rows are logical duplicates of the JSONL events under different event_ids,
# which aborted the happy-place dump fail-closed on double-apply. The rows
# are left intact. The demo journal is used until the 8080 deployment lane
# registers FYD_SITE_OVERLAY in its own baked registry (see FAILURE_LEDGER
# FL-20260921-231).
OVERLAY_JOURNAL = os.environ.get("FYD_OVERLAY_JOURNAL", "main")
JOURNAL_GATEWAY_URL = os.environ.get("FYD_JOURNAL_GATEWAY_URL",
                                     "http://127.0.0.1:18199").rstrip("/")
MAIN_GATEWAY_URL = os.environ.get("FYD_MAIN_GATEWAY_URL",
                                  "http://127.0.0.1:8080").rstrip("/")

# FYD-037: journal identity (symmetric to emit-overlay.py). Every overlay
# read path performs exactly one pre-flight GET against the journal's
# identity endpoint and fails closed (exit 2, typed WRONG_JOURNAL) on
# marker mismatch OR on an unreadable marker. A projection is never built
# from a journal that cannot prove it is the intended overlay journal.
# The expected marker follows the selected journal: the FYD demo journal
# asserts "fyd-demo-journal@<live-derived>" on GET /; the main PING
# journal will assert "ping-main-journal@<live-derived>" on GET /health
# once its journal field lands (pending the gateway cutover HOLD: until
# then, main-mode reads fail closed as unreadable-marker, which is the
# correct posture because the main journal does not accept
# FYD_SITE_OVERLAY anyway, FL-20260921-231). FYD_EXPECTED_OVERLAY_JOURNAL
# overrides the derived expectation explicitly.
EXPECTED_OVERLAY_JOURNAL_MARKER = os.environ.get(
    "FYD_EXPECTED_OVERLAY_JOURNAL") or (
        "fyd-demo-journal" if OVERLAY_JOURNAL == "demo"
        else "ping-main-journal")


def _journal_marker_ok(asserted, expected):
    """The derived suffix after '@' is allowed to vary (the journal
    re-derives it live from its store); the marker name must match."""
    return (isinstance(asserted, str)
            and (asserted == expected
                 or asserted.startswith(expected + "@")))


def _preflight_journal(base_url, identity_path):
    """One pre-flight GET against the journal's identity endpoint.

    Fail closed (exit 2): a projection must never be built from a
    journal that cannot prove its identity.
    """
    url = base_url.rstrip("/") + identity_path
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status != 200:
                raise RuntimeError("HTTP %s" % resp.status)
            doc = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        sys.stderr.write(
            "WRONG_JOURNAL: journal identity unreadable at %s: %s\n"
            % (url, e))
        sys.exit(2)
    asserted = doc.get("journal") if isinstance(doc, dict) else None
    if not _journal_marker_ok(asserted, EXPECTED_OVERLAY_JOURNAL_MARKER):
        sys.stderr.write(
            "WRONG_JOURNAL: expected overlay journal marker %r at %s, "
            "got %r\n" % (EXPECTED_OVERLAY_JOURNAL_MARKER, url, asserted))
        sys.exit(2)
DEMO_PG = {
    "host": os.environ.get("FYD_DEMO_PG_HOST", "127.0.0.1"),
    "port": os.environ.get("FYD_DEMO_PG_PORT", "55433"),
    "user": os.environ.get("FYD_DEMO_PG_USER", "postgres"),
    "db": os.environ.get("FYD_DEMO_PG_DB", "ping-fyd-demo"),
}
HOST_PG_MODULE = "/home/nolan/ping/gateway/node_modules/pg"

# Spec-compile pins, copied from fyd-proof-run/regen.ts SITES (the values the
# public pages currently hardcode). These are derivation parameters, not
# customer facts; they travel in the projection meta so the page no longer
# hardcodes them.
SITES = {
    "happy-place": {
        "fixture": REPO + "/src/fyd/proceduralize/__fixtures__/happy-place-graph.ts",
        "generatedAt": "2026-09-21T12:00:00.000Z",
        "eventSequences": [65, 83],
    },
    "coppersmith-plumbing": {
        "fixture": REPO + "/src/fyd/proceduralize/__fixtures__/coppersmith-graph.ts",
        "generatedAt": "2026-09-21T12:01:10.844Z",
        "eventSequences": None,
    },
}

QUERY_JS = r"""
const {Client}=require('/app/node_modules/pg');
(async()=>{
 const c=new Client({host:process.env.POSTGRES_HOST,
  port:parseInt(process.env.POSTGRES_PORT||'5432',10),
  user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,
  database:process.env.POSTGRES_DB,connectionTimeoutMillis:8000});
 try{await c.connect();}catch(e){console.error('QUERY_ERROR connect:'+e.message);process.exit(2);}
 try{
  const r=await c.query(
   "SELECT event_id, timestamp, payload AS event_data FROM ping_events "+
   "WHERE event_type='FYD_SITE_OVERLAY' AND payload->>'siteId'=$1 "+
   "ORDER BY timestamp ASC, event_id ASC",[process.argv[2]]);
  for(const row of r.rows){
   const ts=row.timestamp instanceof Date?row.timestamp.toISOString():row.timestamp;
   console.log(JSON.stringify({event_id:row.event_id,timestamp:ts,event_data:row.event_data}));
  }
 }catch(e){console.error('QUERY_ERROR query:'+e.message);process.exit(2);}
 await c.end();
})().catch(e=>{console.error('QUERY_ERROR:'+e.message);process.exit(2);});
"""


def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def canonicalize(v):
    """Canonical JSON string: recursive key sort, array order preserved,
    separators (',', ':'). Must byte-match the TS canonicalize() in the
    website repo for pure-JSON values. Floats are refused: TS and Python
    serialize them differently, and a digest must never be ambiguous."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        raise ValueError("canonicalize: float refused (TS/Python serialization differs)")
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(canonicalize(x) for x in v) + "]"
    if isinstance(v, dict):
        items = sorted(v.items(), key=lambda kv: kv[0])
        return "{" + ",".join(
            json.dumps(k, ensure_ascii=False) + ":" + canonicalize(val)
            for k, val in items
        ) + "}"
    raise ValueError("canonicalize: unsupported type %r" % type(v))


def extract_base_graph(fixture_path):
    """Mechanically extract the object graph from a machine-generated fixture
    TS file: drop import lines, strip the `export const X: ObjectGraph =`
    wrapper, parse the JSON body. Returns (graph_dict, header_comment)."""
    with open(fixture_path, encoding="utf-8") as f:
        text = f.read()
    m = re.search(r"export const \w+: ObjectGraph = (\{)", text)
    if not m:
        raise ValueError("fixture wrapper not found in %s" % fixture_path)
    start = m.start(1)
    tail = text[start:].rstrip()
    if tail.endswith(";"):
        tail = tail[:-1].rstrip()
    if not tail.endswith("}"):
        raise ValueError("fixture body does not end with } in %s" % fixture_path)
    graph = json.loads(tail)
    header = ""
    hm = re.match(r"\s*/\*\*(.*?)\*/", text, re.DOTALL)
    if hm:
        header = hm.group(1).strip().splitlines()[0].strip(" *")
    return graph, header


def demo_pg_password():
    """Resolve the demo Postgres password: env override, else the
    ping-test-pg container env (same pattern as the gateway boot)."""
    pw = os.environ.get("FYD_DEMO_PG_PASSWORD")
    if pw:
        return pw
    cp = subprocess.run(
        ["docker", "inspect", "ping-test-pg", "--format",
         "{{range .Config.Env}}{{println .}}{{end}}"],
        capture_output=True, timeout=30)
    if cp.returncode != 0:
        raise RuntimeError("docker inspect ping-test-pg failed")
    for line in cp.stdout.decode("utf-8", "replace").splitlines():
        if line.startswith("POSTGRES_PASSWORD="):
            return line.split("=", 1)[1]
    raise RuntimeError("POSTGRES_PASSWORD not found in ping-test-pg env")


def query_overlays_demo_pg(site):
    """RETIRED 2026-09-24 as a dump read source; kept for forensics (the
    ping-fyd-demo rows are intact). Reads FYD_SITE_OVERLAY events for the
    site from the demo Postgres journal (read-only SELECT against
    ping-fyd-demo via node + the gateway's pg module on the Pig host).
    Same row contract as the main path."""
    js = QUERY_JS.replace("/app/node_modules/pg", HOST_PG_MODULE, 1)
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write(js)
        js_path = f.name
    try:
        env = dict(os.environ,
                   POSTGRES_HOST=DEMO_PG["host"],
                   POSTGRES_PORT=DEMO_PG["port"],
                   POSTGRES_USER=DEMO_PG["user"],
                   POSTGRES_PASSWORD=demo_pg_password(),
                   POSTGRES_DB=DEMO_PG["db"])
        cp = subprocess.run(["node", js_path, site], capture_output=True,
                            timeout=60, env=env)
    finally:
        os.unlink(js_path)
    if cp.returncode != 0:
        sys.stderr.write("demo overlay query failed:\n%s\n"
                         % cp.stderr.decode("utf-8", "replace"))
        sys.exit(2)
    events = []
    for line in cp.stdout.decode("utf-8").splitlines():
        line = line.strip()
        if line:
            events.append(json.loads(line))
    return events


def query_overlays_jsonl(site):
    """Read FYD_SITE_OVERLAY events for the site from the FYD demo journal
    gateway (JSONL store, read-only). This is the store the customize
    approve route journals to (src/fyd/customize/server.ts emitOverlayEvent).
    Same row contract as the Postgres paths: {event_id, timestamp,
    event_data}. Tenant scoping is done client-side on event_data.siteId,
    mirroring PingObjectReader.queryFydSiteOverlays. Fail closed (exit 2)
    on any fetch or shape error: a projection must never be built from a
    partially read journal."""
    import urllib.request

    events = []
    offset = 0
    limit = 10000
    while True:
        url = ("%s/events/FYD_SITE_OVERLAY?limit=%d&offset=%d&tenant=%s"
               % (JOURNAL_GATEWAY_URL, limit, offset, site))
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status != 200:
                    raise RuntimeError("HTTP %s" % resp.status)
                doc = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            sys.stderr.write("demo journal gateway query failed:\n%s\n" % e)
            sys.exit(2)
        page = doc.get("events") if isinstance(doc, dict) else None
        if not isinstance(page, list):
            sys.stderr.write("demo journal gateway query failed:\n"
                             "unexpected response shape\n")
            sys.exit(2)
        for rec in page:
            if not isinstance(rec, dict):
                sys.stderr.write("demo journal gateway query failed:\n"
                                 "event record is not an object\n")
                sys.exit(2)
            eid = rec.get("event_id")
            edata = rec.get("event_data")
            if (not isinstance(eid, str) or not eid
                    or not isinstance(edata, dict)):
                sys.stderr.write("demo journal gateway query failed:\n"
                                 "malformed event record\n")
                sys.exit(2)
            if edata.get("siteId") != site:
                continue
            events.append({
                "event_id": eid,
                "timestamp": rec.get("timestamp") or "",
                "event_data": edata,
            })
        if len(page) < limit:
            break
        offset += limit
    return events


def query_overlays_demo(site):
    """Demo journal read: the JSONL demo journal gateway is the journal of
    record (the store the customize approve route journals to; the store
    the :3100 FYD site server reads via PingObjectReader).

    The demo Postgres shadow (ping-fyd-demo) was retired as a read source
    2026-09-24: its rows are logical duplicates of the JSONL events under
    different event_ids, and the two-store merge double-applied add_object,
    aborting the happy-place dump fail-closed. Events are applied in
    (timestamp, event_id) order. No event is authored here; provenance
    (event_id) is preserved from the journal.
    FYD-037: the JSONL gateway asserts the demo journal's identity; one
    pre-flight covers this read."""
    _preflight_journal(JOURNAL_GATEWAY_URL, "/")
    events = query_overlays_jsonl(site)
    events.sort(key=lambda e: (e.get("timestamp") or "", e["event_id"]))
    return events


def query_overlays(site):
    """Read FYD_SITE_OVERLAY events for the site from PING Postgres, using the
    gateway container's own pg client and POSTGRES_* env (read-only SELECT).
    The probe JS is docker-cp'd into the container (node cannot execute a
    script piped through `docker exec -i ... node /dev/stdin`).
    FYD-037: the main journal must prove its identity on /health before any
    overlay is read from it."""
    if OVERLAY_JOURNAL == "demo":
        return query_overlays_demo(site)
    _preflight_journal(MAIN_GATEWAY_URL, "/health")
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write(QUERY_JS)
        js_path = f.name
    cname = "fyd-overlay-query-%d.js" % os.getpid()
    try:
        cp = subprocess.run(
            ["docker", "cp", js_path, "ping-gateway:/tmp/" + cname],
            capture_output=True, timeout=60)
        if cp.returncode != 0:
            sys.stderr.write("overlay query failed (docker cp):\n%s\n"
                             % cp.stderr.decode("utf-8", "replace"))
            sys.exit(2)
        cp = subprocess.run(
            ["docker", "exec", "ping-gateway", "node", "/tmp/" + cname, site],
            capture_output=True, timeout=60)
    finally:
        os.unlink(js_path)
        subprocess.run(["docker", "exec", "ping-gateway",
                        "rm", "-f", "/tmp/" + cname],
                       capture_output=True, timeout=30)
    if cp.returncode != 0:
        sys.stderr.write("overlay query failed:\n%s\n" % cp.stderr.decode("utf-8", "replace"))
        sys.exit(2)
    events = []
    for line in cp.stdout.decode("utf-8").splitlines():
        line = line.strip()
        if line:
            events.append(json.loads(line))
    return events


def apply_overlays(graph, events):
    """Apply overlay ops deterministically.
    Returns (graph, applied_event_ids, presentation_intents).
    Presentation-intent ops never touch the graph: they accumulate in a
    separate journal-ordered list, upserted by intentId with the newest
    journal event last. Any malformed op
    aborts the whole dump (fail closed)."""
    objects = {o["id"]: o for o in graph["objects"]}
    rel_ids = {r["id"] for r in graph["relationships"]}
    applied = []
    presentation_intents = []
    for ev in events:
        eid = ev["event_id"]
        ops = (ev.get("event_data") or {}).get("ops")
        if not isinstance(ops, list):
            raise ValueError("event %s: ops is not a list" % eid)
        for op in ops:
            kind = op.get("op") if isinstance(op, dict) else None
            if kind == "set_field":
                oid, field, value = op.get("objectId"), op.get("field"), op.get("value")
                if not (isinstance(oid, str) and isinstance(field, str)
                        and isinstance(value, (str, list)) and oid in objects):
                    raise ValueError("event %s: bad set_field %r" % (eid, op))
                o = objects[oid]
                if field in ("title", "description"):
                    o[field] = value if isinstance(value, str) else value
                else:
                    o.setdefault("fields", {})[field] = value
                prov = o.setdefault("provenance", {})
                refs = prov.setdefault("updatedRefs", [])
                ref = "ping-event:" + eid
                if ref not in refs:
                    refs.append(ref)
            elif kind == "add_object":
                o = op.get("object")
                if not (isinstance(o, dict) and isinstance(o.get("id"), str)
                        and o["id"] not in objects):
                    raise ValueError("event %s: bad add_object %r" % (eid, op))
                new_o = dict(o)
                new_o["provenance"] = {
                    "kind": "canonical-journal",
                    "ref": "ping-event:" + eid,
                    "derivedAt": ev["timestamp"],
                }
                objects[new_o["id"]] = new_o
                graph["objects"].append(new_o)
            elif kind == "add_relationship":
                r = op.get("relationship")
                if not (isinstance(r, dict) and isinstance(r.get("id"), str)
                        and r["id"] not in rel_ids):
                    raise ValueError("event %s: bad add_relationship %r" % (eid, op))
                new_r = dict(r)
                new_r["evidenceRef"] = "ping-event:" + eid
                rel_ids.add(new_r["id"])
                graph["relationships"].append(new_r)
            elif kind == "deactivate_object":
                oid = op.get("objectId")
                if not (isinstance(oid, str) and oid in objects):
                    raise ValueError("event %s: bad deactivate_object %r" % (eid, op))
                objects[oid]["visibility"] = "private"
                prov = objects[oid].setdefault("provenance", {})
                refs = prov.setdefault("updatedRefs", [])
                ref = "ping-event:" + eid
                if ref not in refs:
                    refs.append(ref)
            elif kind == "set_presentation_intent":
                # PRESENTATION INTENT layer. Validated strictly; never merged
                # into the object graph. The website's read seam re-verifies
                # the block digest and the apply layer re-resolves targets.
                intent_id = op.get("intentId")
                site_intent = op.get("siteIntent")
                proposal = op.get("proposal")
                approval = op.get("approval")
                ok = (
                    isinstance(intent_id, str) and intent_id
                    and isinstance(site_intent, dict)
                    and isinstance(site_intent.get("kind"), str)
                    and isinstance(proposal, dict)
                    and isinstance(proposal.get("proposalDigest"), str)
                    and proposal["proposalDigest"]
                    and isinstance(approval, dict)
                    and all(isinstance(approval.get(k), str) and approval[k]
                            for k in ("proposalDigest", "approvedBy", "approvedAt", "note"))
                )
                if not ok:
                    raise ValueError("event %s: bad set_presentation_intent %r" % (eid, op))
                if approval["proposalDigest"] != proposal["proposalDigest"]:
                    raise ValueError("event %s: approval digest != proposal digest" % eid)
                if "DEMO OWNER MODE" not in approval["note"]:
                    raise ValueError("event %s: approval note lacks the demo-owner marker" % eid)
                directive = {
                    "intentId": intent_id,
                    "siteIntent": site_intent,
                    "proposal": proposal,
                    "approval": {
                        "proposalDigest": approval["proposalDigest"],
                        "approvedBy": approval["approvedBy"],
                        "approvedAt": approval["approvedAt"],
                        "note": approval["note"],
                        "eventId": eid,
                    },
                }
                # Journal-event order invariant: directives are emitted in the
                # order of their newest journal event. A re-approved intent is
                # removed and re-appended, so for same-section conflicts the
                # newest journal event wins in the apply layer (which consumes
                # the list in order, last wins).
                for i, existing in enumerate(presentation_intents):
                    if existing["intentId"] == intent_id:
                        del presentation_intents[i]
                        break
                presentation_intents.append(directive)
            elif kind == "clear_presentation_intent":
                intent_id = op.get("intentId")
                if not (isinstance(intent_id, str) and intent_id):
                    raise ValueError("event %s: bad clear_presentation_intent %r" % (eid, op))
                presentation_intents[:] = [
                    d for d in presentation_intents if d["intentId"] != intent_id
                ]
            else:
                raise ValueError("event %s: unknown op kind %r" % (eid, kind))
        applied.append(eid)
    return graph, applied, presentation_intents


def dump_site(site):
    cfg = SITES[site]
    with open(cfg["fixture"], "rb") as f:
        fixture_bytes = f.read()
    fixture_file_digest = sha256_hex(fixture_bytes)
    graph, header = extract_base_graph(cfg["fixture"])
    base_digest = sha256_hex(canonicalize(graph).encode("utf-8"))
    events = query_overlays(site)
    graph, applied, presentation_intents = apply_overlays(graph, events)
    graph_digest = sha256_hex(canonicalize(graph).encode("utf-8"))
    # PRESENTATION INTENT block: digest-verified by the website read seam
    # (src/fyd/data/ping-object-source.ts) exactly like the graph digest.
    intent_block = {
        "directives": presentation_intents,
        "provenance": {
            "kind": "owner-presentation-intent",
            "note": "Owner-approved presentation intents (PRESENTATION INTENT "
                    "layer). Not source facts; re-applied over the base graph on "
                    "every dump. Journaled via FYD_SITE_OVERLAY events.",
            "eventIds": [d["approval"]["eventId"] for d in presentation_intents],
        },
    }
    intent_digest = sha256_hex(canonicalize(intent_block).encode("utf-8"))
    import datetime
    doc = {
        "meta": {
            "siteId": site,
            "dumpedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "dumperVersion": DUMPER_VERSION,
            "baseDigest": base_digest,
            "fixtureFileDigest": fixture_file_digest,
            "fixtureHeader": header,
            "overlayEventIds": applied,
            "graphDigest": graph_digest,
            "generatedAt": cfg["generatedAt"],
            "eventSequences": cfg["eventSequences"],
            "presentationIntentDigest": intent_digest,
        },
        "graph": graph,
        "presentationIntent": intent_block,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, site + ".json")
    tmp_fd, tmp_path = tempfile.mkstemp(dir=OUT_DIR, suffix=".json")
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp_path, out_path)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
    print("wrote %s (base %s.., overlays %d, graphDigest %s.., intents %d, intentDigest %s..)"
          % (out_path, base_digest[:12], len(applied), graph_digest[:12],
             len(presentation_intents), intent_digest[:12]))
    return out_path


def main(argv):
    if len(argv) == 2 and argv[1] == "--all":
        sites = sorted(SITES)
    elif len(argv) == 2 and argv[1] in SITES:
        sites = [argv[1]]
    else:
        sys.stderr.write("usage: dump.py <site-slug>|--all  (slugs: %s)\n"
                         % ", ".join(sorted(SITES)))
        return 1
    for site in sites:
        dump_site(site)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
