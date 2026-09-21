/* FydCircle: v0 one-snippet integration boundary for FYD Circles.
 * <div id="c"></div>
 * <script src="https://site.example/fyd-circle-loader.js"></script>
 * <script>FydCircle.mount(document.getElementById("c"),{objectId:"happy-place-carpentry",apiBase:"https://site.example"});</script>
 * Renders a collapsed 48px circle; hover/focus shows the name; click opens the
 * object's website in a new tab. Fails closed: fetch error renders a neutral
 * circle with a dot, never fake data. Full interactive Circle is the React
 * component. */
(function () {
  "use strict";
  var S = "width:48px;height:48px;border-radius:50%;border:0;padding:0;display:inline-block;position:relative;";
  function dot(b) {
    var d = document.createElement("span");
    d.setAttribute("aria-hidden", "true");
    d.style.cssText = "position:absolute;top:50%;left:50%;width:8px;height:8px;margin:-4px;border-radius:50%;background:#6b655a;";
    b.appendChild(d);
  }
  function closed(el) {
    el.innerHTML = "";
    var b = document.createElement("span");
    b.style.cssText = S + "background:#c9c2b4;";
    b.setAttribute("role", "img");
    b.setAttribute("aria-label", "Circle unavailable");
    dot(b);
    el.appendChild(b);
  }
  function render(el, p) {
    var bg = p.background || {}, href = null, c = p.capabilities || [], i;
    for (i = 0; i < c.length; i++) {
      if (c[i] && c[i].kind === "website" && c[i].href) { href = c[i].href; break; }
    }
    el.innerHTML = "";
    var b = document.createElement("button");
    b.type = "button";
    b.style.cssText = S + "cursor:pointer;" +
      (bg.kind === "image" && bg.src ? "background:url(" + encodeURI(bg.src) + ") center/cover" :
       bg.kind === "css" && bg.css ? "background:" + bg.css :
       "background:linear-gradient(135deg,#7c6f5a,#4a4438)");
    b.setAttribute("aria-label", p.name || "Business circle");
    var t = document.createElement("span");
    t.textContent = p.name || "";
    t.setAttribute("aria-hidden", "true");
    t.style.cssText = "position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);white-space:nowrap;background:#1c1a16;color:#fff;font:12px/1.4 system-ui,sans-serif;padding:4px 8px;border-radius:6px;opacity:0;pointer-events:none;";
    b.appendChild(t);
    function show(v) { return function () { t.style.opacity = v; }; }
    b.onmouseenter = show("1"); b.onmouseleave = show("0");
    b.onfocus = show("1"); b.onblur = show("0");
    b.onclick = function () { if (href) window.open(href, "_blank", "noopener"); };
    el.appendChild(b);
  }
  function mount(el, o) {
    o = o || {};
    if (!el || !o.objectId || !o.apiBase) { if (el) closed(el); return; }
    fetch(String(o.apiBase).replace(/\/+$/, "") + "/api/fyd/circle?id=" + encodeURIComponent(o.objectId))
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (x) {
        if (!x || x.ok !== true || !x.projection) throw 0;
        render(el, x.projection);
      })
      .catch(function () { closed(el); });
  }
  window.FydCircle = { mount: mount };
})();
