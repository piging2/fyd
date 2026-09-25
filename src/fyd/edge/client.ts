/**
 * FYD EDGE-OBJECT EXPERIENCE: client behavior.
 *
 * edgeClientScript(siteSlug): vanilla JS (string concatenation only, no
 * nested template literals) implementing the mobile-first edge interaction
 * contract:
 *
 *   OBJECT -> TAP -> EXPAND (compact object sheet) -> EDGES APPEAR
 *   -> TRAVERSE EDGE -> NEXT OBJECT -> EXPAND / ACT / ASK / RETURN
 *
 * - FIRST TAP on any [data-fyd-object-id] opens the compact object sheet:
 *   identity/title, type, evidence-backed summary, PRIMARY EDGES,
 *   capability-resolved actions.
 * - SECOND TAP on an edge target traverses: the sheet shows the target
 *   object. BACK returns to the previous graph position.
 * - Scroll position is preserved across open/traverse/back/close; the
 *   page is never destroyed and there are no dead-end pages.
 * - Ask FYD in the sheet posts { siteId, question, objectId } to
 *   /api/fyd/ask: the answer context is the current object + authorized
 *   neighborhood + bound evidence (the same edges the sheet shows).
 * - [Why this?] serves edge/object provenance via /api/fyd/why-this; it
 *   is the trust path, not the primary workflow.
 * - No hover-only paths. Touch targets are >= 44px. aria-expanded /
 *   role=dialog / aria-live announce state to screen readers.
 * - Resize/rotate never destroys sheet state (state lives in JS, not in
 *   layout).
 *
 * The script never invents objects: every edge item comes from
 * GET /api/fyd/edge/object, which serves only viewer-authorized graph
 * state. The opener is also published as window.__fydEdgeOpen so the
 * site client can route /o/ link taps into the same sheet.
 */

export function edgeClientScript(siteSlug: string): string {
  return (
    "(function () {\n" +
    "  var SITE = " +
    JSON.stringify(siteSlug) +
    ";\n" +
    "  var ATTENTION = 8;\n" +
    '  var EDGE_ENDPOINT = "/api/fyd/edge/object";\n' +
    '  var WHY_ENDPOINT = "/api/fyd/why-this";\n' +
    '  var ASK_ENDPOINT = "/api/fyd/ask";\n' +
    "\n" +
    "  function esc(s) {\n" +
    '    return String(s == null ? "" : s)\n' +
    '      .replace(/&/g, "&amp;")\n' +
    '      .replace(/</g, "&lt;")\n' +
    '      .replace(/>/g, "&gt;")\n' +
    '      .replace(/"/g, "&quot;");\n' +
    "  }\n" +
    "\n" +
    "  // ---- sheet chrome (built once, lazily) ----\n" +
    "  var overlay = null, sheet = null, sheetScroll = null, sheetMain = null, live = null;\n" +
    "  var stack = [];\n" +
    "  var current = null;\n" +
    "  var triggerEl = null;\n" +
    "  var savedScrollY = 0;\n" +
    "  var fullNode = false;\n" +
    "  var revealed = {};\n" +
    "\n" +
    "  function ensureChrome() {\n" +
    "    if (sheet) return;\n" +
    '    live = document.createElement("div");\n' +
    '    live.id = "fyd-edge-live";\n' +
    '    live.className = "fyd-sr-only";\n' +
    '    live.setAttribute("aria-live", "polite");\n' +
    "    document.body.appendChild(live);\n" +
    '    overlay = document.createElement("div");\n' +
    '    overlay.className = "fyd-edge-overlay";\n' +
    "    overlay.hidden = true;\n" +
    "    document.body.appendChild(overlay);\n" +
    '    sheet = document.createElement("section");\n' +
    '    sheet.id = "fyd-edge-sheet";\n' +
    '    sheet.className = "fyd-edge-sheet";\n' +
    '    sheet.setAttribute("role", "dialog");\n' +
    '    sheet.setAttribute("aria-modal", "false");\n' +
    '    sheet.setAttribute("aria-label", "Object details");\n' +
    "    sheet.hidden = true;\n" +
    "    sheet.innerHTML =\n" +
    '      "<div class=\\"fyd-edge-grab\\" aria-hidden=\\"true\\"></div>" +\n' +
    '      "<div class=\\"fyd-edge-head\\">" +\n' +
    '      "<div class=\\"fyd-edge-backrow\\">" +\n' +
    '      "<button type=\\"button\\" class=\\"fyd-edge-back\\" data-edge-nav=\\"back\\" hidden>Back</button>" +\n' +
    '      "<span class=\\"fyd-edge-crumb\\" aria-hidden=\\"true\\"></span>" +\n' +
    '      "<button type=\\"button\\" class=\\"fyd-edge-close\\" data-edge-nav=\\"close\\" aria-label=\\"Close object details\\">Close</button>" +\n' +
    '      "</div>" +\n' +
    '      "<div class=\\"fyd-edge-titlewrap\\"><h2 class=\\"fyd-edge-title\\" tabindex=\\"-1\\"></h2>" +\n' +
    '      "<p class=\\"fyd-edge-type\\"></p></div>" +\n' +
    '      "</div>" +\n' +
    '      "<div class=\\"fyd-edge-scroll\\"><div class=\\"fyd-edge-main\\"></div></div>";\n' +
    "    document.body.appendChild(sheet);\n" +
    '    sheetScroll = sheet.querySelector(".fyd-edge-scroll");\n' +
    '    sheetMain = sheet.querySelector(".fyd-edge-main");\n' +
    '    overlay.addEventListener("click", closeSheet);\n' +
    '    sheet.addEventListener("click", onSheetClick);\n' +
    '    sheet.addEventListener("submit", onSheetSubmit);\n' +
    '    document.addEventListener("keydown", function (e) {\n' +
    '      if (e.key === "Escape" && sheet && !sheet.hidden) { closeSheet(); }\n' +
    "    });\n" +
    "  }\n" +
    "\n" +
    "  function announce(msg) {\n" +
    "    if (live) live.textContent = msg;\n" +
    "  }\n" +
    "\n" +
    "  function claimBadge(cc) {\n" +
    '    var labels = { DIRECT_FACT: "Website statement", DERIVED_FACT: "Derived", OWNER_AUTHORED: "Owner", GENERATED_COPY: "FYD copy" };\n' +
    '    var cls = { DIRECT_FACT: "cc-direct", DERIVED_FACT: "cc-derived", OWNER_AUTHORED: "cc-owner", GENERATED_COPY: "cc-generated" };\n' +
    '    return "<span class=\\"fyd-claim fyd-claim-" + (cls[cc] || "cc-derived") + "\\" title=\\"Claim class: " + esc(cc) + "\\">" + esc(labels[cc] || cc) + "</span>";\n' +
    "  }\n" +
    "\n" +
    "  function kindTag(kind) {\n" +
    '    var map = { service_edge: "Service", location_edge: "Location", person_edge: "Person", business_edge: "Business", external_identity_edge: "Link", reference_edge: "Reference", generic_edge: "Related" };\n' +
    '    return "<span class=\\"fyd-edge-tag fyd-kind-" + esc(kind) + "\\">" + esc(map[kind] || "Related") + "</span>";\n' +
    "  }\n" +
    "\n" +
    "  function actionHtml(a) {\n" +
    '    if (a.kind === "open_website" && a.href) {\n' +
    '      return "<a class=\\"fyd-edge-action\\" href=\\"" + esc(a.href) + "\\" target=\\"_blank\\" rel=\\"noopener\\">" + esc(a.label) + "</a>";\n' +
    "    }\n" +
    '    return "<button type=\\"button\\" class=\\"fyd-edge-action\\" data-edge-act=\\"" + esc(a.kind) + "\\">" + esc(a.label) + "</button>";\n' +
    "  }\n" +
    "\n" +
    "  function groupHtml(g, data) {\n" +
    "    var shown = revealed[g.predicate] || ATTENTION;\n" +
    "    var items = g.items.slice(0, shown);\n" +
    '    var html = "<section class=\\"fyd-edge-group\\" data-edge-group=\\"" + esc(g.predicate) + "\\">";\n' +
    '    html += "<div class=\\"fyd-edge-grouphead\\"><h3>" + esc(g.label) + " <span class=\\"fyd-edge-count\\">" + g.totalCount + "</span></h3>";\n' +
    '    html += "<button type=\\"button\\" class=\\"fyd-edge-why-g\\" data-edge-why-group=\\"" + esc(g.predicate) + "\\" aria-expanded=\\"false\\">Why these?</button></div>";\n' +
    '    html += "<div class=\\"fyd-edge-why-panel\\" hidden></div>";\n' +
    '    html += "<ul class=\\"fyd-edge-items\\">";\n' +
    "    for (var i = 0; i < items.length; i++) {\n" +
    "      var it = items[i];\n" +
    '      html += "<li><button type=\\"button\\" class=\\"fyd-edge-item\\" data-edge-target=\\"" + esc(it.targetObjectId) + "\\" aria-label=\\"" + esc(it.targetTitle) + ", " + esc(it.targetTypeLabel) + ". Open details.\\">";\n' +
    '      html += kindTag(it.kind) + "<span class=\\"fyd-edge-item-title\\">" + esc(it.targetTitle) + "</span>";\n' +
    '      html += "<span class=\\"fyd-edge-item-go\\" aria-hidden=\\"true\\">&rsaquo;</span></button></li>";\n' +
    "    }\n" +
    '    html += "</ul>";\n' +
    "    if (g.totalCount > shown) {\n" +
    '      html += "<button type=\\"button\\" class=\\"fyd-edge-more\\" data-edge-more=\\"" + esc(g.predicate) + "\\" aria-expanded=\\"false\\">Show " + Math.min(ATTENTION, g.totalCount - shown) + " more</button>";\n' +
    "    }\n" +
    '    html += "</section>";\n' +
    "    return html;\n" +
    "  }\n" +
    "\n" +
    "  function renderSheet(data) {\n" +
    "    ensureChrome();\n" +
    '    var titleEl = sheet.querySelector(".fyd-edge-title");\n' +
    '    var typeEl = sheet.querySelector(".fyd-edge-type");\n' +
    "    titleEl.textContent = data.title;\n" +
    '    typeEl.innerHTML = esc(data.typeLabel) + " " + claimBadge(data.summaryClaimClass);\n' +
    '    sheet.setAttribute("aria-label", data.title + " object details");\n' +
    '    var html = "<p class=\\"fyd-edge-summary\\">" + esc(data.summary) + "</p>";\n' +
    '    html += "<p class=\\"fyd-edge-prov\\">Source: " + esc(data.provenanceRef) + "</p>";\n' +
    "\n" +
    "    if (fullNode) {\n" +
    '      html += "<section class=\\"fyd-edge-claims\\"><h3>Details</h3><dl>";\n' +
    "      for (var c = 0; c < data.claims.length; c++) {\n" +
    "        var cl = data.claims[c];\n" +
    '        html += "<div class=\\"fyd-edge-claimrow\\"><dt>" + esc(cl.label) + " " + claimBadge(cl.claimClass) + "</dt><dd>" + esc(cl.value) + "</dd></div>";\n' +
    "      }\n" +
    '      html += "</dl></section>";\n' +
    "      if (data.evidence && data.evidence.length) {\n" +
    '        html += "<section class=\\"fyd-edge-evidence\\"><h3>Evidence</h3><ul>";\n' +
    "        for (var e = 0; e < data.evidence.length; e++) {\n" +
    "          var ev = data.evidence[e];\n" +
    '          html += "<li><code>" + esc(ev.ref) + "</code><br><span>" + esc(ev.source) + " &middot; observed " + esc(ev.observedAt) + "</span></li>";\n' +
    "        }\n" +
    '        html += "</ul></section>";\n' +
    "      }\n" +
    "    }\n" +
    "\n" +
    '    html += "<div class=\\"fyd-edge-actions\\">";\n' +
    "    for (var a = 0; a < data.actions.length; a++) { html += actionHtml(data.actions[a]); }\n" +
    '    html += "</div>";\n' +
    '    html += "<div class=\\"fyd-edge-askpanel\\" hidden>" +\n' +
    '      "<p class=\\"fyd-edge-askctx\\">Asking about <strong></strong></p>" +\n' +
    '      "<form class=\\"fyd-edge-askform\\"><label class=\\"fyd-sr-only\\" for=\\"fyd-edge-askq\\">Ask FYD</label>" +\n' +
    '      "<input id=\\"fyd-edge-askq\\" name=\\"q\\" type=\\"text\\" placeholder=\\"Ask about this\\" autocomplete=\\"off\\">" +\n' +
    '      "<button type=\\"submit\\">Ask</button></form>" +\n' +
    '      "<div class=\\"fyd-edge-askresult\\" aria-live=\\"polite\\"></div></div>";\n' +
    '    html += "<div class=\\"fyd-edge-whypanel\\" hidden></div>";\n' +
    "\n" +
    "    if (!data.edgeGroups || !data.edgeGroups.length) {\n" +
    '      html += "<p class=\\"fyd-edge-empty\\">No related objects recorded for this entry.</p>";\n' +
    "    } else {\n" +
    "      for (var gi = 0; gi < data.edgeGroups.length; gi++) { html += groupHtml(data.edgeGroups[gi], data); }\n" +
    "    }\n" +
    "    sheetMain.innerHTML = html;\n" +
    '    var askCtx = sheetMain.querySelector(".fyd-edge-askctx strong");\n' +
    "    if (askCtx) askCtx.textContent = data.title;\n" +
    '    var askBtn = sheetMain.querySelector(\'[data-edge-act="ask"]\');\n' +
    '    if (askBtn && !askBtn.hasAttribute("aria-expanded")) askBtn.setAttribute("aria-expanded", "false");\n' +
    '    var backBtn = sheet.querySelector(".fyd-edge-back");\n' +
    "    if (backBtn) backBtn.hidden = stack.length === 0;\n" +
    '    var crumb = sheet.querySelector(".fyd-edge-crumb");\n' +
    '    if (crumb) crumb.textContent = stack.length > 0 ? (stack.length + " deep") : "";\n' +
    "  }\n" +
    "\n" +
    "  function showSheet() {\n" +
    "    ensureChrome();\n" +
    "    savedScrollY = window.scrollY || window.pageYOffset || 0;\n" +
    '    document.body.classList.add("fyd-edge-lock");\n' +
    "    overlay.hidden = false;\n" +
    "    sheet.hidden = false;\n" +
    "    if (sheetScroll) sheetScroll.scrollTop = 0;\n" +
    '    var closeBtn = sheet.querySelector(".fyd-edge-close");\n' +
    "    if (closeBtn) closeBtn.focus();\n" +
    "  }\n" +
    "\n" +
    "  function hideSheet(restoreFocus) {\n" +
    '    if (triggerEl && triggerEl.setAttribute) triggerEl.setAttribute("aria-expanded", "false");\n' +
    "    if (!sheet || sheet.hidden) return;\n" +
    "    sheet.hidden = true;\n" +
    "    overlay.hidden = true;\n" +
    '    document.body.classList.remove("fyd-edge-lock");\n' +
    "    if (typeof savedScrollY === \"number\") window.scrollTo(0, savedScrollY);\n" +
    "    if (restoreFocus !== false && triggerEl && document.contains(triggerEl)) triggerEl.focus();\n" +
    "    current = null;\n" +
    "    stack = [];\n" +
    "    fullNode = false;\n" +
    "  }\n" +
    "\n" +
    "  function openObject(objectId, trigger) {\n" +
    "    ensureChrome();\n" +
    '    if (triggerEl && triggerEl !== trigger && triggerEl.setAttribute) triggerEl.setAttribute("aria-expanded", "false");\n' +
    "    if (trigger) triggerEl = trigger;\n" +
    '    if (triggerEl && triggerEl.setAttribute) triggerEl.setAttribute("aria-expanded", "true");\n' +
    '    var url = EDGE_ENDPOINT + "?site=" + encodeURIComponent(SITE) +\n' +
    '      "&objectId=" + encodeURIComponent(objectId);\n' +
    '    announce("Loading details.");\n' +
    "    fetch(url).then(function (r) {\n" +
    '      if (!r.ok) throw new Error("not found");\n' +
    "      return r.json();\n" +
    "    }).then(function (data) {\n" +
    "      current = { objectId: objectId, data: data };\n" +
    "      revealed = {};\n" +
    "      renderSheet(data);\n" +
    "      showSheet();\n" +
    '      announce("Opened " + data.title + ". " + data.edgeGroups.length + " relationship groups.");\n' +
    "    }).catch(function () {\n" +
    '      announce("That entry is not available.");\n' +
    "    });\n" +
    "  }\n" +
    "\n" +
    "  // Published so the site client can route /o/ link taps into the same\n" +
    "  // sheet instead of a second, competing overlay.\n" +
    '  window.__fydEdgeOpen = openObject;\n' +
    "\n" +
    "  function traverse(targetId) {\n" +
    "    if (!current) return;\n" +
    "    stack.push({ objectId: current.objectId, data: current.data, scrollY: savedScrollY });\n" +
    "    fullNode = false;\n" +
    "    openObject(targetId, null);\n" +
    "  }\n" +
    "\n" +
    "  function goBack() {\n" +
    "    var prev = stack.pop();\n" +
    "    if (!prev) { closeSheet(); return; }\n" +
    "    ensureChrome();\n" +
    "    fullNode = false;\n" +
    "    revealed = {};\n" +
    "    current = { objectId: prev.objectId, data: prev.data };\n" +
    "    renderSheet(prev.data);\n" +
    "    savedScrollY = prev.scrollY;\n" +
    '    document.body.classList.add("fyd-edge-lock");\n' +
    "    overlay.hidden = false;\n" +
    "    sheet.hidden = false;\n" +
    "    if (sheetScroll) sheetScroll.scrollTop = 0;\n" +
    '    announce("Back to " + prev.data.title + ".");\n' +
    "  }\n" +
    "\n" +
    "  function closeSheet() { hideSheet(true); }\n" +
    "\n" +
    "  function toggleAsk(btn) {\n" +
    '    var panel = sheetMain.querySelector(".fyd-edge-askpanel");\n' +
    "    if (!panel) return;\n" +
    "    panel.hidden = !panel.hidden;\n" +
    '    if (btn) btn.setAttribute("aria-expanded", panel.hidden ? "false" : "true");\n' +
    "    if (!panel.hidden) {\n" +
    '      var input = panel.querySelector("input");\n' +
    "      if (input) input.focus();\n" +
    "    }\n" +
    "  }\n" +
    "\n" +
    "  function toggleWhyObject() {\n" +
    '    var panel = sheetMain.querySelector(".fyd-edge-whypanel");\n' +
    "    if (!panel || !current) return;\n" +
    "    if (!panel.hidden) { panel.hidden = true; return; }\n" +
    "    panel.hidden = false;\n" +
    '    panel.innerHTML = "<p>Checking the evidence...</p>";\n' +
    '    var url = WHY_ENDPOINT + "?siteId=" + encodeURIComponent(SITE) +\n' +
    '      "&objectId=" + encodeURIComponent(current.objectId);\n' +
    "    fetch(url).then(function (r) { return r.json(); }).then(function (w) {\n" +
    '      if (!w.found) { panel.innerHTML = "<p class=\\"fyd-fail\\">" + esc(w.reason) + "</p>"; return; }\n' +
    '      panel.innerHTML = "<dl class=\\"fyd-why-dl\\">" +\n' +
    '        "<dt>Source</dt><dd>" + esc(w.source) + "</dd>" +\n' +
    '        "<dt>Observed value</dt><dd>" + esc(w.observedValue) + "</dd>" +\n' +
    '        "<dt>Observation time</dt><dd>" + esc(w.observationTime) + "</dd>" +\n' +
    '        "<dt>Extraction method</dt><dd>" + esc(w.extractionMethod) + "</dd></dl>";\n' +
    "    }).catch(function () { panel.innerHTML = \"<p class=\\\"fyd-fail\\\">Could not load evidence.</p>\"; });\n" +
    "  }\n" +
    "\n" +
    "  function toggleWhyGroup(btn) {\n" +
    '    var section = btn.closest(".fyd-edge-group");\n' +
    "    if (!section || !current) return;\n" +
    '    var panel = section.querySelector(".fyd-edge-why-panel");\n' +
    "    if (!panel) return;\n" +
    "    var open = panel.hidden;\n" +
    '    btn.setAttribute("aria-expanded", open ? "true" : "false");\n' +
    "    if (!open) { panel.hidden = true; return; }\n" +
    "    panel.hidden = false;\n" +
    '    var predicate = btn.getAttribute("data-edge-why-group");\n' +
    "    var first = null;\n" +
    "    for (var gi = 0; gi < current.data.edgeGroups.length; gi++) {\n" +
    "      var g = current.data.edgeGroups[gi];\n" +
    "      if (g.predicate === predicate && g.items.length) { first = g.items[0]; break; }\n" +
    "    }\n" +
    '    if (!first) { panel.innerHTML = "<p class=\\"fyd-fail\\">No edge recorded.</p>"; return; }\n' +
    '    panel.innerHTML = "<p>Checking the evidence...</p>";\n' +
    '    var url = WHY_ENDPOINT + "?siteId=" + encodeURIComponent(SITE) +\n' +
    '      "&objectId=" + encodeURIComponent(first.targetObjectId) +\n' +
    '      "&field=" + encodeURIComponent(predicate);\n' +
    "    fetch(url).then(function (r) { return r.json(); }).then(function (w) {\n" +
    '      if (!w.found) { panel.innerHTML = "<p class=\\"fyd-fail\\">" + esc(w.reason) + "</p>"; return; }\n' +
    '      panel.innerHTML = "<dl class=\\"fyd-why-dl\\">" +\n' +
    '        "<dt>Source</dt><dd>" + esc(w.source) + "</dd>" +\n' +
    '        "<dt>Observed value</dt><dd>" + esc(w.observedValue) + "</dd>" +\n' +
    '        "<dt>Observation time</dt><dd>" + esc(w.observationTime) + "</dd>" +\n' +
    '        "<dt>Extraction method</dt><dd>" + esc(w.extractionMethod) + "</dd></dl>";\n' +
    "    }).catch(function () { panel.innerHTML = \"<p class=\\\"fyd-fail\\\">Could not load evidence.</p>\"; });\n" +
    "  }\n" +
    "\n" +
    "  function onSheetClick(e) {\n" +
    '    var nav = e.target.closest("[data-edge-nav]");\n' +
    '    if (nav) { if (nav.getAttribute("data-edge-nav") === "back") goBack(); else closeSheet(); return; }\n' +
    '    var more = e.target.closest("[data-edge-more]");\n' +
    "    if (more) {\n" +
    '      var pred = more.getAttribute("data-edge-more");\n' +
    "      revealed[pred] = (revealed[pred] || ATTENTION) + ATTENTION;\n" +
    '      var expanded = more.getAttribute("aria-expanded") === "true";\n' +
    '      more.setAttribute("aria-expanded", expanded ? "false" : "true");\n' +
    "      if (current) renderSheet(current.data);\n" +
    "      return;\n" +
    "    }\n" +
    '    var whyG = e.target.closest("[data-edge-why-group]");\n' +
    "    if (whyG) { toggleWhyGroup(whyG); return; }\n" +
    '    var act = e.target.closest("[data-edge-act]");\n' +
    "    if (act) {\n" +
    '      var kind = act.getAttribute("data-edge-act");\n' +
    '      if (kind === "ask") { toggleAsk(act); return; }\n' +
    '      if (kind === "why_this") { toggleWhyObject(); return; }\n' +
    '      if (kind === "open_full_node") {\n' +
    "        fullNode = !fullNode;\n" +
    '        var fnBtn = sheetMain.querySelector(\'[data-edge-act="open_full_node"]\');\n' +
    '        if (fnBtn) fnBtn.textContent = fullNode ? "Compact view" : "Open full node";\n' +
    "        if (current) renderSheet(current.data);\n" +
    "        return;\n" +
    "      }\n" +
    '      if (kind === "reference") {\n' +
    '        var text = "FYD object " + current.objectId + " (" + current.data.title + ")";\n' +
    '        announce("Reference copied.");\n' +
    "        if (navigator.clipboard && navigator.clipboard.writeText) {\n" +
    "          navigator.clipboard.writeText(text).catch(function () {});\n" +
    "        }\n" +
    "        return;\n" +
    "      }\n" +
    "      return;\n" +
    "    }\n" +
    '    var tgt = e.target.closest("[data-edge-target]");\n' +
    '    if (tgt) { traverse(tgt.getAttribute("data-edge-target")); return; }\n' +
    "  }\n" +
    "\n" +
    "  function onSheetSubmit(e) {\n" +
    '    var form = e.target.closest(".fyd-edge-askform");\n' +
    "    if (!form || !current) return;\n" +
    "    e.preventDefault();\n" +
    '    var input = form.querySelector("input");\n' +
    '    var result = sheetMain.querySelector(".fyd-edge-askresult");\n' +
    "    var q = input.value.trim();\n" +
    "    if (!q || !result) return;\n" +
    '    result.innerHTML = "<p>Asking FYD...</p>";\n' +
    "    fetch(ASK_ENDPOINT, {\n" +
    '      method: "POST",\n' +
    '      headers: { "content-type": "application/json" },\n' +
    "      body: JSON.stringify({ siteId: SITE, question: q, objectId: current.objectId }),\n" +
    "    }).then(function (r) { return r.json(); }).then(function (a) {\n" +
    '      var html = "<p><strong>Answer:</strong> " + esc(a.answer) + "</p>";\n' +
    "      if (a.citations && a.citations.length) {\n" +
    '        html += "<p class=\\"fyd-edge-evh\\">Evidence</p><ul class=\\"fyd-evidence-list\\">";\n' +
    "        a.citations.forEach(function (c) {\n" +
    '          html += "<li>[" + c.n + "] " + esc(c.label) + " &middot; " + esc(c.basis) + "</li>";\n' +
    "        });\n" +
    '        html += "</ul>";\n' +
    "      }\n" +
    "      if (a.unknowns && a.unknowns.length) {\n" +
    '        html += "<p class=\\"fyd-unknowns\\"><strong>Not established by the evidence:</strong> " + a.unknowns.map(esc).join("; ") + "</p>";\n' +
    "      }\n" +
    '      if (a.refusal) html += "<p><em>FYD could not answer that.</em></p>";\n' +
    "      result.innerHTML = html;\n" +
    "    }).catch(function () { result.innerHTML = \"<p class=\\\"fyd-fail\\\">Something went wrong asking FYD.</p>\"; });\n" +
    "  }\n" +
    "\n" +
    "  // ---- tap-to-expand: every rendered object binding is a doorway ----\n" +
    "  document.addEventListener(\"click\", function (e) {\n" +
    '    if (sheet && !sheet.hidden && e.target.closest("#fyd-edge-sheet")) return;\n' +
    '    if (e.target.closest(".why-this-btn")) return;\n' +
    '    if (e.target.closest(".why-this-panel")) return;\n' +
    '    if (e.target.closest("a, button")) return;\n' +
    '    var binding = e.target.closest("[data-fyd-object-id]");\n' +
    "    if (!binding) return;\n" +
    '    var id = binding.getAttribute("data-fyd-object-id");\n' +
    "    if (!id) return;\n" +
    "    e.preventDefault();\n" +
    "    openObject(id, binding);\n" +
    "  });\n" +
    "\n" +
    "  // ---- keyboard: cards and circles open with Enter/Space ----\n" +
    "  document.addEventListener(\"keydown\", function (e) {\n" +
    '    if (e.key !== "Enter" && e.key !== " ") return;\n' +
    "    var t = e.target;\n" +
    "    if (!t || !t.getAttribute) return;\n" +
    '    if (!t.hasAttribute("data-fyd-object-id")) return;\n' +
    '    if (e.target.closest(".why-this-btn")) return;\n' +
    "    e.preventDefault();\n" +
    '    openObject(t.getAttribute("data-fyd-object-id"), t);\n' +
    "  });\n" +
    "\n" +
    "  // ---- mark bindings operable (no visual change) ----\n" +
    "  function markBindings() {\n" +
    '    document.querySelectorAll("[data-fyd-object-id]").forEach(function (el) {\n' +
    '      el.setAttribute("aria-expanded", el.getAttribute("aria-expanded") || "false");\n' +
    '      if (el.hasAttribute("tabindex")) return;\n' +
    "      el.setAttribute(\"tabindex\", \"0\");\n" +
    '      el.setAttribute("role", "button");\n' +
    '      el.setAttribute("aria-label", (el.querySelector("h3") || {}).textContent || el.textContent || "object");\n' +
    "    });\n" +
    "  }\n" +
    "  if (document.readyState === \"loading\") {\n" +
    '    document.addEventListener("DOMContentLoaded", markBindings);\n' +
    "  } else {\n" +
    "    markBindings();\n" +
    "  }\n" +
    "})();\n"
  );
}
