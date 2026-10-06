/* ARRT browser runtime — hydrates the prerendered page with the page logic class. */
(function () {
  var E = window.ARRTEngine;
  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (p, cb) {
    var next = typeof p === "function" ? p(this.state, this.props) : p;
    this.state = Object.assign({}, this.state, next);
    schedule(this); if (cb) setTimeout(cb, 0);
  };
  DCLogic.prototype.forceUpdate = function () { schedule(this); };
  window.DCLogic = DCLogic;
  var pending = null;
  // rAF is paused in background tabs, so a timer fallback guarantees the repaint still lands.
  function schedule(inst) {
    if (pending) return; pending = true;
    var run = function () { if (!pending) return; pending = null; paint(inst); };
    requestAnimationFrame(run); setTimeout(run, 80);
  }
  var root, tpl, hoverEl, inst, lastProps, slotHtml = null, initLang = null, initPath = location.pathname;
  function paint(i) {
    var vals = i.renderVals();
    var r = E.render(tpl, vals);
    var y = window.scrollY;
    root.innerHTML = r.html;
    hoverEl.textContent = r.css;
    // Static SEO content (prerendered per page + language) survives every repaint.
    if (slotHtml !== null) { var sl = root.querySelector("#arrt-slot"); if (sl) sl.innerHTML = slotHtml; }
    // Language switch rewrites the URL to the other-language page: load it so all static content matches.
    if (initLang && i.state && i.state.lang && i.state.lang !== initLang && location.pathname !== initPath) { location.reload(); return; }
    sync(root);
    bind(root, r.fns);
    if (i.componentDidUpdate) { try { i.componentDidUpdate(lastProps || i.props, {}); } catch (e) { console.warn(e); } }
    lastProps = i.props;
    if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
  }
  // HTML attributes don't drive live form state after innerHTML: push value/checked/disabled into the DOM properties.
  function sync(el) {
    el.querySelectorAll("select[value]").forEach(function (s) { var v = s.getAttribute("value"); s.value = v; if (s.value !== v) s.selectedIndex = 0; });
    el.querySelectorAll("input[value]").forEach(function (n) { if (n.type !== "checkbox" && n.type !== "radio") n.value = n.getAttribute("value"); });
    el.querySelectorAll("input[checked]").forEach(function (n) { var v = n.getAttribute("checked"); n.checked = !(v === "" || v === "false"); });
    el.querySelectorAll("[disabled]").forEach(function (n) { var v = n.getAttribute("disabled"); if (v === "" || v === "false") n.removeAttribute("disabled"); else n.disabled = true; });
  }
  function bind(el, fns) {
    ["click", "change", "submit", "input"].forEach(function (ev) {
      el.querySelectorAll("[data-on-" + ev + "]").forEach(function (node) {
        var f = fns[+node.getAttribute("data-on-" + ev)];
        if (f) node.addEventListener(ev, function (e) { if (ev === "submit") e.preventDefault(); f(e); });
      });
    });
  }
  function boot() {
    root = document.getElementById("arrt-app");
    var P = window.ARRT_PAGE || {};
    var t = document.getElementById("arrt-tpl");
    var logicEl = document.getElementById("arrt-logic");
    var logicSrc = P.logic || (logicEl && logicEl.textContent);
    if (!root || !(P.tpl || t) || !logicSrc) return;
    if (P.tpl) tpl = P.tpl; else { try { tpl = JSON.parse(t.textContent); } catch (e) { tpl = t.textContent; } }
    var sl0 = root.querySelector("#arrt-slot"); if (sl0) slotHtml = sl0.innerHTML;
    // Structured data is final at build time: page logic must not overwrite or duplicate it.
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (el) { var v = el.textContent; try { Object.defineProperty(el, "textContent", { get: function () { return v; }, set: function () {} }); } catch (e) {} });
    var hApp = document.head.appendChild.bind(document.head);
    document.head.appendChild = function (n) { if (n && n.tagName === "SCRIPT" && (n.type === "application/ld+json" || (n.getAttribute && n.getAttribute("type") === "application/ld+json"))) return n; return hApp(n); };
    hoverEl = document.getElementById("arrt-hover");
    var props = {};
    try { props = JSON.parse(root.getAttribute("data-props") || "{}"); } catch (e) {}
    initLang = props.lang || null;
    var Component;
    try { Component = new Function("DCLogic", logicSrc + "\nreturn Component;")(DCLogic); }
    catch (e) { console.error("ARRT logic failed", e); return; }
    inst = new Component(props);
    if (inst.state === undefined) inst.state = {};
    lastProps = props;
    window.__arrt = inst;
    if (inst.componentDidMount) { try { inst.componentDidMount(); } catch (e) { console.warn(e); } }
    paint(inst);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
