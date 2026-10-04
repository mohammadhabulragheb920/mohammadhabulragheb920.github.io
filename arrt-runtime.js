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
  function schedule(inst) { if (pending) return; pending = true; requestAnimationFrame(function () { pending = null; paint(inst); }); }
  var root, tpl, hoverEl, inst, lastProps;
  function paint(i) {
    var vals = i.renderVals();
    var r = E.render(tpl, vals);
    var y = window.scrollY;
    root.innerHTML = r.html;
    hoverEl.textContent = r.css;
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
    var t = document.getElementById("arrt-tpl");
    var logic = document.getElementById("arrt-logic");
    if (!root || !t || !logic) return;
    try { tpl = JSON.parse(t.textContent); } catch (e) { tpl = t.textContent; }
    hoverEl = document.getElementById("arrt-hover");
    var props = {};
    try { props = JSON.parse(root.getAttribute("data-props") || "{}"); } catch (e) {}
    var Component;
    try { Component = new Function("DCLogic", logic.textContent + "\nreturn Component;")(DCLogic); }
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
