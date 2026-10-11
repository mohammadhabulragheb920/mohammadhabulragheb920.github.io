#!/usr/bin/env node
// Abu Al-Ragheb Tires — site quality gate.
// Zero dependencies: runs on any Node >= 18, locally or in GitHub Actions.
// Usage: node scripts/ci/check-site.mjs [siteRoot]
// Exit code 1 if any ERROR is found. WARNINGs are reported but do not fail the build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.argv[2] || '.');
const CONFIG = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'site-rules.json'), 'utf8'));
const ORIGIN = CONFIG.origin.replace(/\/$/, '');

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

// ---------- file inventory ----------
const IGNORE_DIRS = new Set(CONFIG.ignoreDirs);
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(ROOT);
const rel = (p) => '/' + path.relative(ROOT, p).split(path.sep).join('/');
const fileSet = new Set(files.map(rel));
const htmlFiles = files.filter((f) => f.endsWith('.html'));

// URL path -> does a file serve it? (GitHub Pages rules: exact, +.html, /index.html)
function resolves(urlPath) {
  let p = decodeURIComponent(urlPath.split('#')[0].split('?')[0]);
  if (!p.startsWith('/')) return true; // caller resolves relatives first
  if (p === '') p = '/';
  if (fileSet.has(p)) return true;
  if (p.endsWith('/')) return fileSet.has(p + 'index.html');
  return fileSet.has(p + '.html') || fileSet.has(p + '/index.html');
}
// file path -> its public URL
function publicUrl(file) {
  let r = rel(file);
  if (r.endsWith('/index.html')) r = r.slice(0, -'index.html'.length);
  else if (r.endsWith('.html')) r = r.slice(0, -'.html'.length);
  return ORIGIN + r;
}

// ---------- tiny HTML helpers (regex is fine for our own generated output) ----------
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
};
const tags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) || [];
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// ---------- checks ----------
const sitemapXml = fileSet.has('/sitemap.xml') ? fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8') : '';
const sitemapLocs = new Set([...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()));
const noindexPages = new Set();
const indexablePages = new Set();
const hreflangMap = new Map(); // url -> {lang: href}
const titles = new Map();

for (const file of htmlFiles) {
  const r = rel(file);
  const html = fs.readFileSync(file, 'utf8');
  const isTemplate = CONFIG.notPages.includes(r);
  const head = html.slice(0, Math.max(0, html.search(/<\/head>/i)));

  // size budget
  const kb = Buffer.byteLength(html) / 1024;
  if (kb > CONFIG.budgets.htmlKbError) err(r, `HTML is ${kb.toFixed(0)} KB (limit ${CONFIG.budgets.htmlKbError} KB)`);
  else if (kb > CONFIG.budgets.htmlKbWarn) warn(r, `HTML is ${kb.toFixed(0)} KB (aim < ${CONFIG.budgets.htmlKbWarn} KB)`);

  // document basics
  if (!/^\s*<!doctype html>/i.test(html)) err(r, 'missing <!doctype html>');
  const htmlTag = tags(html, 'html')[0] || '';
  const lang = attr(htmlTag, 'lang');
  if (!lang) err(r, '<html> has no lang attribute');
  const isAr = r === '/ar' || r.startsWith('/ar/');
  if (isAr && !/^ar/i.test(lang || '')) err(r, `page under /ar/ has lang="${lang}"`);
  if (isAr && attr(htmlTag, 'dir') !== 'rtl') err(r, 'Arabic page is missing dir="rtl"');
  if (!isAr && lang && /^ar/i.test(lang)) err(r, 'English path carries lang="ar"');

  const title = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '';
  if (!title) err(r, 'empty or missing <title>');

  const robotsMeta = tags(head, 'meta').find((t) => (attr(t, 'name') || '').toLowerCase() === 'robots');
  const noindex = robotsMeta && /noindex/i.test(attr(robotsMeta, 'content') || '');
  const url = publicUrl(file);

  if (isTemplate) continue;

  if (noindex) {
    noindexPages.add(url);
    if (sitemapLocs.has(url)) err(r, 'noindex page is listed in sitemap.xml');
  } else {
    indexablePages.add(url);
    if (title) {
      if (titles.has(title)) warn(r, `duplicate <title> also used by ${titles.get(title)}`);
      else titles.set(title, r);
    }
    const desc = tags(head, 'meta').find((t) => (attr(t, 'name') || '').toLowerCase() === 'description');
    const d = desc ? decode(attr(desc, 'content') || '') : '';
    if (!d) err(r, 'missing meta description');
    else if (d.length < CONFIG.description.min || d.length > CONFIG.description.max) warn(r, `meta description is ${d.length} chars (aim ${CONFIG.description.min}-${CONFIG.description.max})`);

    const canon = tags(head, 'link').filter((t) => (attr(t, 'rel') || '').toLowerCase() === 'canonical');
    if (canon.length !== 1) err(r, `expected exactly 1 canonical, found ${canon.length}`);
    else {
      const c = attr(canon[0], 'href');
      if (!c.startsWith(ORIGIN)) err(r, `canonical ${c} is not on ${ORIGIN}`);
      else if (c !== url) err(r, `canonical ${c} does not match this page's URL ${url}`);
    }

    const alts = {};
    for (const t of tags(head, 'link')) {
      if ((attr(t, 'rel') || '').toLowerCase() === 'alternate' && attr(t, 'hreflang')) alts[attr(t, 'hreflang')] = attr(t, 'href');
    }
    if (CONFIG.requireHreflang && !CONFIG.hreflangExempt.includes(r)) {
      for (const l of ['en', 'ar', 'x-default']) if (!alts[l]) err(r, `missing hreflang="${l}"`);
    }
    hreflangMap.set(url, alts);

    if (!sitemapLocs.has(url) && !CONFIG.sitemapExempt.includes(r)) err(r, `indexable page ${url} is missing from sitemap.xml`);

    // structured data: exactly one JSON-LD block that parses and carries an @graph
    const ld = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    if (ld.length !== 1) err(r, `expected exactly 1 JSON-LD block, found ${ld.length}`);
    for (const m of ld) {
      try {
        const j = JSON.parse(m[1]);
        if (!Array.isArray(j['@graph'])) err(r, 'JSON-LD has no @graph array');
        else {
          const ids = j['@graph'].map((n) => n['@id']).filter(Boolean);
          const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
          if (dupes.length) err(r, `JSON-LD @graph repeats @id ${[...new Set(dupes)].join(', ')}`);
          if (!ids.includes(CONFIG.organizationId)) err(r, `JSON-LD @graph does not include the Organization node ${CONFIG.organizationId}`);
        }
      } catch (e) {
        err(r, `JSON-LD does not parse: ${e.message}`);
      }
    }
  }

  // body checks (all pages)
  const ids = [...html.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) { err(r, `duplicate id="${id}"`); break; }
    seen.add(id);
  }
  for (const img of tags(html, 'img')) {
    if (attr(img, 'alt') === null) err(r, `<img src="${attr(img, 'src')}"> has no alt attribute`);
  }
  if (/\s(?:src|href)\s*=\s*["']http:\/\//i.test(html)) err(r, 'insecure http:// resource or link');

  // internal links + assets
  const refs = [...html.matchAll(/\s(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const raw of refs) {
    const u = decode(raw.trim());
    if (!u || /^(#|mailto:|tel:|sms:|whatsapp:|javascript:|data:|https?:\/\/|\/\/)/i.test(u)) {
      if (u.startsWith(ORIGIN + '/')) { if (!resolves(u.slice(ORIGIN.length))) err(r, `link to ${u} does not resolve to a file`); }
      continue;
    }
    if (u.includes('${') || u.includes('{{')) continue; // runtime template strings
    const abs = u.startsWith('/') ? u : path.posix.join(path.posix.dirname(r), u);
    if (!resolves(abs)) err(r, `broken internal reference ${u}`);
  }
}

// hreflang must be reciprocal
for (const [url, alts] of hreflangMap) {
  for (const [l, href] of Object.entries(alts)) {
    if (l === 'x-default' || href === url) continue;
    const back = hreflangMap.get(href);
    if (!back) { if (!noindexPages.has(href)) err(url, `hreflang ${l} points to ${href}, which is not an indexable page`); continue; }
    if (!Object.values(back).includes(url)) err(url, `hreflang ${l} → ${href} is not reciprocated`);
  }
}

// sitemap entries must exist and be indexable
if (!sitemapXml) err('/sitemap.xml', 'missing');
for (const loc of sitemapLocs) {
  if (!loc.startsWith(ORIGIN)) { err('/sitemap.xml', `entry ${loc} is not on ${ORIGIN}`); continue; }
  if (!resolves(loc.slice(ORIGIN.length) || '/')) err('/sitemap.xml', `entry ${loc} has no file`);
  else if (noindexPages.has(loc)) err('/sitemap.xml', `entry ${loc} is a noindex page`);
}

// robots.txt, CNAME, required files
const robots = fileSet.has('/robots.txt') ? fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8') : '';
if (!robots) err('/robots.txt', 'missing');
else {
  if (!robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`)) err('/robots.txt', `must contain "Sitemap: ${ORIGIN}/sitemap.xml"`);
  if (/^\s*Disallow:\s*\/\s*$/m.test(robots)) err('/robots.txt', 'contains "Disallow: /" — this would de-index the site');
}
if (CONFIG.cname) {
  const c = fileSet.has('/CNAME') ? fs.readFileSync(path.join(ROOT, 'CNAME'), 'utf8').trim() : '';
  if (c !== CONFIG.cname) err('/CNAME', `expected "${CONFIG.cname}", found "${c}"`);
}
for (const f of CONFIG.requiredFiles) if (!fileSet.has(f)) err(f, 'required file is missing');

// asset budgets
for (const f of files) {
  const r = rel(f);
  if (!/\.(jpe?g|png|webp|avif|gif|svg)$/i.test(r)) continue;
  const kb = fs.statSync(f).size / 1024;
  if (kb > CONFIG.budgets.imageKbError) err(r, `image is ${kb.toFixed(0)} KB (limit ${CONFIG.budgets.imageKbError} KB)`);
  else if (kb > CONFIG.budgets.imageKbWarn) warn(r, `image is ${kb.toFixed(0)} KB (aim < ${CONFIG.budgets.imageKbWarn} KB)`);
}

// ---------- report ----------
const summary = `${htmlFiles.length} HTML files · ${indexablePages.size} indexable · ${noindexPages.size} noindex · ${sitemapLocs.size} sitemap URLs`;
console.log(`Site check — ${summary}`);
for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [`### Site check`, summary, '', `**${errors.length} error(s), ${warnings.length} warning(s)**`, ''];
  if (errors.length) md.push('<details open><summary>Errors</summary>', '', ...errors.map((e) => `- ${e}`), '', '</details>');
  if (warnings.length) md.push('<details><summary>Warnings</summary>', '', ...warnings.map((w) => `- ${w}`), '', '</details>');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
}
process.exit(errors.length ? 1 : 0);
