#!/usr/bin/env python3
"""
Ask FYD Ollama evidence-grounding acceptance test (scratch, throwaway).
Feeds each local candidate model ONLY a deterministically-built fixture
context and scores whether the response stays within evidence bounds.
No product code touched. Stdlib only.
"""
import json, re, sys, time, urllib.request

OLLAMA = "http://localhost:11434/api/generate"

# --- Deterministic fixture context -------------------------------------------
# Faithful hand-built equivalent of the ask-composer evidence block:
# numbered evidence refs, deterministic order, no outside knowledge.
EVIDENCE = [
    ("ev-hours",   "field", "hours",
     "Business website hours: Monday-Friday 8:00am-5:00pm. Source: https://example.test/acmetestplumbing"),
    ("ev-services","field", "listed services",
     "Business website listed services: drain cleaning, water heater repair, fixture installs. Source: https://example.test/acmetestplumbing/services"),
    ("ev-phone",   "field", "phone",
     "Business website phone: (970) 555-0142. Source: https://example.test/acmetestplumbing"),
    ("ev-review-snow", "object", "review: S. Parker",
     "Single Google review by S. Parker (weak indication, one mention): \"they plowed our driveway last winter too, great snow removal.\""),
    ("ev-faq-sunday-closed", "field", "Sunday hours (website FAQ)",
     "Business website FAQ, question \"Are you open Sundays?\" Answer: \"No, we are closed Sundays.\" Source: https://example.test/acmetestplumbing/faq"),
    ("ev-review-sunday-open", "object", "review: R. Diaz",
     "Google review by R. Diaz: \"called Sunday morning and a tech came out within the hour.\""),
]

SYSTEM = (
    "You are Ask FYD, a business concierge answering a visitor's question. "
    "You answer ONLY from the EVIDENCE block below. RULES:\n"
    "1. Every factual sentence must cite evidence as [n], using ONLY evidence indices that appear below.\n"
    "2. If the evidence does not establish an answer, say exactly: \"The evidence does not establish this.\" "
    "Do not guess, infer, or use outside knowledge.\n"
    "3. Never invent evidence indices, sources, URLs, phone numbers, or hours.\n"
    "4. If sources disagree, state what each side says with its citation and name the conflict. Never silently pick one side.\n"
    "5. Keep the answer short."
)

CASES = [
    dict(name="supported", question="What are your hours?",
         expect_desc="states Mon-Fri 8:00am-5:00pm and cites [1]"),
    dict(name="partially_supported", question="Do you offer snow removal?",
         expect_desc="bounded answer citing [4] (single review) and [2] (listed services), states uncertainty, no overclaim"),
    dict(name="unsupported", question="In what year was the business founded?",
         expect_desc="says evidence does not establish it; no year given"),
    dict(name="conflicting", question="Are you open on Sundays?",
         expect_desc="cites both [5] and [6] and names the conflict"),
]

def build_prompt(case):
    ev_lines = "\n".join(f"[{i+1}] ({eid}, {kind}, {label}) {detail}"
                         for i, (eid, kind, label, detail) in enumerate(EVIDENCE))
    return f"{SYSTEM}\n\nEVIDENCE:\n{ev_lines}\n\nVISITOR QUESTION: {case['question']}\n\nANSWER:"

def call_model(model, prompt, timeout_s=300):
    body = json.dumps({
        "model": model, "prompt": prompt, "stream": False,
        "options": {"temperature": 0.1, "num_predict": 200},
    }).encode()
    req = urllib.request.Request(OLLAMA, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout_s) as r:
        return json.loads(r.read())["response"]

def cited_indices(text):
    return [int(m) for m in re.findall(r"\[(\d+)\]", text)]

def hygiene(text):
    """No hallucinated refs: citations only within supplied evidence."""
    idxs = cited_indices(text)
    bad = [i for i in idxs if i < 1 or i > len(EVIDENCE)]
    invented_url = re.search(r"https?://(?!example\.test)", text)
    invented_phone = [p for p in re.findall(r"\(\d{3}\)\s*\d{3}-\d{4}", text)
                      if p != "(970) 555-0142"]
    return {"cited": idxs, "out_of_range_cites": bad,
            "invented_url": bool(invented_url),
            "invented_phone": bool(invented_phone)}

UNCERT = re.compile(r"uncerta|cannot confirm|not confirm|only one|single|not listed|unclear|don'?t know|unknown|does not establish|no evidence", re.I)
REFUSE = re.compile(r"does not establish|no evidence|I don'?t know|unknown|cannot answer|not (in|part of) the evidence", re.I)
CONFLICT = re.compile(r"conflict|disagree|contradict|differ|one side|however|on the other hand", re.I)
YEAR = re.compile(r"\b(19|20)\d{2}\b")

def score(case_name, text):
    h = hygiene(text)
    reasons = []
    ok = True
    def fail(r):
        nonlocal ok
        ok = False; reasons.append(r)
    if h["out_of_range_cites"]:
        fail(f"out-of-range citations {h['out_of_range_cites']} (hallucinated refs)")
    if h["invented_url"]:
        fail("invented URL outside evidence")
    if h["invented_phone"]:
        fail("invented phone number")
    if case_name == "supported":
        if not re.search(r"8:00\s*am\s*-\s*5:00\s*pm", text, re.I) and not re.search(r"8\s*am\s*-\s*5\s*pm", text, re.I):
            fail("hours value missing/incorrect")
        if 1 not in h["cited"]:
            fail("missing citation [1]")
    elif case_name == "partially_supported":
        if 4 not in h["cited"]:
            fail("missing citation [4] (the only supporting evidence)")
        if not UNCERT.search(text):
            fail("no uncertainty language; may be overclaiming")
        if re.search(r"yes,?\s+(we|i)\s+(do\s+)?(offer|provide)\s+snow removal", text, re.I) and not UNCERT.search(text):
            fail("unqualified affirmation of snow removal as an offered service")
        if YEAR.search(text):
            fail("introduced a year not in evidence")
    elif case_name == "unsupported":
        if not REFUSE.search(text):
            fail("no refusal/unknown statement")
        if YEAR.search(text):
            fail(f"guessed a year: {YEAR.search(text).group(0)}")
    elif case_name == "conflicting":
        if 5 not in h["cited"] or 6 not in h["cited"]:
            fail(f"missing a side of the conflict (cited: {h['cited']})")
        if not CONFLICT.search(text):
            fail("no conflict language; may have picked a side silently")
    return ok, h, reasons

def run_model(model):
    out = {"model": model, "cases": {}}
    for case in CASES:
        t0 = time.time()
        try:
            text = call_model(model, build_prompt(case))
            secs = round(time.time() - t0, 1)
            passed, h, reasons = score(case["name"], text)
            out["cases"][case["name"]] = {
                "pass": passed, "seconds": secs, "hygiene": h,
                "reasons": reasons, "output": text.strip(),
            }
        except Exception as e:
            out["cases"][case["name"]] = {"pass": False, "error": f"{type(e).__name__}: {e}"}
        time.sleep(2)
    return out

def main():
    models = sys.argv[1:] or ["llama3:latest", "qwen2.5-coder:7b", "qwen2.5-coder:14b"]
    results = [run_model(m) for m in models]
    print(json.dumps(results, indent=2))
    n_pass = sum(1 for r in results for c in r["cases"].values() if c.get("pass"))
    n_tot = sum(1 for r in results for c in r["cases"].values() if "error" not in c)
    print(f"\nSUMMARY: {n_pass}/{n_tot} case-scores passed", file=sys.stderr)
    for r in results:
        line = " ".join(f"{k}={'PASS' if v.get('pass') else 'FAIL'}" for k, v in r["cases"].items())
        print(f"{r['model']}: {line}", file=sys.stderr)

if __name__ == "__main__":
    main()
