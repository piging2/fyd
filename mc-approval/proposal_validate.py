#!/usr/bin/env python3
"""P0 W4: proposal validator for FYD SiteSpec presentation patches.

Validates an agent-produced proposal against the FYDPresentation contract
(deployed tree: /home/nolan/projects/ping/src/fyd/sitespec/types.ts) and
the Happy Place object graph
(deployed tree: .../src/fyd/proceduralize/__fixtures__/happy-place-graph.ts).

Checks:
  (a) ANCHOR: the proposal names a specific page_slug and section_id.
  (b) CONTRACT: every presentation field matches the FYDPresentation type;
      no unknown fields anywhere in the proposal.
  (c) REFERENCES: featuredIds / hiddenObjectIds / objectOrder entries all
      resolve to real object ids in the tenant graph.
  (d) CLAIMS: no unverified factual claims are presented as website
      statements (pattern-based flagging; the validator reports the exact
      matched text and does not attempt to prove truth).

The validator NEVER normalizes or fixes the agent's bytes. It reports
PASS/FAIL per check with evidence. Overall verdict FAIL if any check fails.

Canonical proposal shape (what a revision mission must output):

    {
      "mission_id": "mc-m-c5b2c89b4ff7",
      "page_slug": "home",
      "section_id": "home:Services:2",
      "presentation": {
        "heading": "...",
        "copy": "...",
        "featuredIds": ["<real object id>"],
        "hidden": false,
        "objectOrder": ["<real object id>"],
        "hiddenObjectIds": []
      }
    }

Exit 0 prints the JSON report; the process exit code is 0 even on FAIL
(the verdict lives in the report, not the exit code). --strict exits 1
on FAIL for CI-style gating.
"""

import json
import re
import sys

# ---------------------------------------------------------------------------
# Ground truth harvested from the deployed tree (:3100 serves
# /home/nolan/projects/ping). Pinned 2026-09-27 by P0 writer W4.
# ---------------------------------------------------------------------------

# FYDPresentation fields and their contract types (types.ts).
PRESENTATION_FIELDS = {
    "heading": str,
    "copy": str,
    "featuredIds": list,
    "hidden": bool,
    "objectOrder": list,
    "hiddenObjectIds": list,
}

# Page slugs the generator emits (proceduralize/generator.ts).
KNOWN_PAGES = {"home", "about", "services", "explore"}

# Registered components (fyd/components/registry.ts).
KNOWN_COMPONENTS = {
    "AskFYD", "BusinessSummary", "CTA", "Contact", "Gallery",
    "GenericObjectCard", "Hero", "IdentityCard", "Links", "Locations",
    "ObjectFeed", "ObjectGrid", "ObjectRail", "People", "Posts",
    "Products", "RecentObjects", "Services", "SocialProof",
}

# Real object ids in the Happy Place fixture graph (happy-place-graph.ts).
# Every claim in the fixture is website_statement; anything not in this set
# is not a resolvable object reference.
HAPPY_PLACE_OBJECT_IDS = {
    "website-business-6fa5ebd99d72c4cb",
    "website-business-6fa5ebd99d72c4cb-location",
    "website-business-6fa5ebd99d72c4cb-service-3263502c8175",  # Repairs
    "website-business-6fa5ebd99d72c4cb-service-340c39513223",  # Fencing
    "website-business-6fa5ebd99d72c4cb-service-7f1139c11dab",  # Painting
    "website-business-6fa5ebd99d72c4cb-service-c63c87ed8420",  # Drywall
    "website-business-6fa5ebd99d72c4cb-service-cd28e52699a5",  # Restoration
}

# Section ids derived from the generator's home-page order for happy-place
# (Hero:0, BusinessSummary:1, Services:2, Locations:3, Contact:4, Links:5,
# CTA:6, AskFYD:7, ObjectRail:8; no Gallery emitted without acquired media).
HAPPY_PLACE_HOME_SECTIONS = {
    "home:Hero:0", "home:BusinessSummary:1", "home:Services:2",
    "home:Locations:3", "home:Contact:4", "home:Links:5", "home:CTA:6",
    "home:AskFYD:7", "home:ObjectRail:8",
}
HAPPY_PLACE_SERVICES_SECTIONS = {"services:Services:0"}

TOP_LEVEL_FIELDS = {"mission_id", "page_slug", "section_id", "presentation"}

# High-risk factual-claim patterns. A match means the copy presents a fact
# the website never stated (the fixture graph carries no such claims), so
# the statement cannot go out as a website_statement. Pattern-based: the
# validator flags, it does not prove truth or falsehood.
CLAIM_PATTERNS = [
    (r"24\s*/\s*7", "availability claim '24/7'"),
    (r"24[-\s]?hour", "availability claim '24-hour'"),
    (r"guaranteed?", "guarantee claim"),
    (r"\b#1\b", "'#1' superlative claim"),
    (r"\bbest\b", "'best' superlative claim"),
    (r"licensed", "licensure claim"),
    (r"insured", "insurance claim"),
    (r"certified", "certification claim"),
    (r"award[-\s]?winning", "award claim"),
    (r"\bfree\b", "'free' offer claim"),
    (r"\b\d+\s*(year|yr)s?\b", "numeric experience claim"),
    (r"\bimmediate(ly)?\b", "immediacy claim"),
]


def _check(check_id, name, verdict, evidence):
    return {"id": check_id, "name": name,
            "verdict": "PASS" if verdict else "FAIL", "evidence": evidence}


def _split_envelope(proposal):
    """Detect canonical envelope vs bare presentation object.

    Returns (mode, pres) where mode is "envelope" or "bare". A bare
    presentation object is validated as-is for contract/references/claims;
    it always fails the anchor check (no page/section named).
    """
    pres = proposal.get("presentation")
    if isinstance(pres, dict):
        return "envelope", pres
    if any(k in PRESENTATION_FIELDS for k in proposal.keys()):
        return "bare", proposal
    return "unknown", None


def validate_proposal(proposal, mission_id=None):
    """Validate one proposal dict. Returns the structured report."""
    checks = []
    if not isinstance(proposal, dict):
        return {"overall": "FAIL", "checks": [
            _check("shape", "proposal is a JSON object", False,
                   "type=%s" % type(proposal).__name__)]}

    mode, pres = _split_envelope(proposal)

    # ---- (a) anchor -----------------------------------------------------
    anchor_problems = []
    page = proposal.get("page_slug")
    section = proposal.get("section_id")
    if mode == "bare":
        anchor_problems.append(
            "bare presentation object: no page_slug/section_id; the patch "
            "is not anchored to any page or section")
    else:
        if not isinstance(page, str) or not page:
            anchor_problems.append("page_slug missing or not a string")
        elif page not in KNOWN_PAGES:
            anchor_problems.append(
                "page_slug %r not a known page (known: %s)"
                % (page, sorted(KNOWN_PAGES)))
        if not isinstance(section, str) or not section:
            anchor_problems.append("section_id missing or not a string")
        else:
            m = re.match(r"^([a-z]+):([A-Za-z]+):(\d+)$", section)
            if not m:
                anchor_problems.append(
                    "section_id %r not of the form "
                    "pageSlug:Component:index" % section)
            else:
                sec_page, comp = m.group(1), m.group(2)
                if isinstance(page, str) and sec_page != page:
                    anchor_problems.append(
                        "section_id page %r does not match page_slug %r"
                        % (sec_page, page))
                if comp not in KNOWN_COMPONENTS:
                    anchor_problems.append(
                        "component %r not in the registered component set"
                        % comp)
    known_sections = (HAPPY_PLACE_HOME_SECTIONS
                      | HAPPY_PLACE_SERVICES_SECTIONS)
    anchor_evidence = {
        "mode": mode,
        "page_slug": page, "section_id": section,
        "known_pages": sorted(KNOWN_PAGES),
        "section_in_compiled_spec": section in known_sections,
    }
    if isinstance(section, str) and section not in known_sections \
            and not anchor_problems:
        anchor_evidence["note"] = (
            "well-formed and registered, but not in the derived "
            "happy-place section set; apply-time verification against the "
            "compiled spec is required")
    checks.append(_check(
        "anchor", "patch is anchored to a specific page/section",
        not anchor_problems,
        anchor_evidence if not anchor_problems else {
            **anchor_evidence, "problems": anchor_problems}))

    # ---- envelope shape --------------------------------------------------
    if mode == "envelope":
        unknown_top = sorted(set(proposal.keys()) - TOP_LEVEL_FIELDS)
        checks.append(_check(
            "envelope", "proposal envelope has exactly the known fields",
            not unknown_top,
            {"fields": sorted(proposal.keys()),
             "unknown_fields": unknown_top}))
    else:
        checks.append(_check(
            "envelope", "proposal envelope has exactly the known fields",
            False,
            {"mode": mode,
             "fields": sorted(proposal.keys()),
             "note": "bare presentation object; the canonical envelope "
                     "{mission_id, page_slug, section_id, presentation} "
                     "is required"}))
    if mission_id is not None and mode == "envelope":
        checks.append(_check(
            "mission_binding", "proposal binds the expected mission",
            proposal.get("mission_id") == mission_id,
            {"proposal_mission_id": proposal.get("mission_id"),
             "expected_mission_id": mission_id}))

    # ---- (b) contract types ----------------------------------------------
    # pres comes from _split_envelope above: the inner presentation in
    # envelope mode, the patch itself in bare mode, None when unknown.
    contract_problems = []
    if not isinstance(pres, dict):
        contract_problems.append("presentation missing or not an object")
    else:
        for field, value in pres.items():
            if field not in PRESENTATION_FIELDS:
                contract_problems.append(
                    "unknown presentation field %r" % field)
                continue
            want = PRESENTATION_FIELDS[field]
            if not isinstance(value, want):
                contract_problems.append(
                    "field %r: expected %s, got %s (value=%r)"
                    % (field, want.__name__, type(value).__name__, value))
                continue
            if want is list and any(not isinstance(v, str) for v in value):
                contract_problems.append(
                    "field %r: all entries must be strings" % field)
    checks.append(_check(
        "contract", "every presentation field matches the FYDPresentation "
                    "contract type",
        not contract_problems,
        {"presentation_fields": sorted(pres.keys())
         if isinstance(pres, dict) else None,
         "problems": contract_problems}))

    # ---- (c) references resolve -------------------------------------------
    ref_problems = []
    resolved = {}
    if isinstance(pres, dict):
        for field in ("featuredIds", "hiddenObjectIds", "objectOrder"):
            ids = pres.get(field, [])
            if not isinstance(ids, list):
                continue  # already failed contract; do not double-report
            bad = [i for i in ids
                   if i not in HAPPY_PLACE_OBJECT_IDS]
            dupes = sorted({i for i in ids if ids.count(i) > 1})
            resolved[field] = {
                "count": len(ids),
                "unresolved": bad,
                "duplicates": dupes,
            }
            if bad:
                ref_problems.append(
                    "field %r: unresolved object ids %s "
                    "(not in the Happy Place graph)" % (field, bad))
            if dupes:
                ref_problems.append(
                    "field %r: duplicated ids %s" % (field, dupes))
    checks.append(_check(
        "references", "featuredIds/object references resolve to real "
                      "object ids",
        not ref_problems,
        {"graph_object_count": len(HAPPY_PLACE_OBJECT_IDS),
         "fields": resolved, "problems": ref_problems}))

    # ---- (d) unverified claims --------------------------------------------
    claim_hits = []
    if isinstance(pres, dict):
        for field in ("heading", "copy"):
            text = pres.get(field)
            if not isinstance(text, str):
                continue
            for pattern, label in CLAIM_PATTERNS:
                m = re.search(pattern, text, re.IGNORECASE)
                if m:
                    claim_hits.append({
                        "field": field, "claim": label,
                        "matched_text": m.group(0),
                    })
    checks.append(_check(
        "claims", "no unverified factual claims presented as website "
                  "statements",
        not claim_hits,
        {"hits": claim_hits,
         "note": "pattern-based flagging; a hit means the text asserts a "
                 "fact the website never stated in the ingested graph"}))

    overall = "PASS" if all(c["verdict"] == "PASS" for c in checks) \
        else "FAIL"
    return {"overall": overall, "checks": checks}


def extract_patch_from_result(result):
    """Pull proposed_patch out of a mission result.json envelope.

    Returns (patch, notes). Never mutates the input bytes.
    """
    notes = []
    if not isinstance(result, dict):
        return None, ["result.json is not a JSON object"]
    output = result.get("output")
    if not isinstance(output, str):
        return None, ["result.output is not a string"]
    m = re.search(r"```json\s*(\{.*?\})\s*```", output, re.DOTALL)
    if not m:
        return None, ["no ```json fenced block in result.output"]
    try:
        inner = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        return None, ["fenced JSON block does not parse: %s" % e]
    notes.append("extracted fenced JSON block with keys %s"
                 % sorted(inner.keys()))
    patch = inner.get("proposed_patch", inner)
    if "proposed_patch" in inner:
        notes.append("using inner proposed_patch object "
                     "(envelope keys analysis/rationale excluded from "
                     "validation)")
    return patch, notes


def main(argv):
    import argparse
    ap = argparse.ArgumentParser(
        description="Validate an FYD presentation proposal.")
    ap.add_argument("proposal_json", help="path to a JSON file holding the "
                    "proposal object (or a mission result.json with "
                    "--result-envelope)")
    ap.add_argument("--result-envelope", action="store_true",
                    help="extract proposed_patch from a mission result.json")
    ap.add_argument("--mission-id", default=None)
    ap.add_argument("--strict", action="store_true",
                    help="exit 1 when the verdict is FAIL")
    ap.add_argument("--report", default=None,
                    help="write the JSON report to this path")
    args = ap.parse_args(argv)

    with open(args.proposal_json, encoding="utf-8") as f:
        data = json.load(f)
    notes = []
    if args.result_envelope:
        data, notes = extract_patch_from_result(data)
        if data is None:
            report = {"overall": "FAIL",
                      "extraction_notes": notes, "checks": []}
        else:
            report = validate_proposal(data, mission_id=args.mission_id)
            report["extraction_notes"] = notes
    else:
        report = validate_proposal(data, mission_id=args.mission_id)
    report["validator"] = "mission-control/proposal_validate.py (p0/approval)"

    out = json.dumps(report, indent=2, sort_keys=True)
    print(out)
    if args.report:
        with open(args.report, "w", encoding="utf-8") as f:
            f.write(out + "\n")
    if args.strict and report["overall"] == "FAIL":
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
