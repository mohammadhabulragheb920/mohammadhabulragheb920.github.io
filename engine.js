/* ARRT template engine — shared by the Node build (prerender) and the browser runtime.
   Supports: {{ dotted.path }}, <sc-for list="{{ x }}" as="v">, <sc-if value="{{ x }}"> … <sc-else> …, style-hover, onClick/onChange/onSubmit. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(); else root.ARRTEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function esc(v) {
    if (v === null || v === undefined || v === false) return "";
    return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function resolve(path, scopes) {
    const parts = path.trim().split(".");
    for (let i = scopes.length - 1; i >= 0; i--) {
      const s = scopes[i];
      if (s && Object.prototype.hasOwnProperty.call(s, parts[0])) {
        let v = s[parts[0]];
        for (let k = 1; k < parts.length; k++) { if (v == null) return undefined; v = v[parts[k]]; }
        return v;
      }
    }
    return undefined;
  }
  function findClose(src, from, open, close) {
    let depth = 1, i = from;
    const re = new RegExp("<" + open + "\\b|</" + close + ">", "g");
    re.lastIndex = from;
    let m;
    while ((m = re.exec(src))) {
      if (m[0][1] === "/") { depth--; if (depth === 0) return { start: m.index, end: m.index + m[0].length }; }
      else depth++;
    }
    return null;
  }
  function render(tpl, vals) {
    const fns = [], hover = new Map();
    function interp(text, scopes) {
      text = text.replace(/\son(Click|Change|Submit|Input)="\{\{\s*([\w.]+)\s*\}\}"/gi, function (_, ev, path) {
        const f = resolve(path, scopes);
        if (typeof f !== "function") return "";
        fns.push(f);
        return ' data-on-' + ev.toLowerCase() + '="' + (fns.length - 1) + '"';
      });
      text = text.replace(/\sstyle-hover="([^"]*)"/g, function (_, css) {
        let id = hover.get(css);
        if (id === undefined) { id = "hv" + hover.size; hover.set(css, id); }
        return ' data-hv="' + id + '"';
      });
      text = text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (_, path) {
        const v = resolve(path, scopes);
        return typeof v === "function" ? "" : esc(v);
      });
      // merge data-hv into class
      text = text.replace(/<([a-zA-Z][\w-]*)([^>]*?)\sdata-hv="(hv\d+)"([^>]*)>/g, function (_, tag, a, id, b) {
        const attrs = a + b;
        if (/\sclass="/.test(attrs)) return "<" + tag + attrs.replace(/\sclass="/, ' class="' + id + " ") + ">";
        return "<" + tag + ' class="' + id + '"' + attrs + ">";
      });
      return text;
    }
    function walk(src, scopes) {
      let out = "", pos = 0;
      const re = /<sc-(for|if)\b([^>]*)>/g;
      let m;
      while ((m = re.exec(src))) {
        out += interp(src.slice(pos, m.index), scopes);
        const kind = m[1], attrs = m[2];
        const innerStart = m.index + m[0].length;
        const close = findClose(src, innerStart, "sc-" + kind, "sc-" + kind);
        if (!close) { pos = innerStart; break; }
        const inner = src.slice(innerStart, close.start);
        if (kind === "for") {
          const lm = /list="\{\{\s*([\w.]+)\s*\}\}"/.exec(attrs), am = /\sas="(\w+)"/.exec(attrs);
          const list = lm ? resolve(lm[1], scopes) : null, as = am ? am[1] : "item";
          if (Array.isArray(list)) list.forEach(function (it, i) { const sc = {}; sc[as] = it; sc[as + "Index"] = i; out += walk(inner, scopes.concat([sc])); });
        } else {
          const vm = /value="\{\{\s*([\w.]+)\s*\}\}"/.exec(attrs);
          const val = vm ? resolve(vm[1], scopes) : false;
          // split on top-level <sc-else>
          let elseIdx = -1, depth = 0; const tre = /<sc-if\b|<\/sc-if>|<sc-else\s*\/?>/g; let t;
          while ((t = tre.exec(inner))) { if (t[0] === "<sc-if" || t[0].startsWith("<sc-if")) depth++; else if (t[0] === "</sc-if>") depth--; else if (depth === 0) { elseIdx = t.index; var elseLen = t[0].length; break; } }
          const yes = elseIdx >= 0 ? inner.slice(0, elseIdx) : inner, no = elseIdx >= 0 ? inner.slice(elseIdx + elseLen) : "";
          out += walk(val ? yes : no, scopes);
        }
        pos = close.end; re.lastIndex = pos;
      }
      out += interp(src.slice(pos), scopes);
      return out;
    }
    const html = walk(tpl, [vals]);
    let css = "";
    // Hover rules must beat the element's inline style attribute, so every declaration gets !important.
    hover.forEach(function (id, rule) {
      var decl = rule.split(";").map(function (d) { return d.trim(); }).filter(Boolean)
        .map(function (d) { return /!important\s*$/.test(d) ? d : d + " !important"; }).join(";");
      css += "." + id + ":hover,." + id + ":focus-visible{" + decl + "}\n";
    });
    return { html: html, fns: fns, css: css };
  }
  return { render: render, esc: esc };
});
