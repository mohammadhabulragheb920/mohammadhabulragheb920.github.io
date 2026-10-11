#!/usr/bin/env node
// Live smoke test for https://abualraghebtires.com — run after every deploy and daily.
// Zero dependencies (Node >= 18 has fetch).
const ORIGIN = process.env.SITE_ORIGIN || 'https://abualraghebtires.com';
const PAGES = [
  ['/', 'en'], ['/ar/', 'ar'], ['/tires', 'en'], ['/ar/tires', 'ar'],
  ['/branches/gardens', 'en'], ['/faz3a', 'en'], ['/contact', 'en'], ['/faq', 'en'],
];
const FILES = ['/robots.txt', '/sitemap.xml', '/llms.txt', '/arrt-runtime.js', '/data/catalogue.csv', '/favicon.ico'];

const failures = [];
const fail = (m) => { failures.push(m); console.log(`FAIL  ${m}`); };
const ok = (m) => console.log(`ok    ${m}`);

async function get(path, opts = {}) {
  const url = path.startsWith('http') ? path : ORIGIN + path;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'arrt-smoke/1.0' }, ...opts });
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

for (const [p, lang] of PAGES) {
  try {
    let res = await get(p);
    if (res.status === 301 || res.status === 302) res = await get(new URL(res.headers.get('location'), ORIGIN).href);
    if (res.status !== 200) { fail(`${p} returned ${res.status}`); continue; }
    const html = await res.text();
    if (!new RegExp(`<html[^>]+lang="${lang}`).test(html)) fail(`${p} does not declare lang="${lang}"`);
    else if (!/<link rel="canonical" href="https:\/\/abualraghebtires\.com/.test(html)) fail(`${p} has no canonical on the live domain`);
    else if (!/application\/ld\+json/.test(html)) fail(`${p} lost its structured data`);
    else if (!/wa\.me\/962/.test(html)) fail(`${p} has no WhatsApp link`);
    else ok(`${p} 200, ${lang}, canonical, schema, WhatsApp`);
  } catch (e) { fail(`${p} request failed: ${e.message}`); }
}
for (const f of FILES) {
  try {
    const res = await get(f);
    if (res.status !== 200) fail(`${f} returned ${res.status}`); else ok(`${f} 200`);
  } catch (e) { fail(`${f} request failed: ${e.message}`); }
}
// 404 page must really be a 404 (not a soft 200)
try {
  const res = await get('/this-page-should-not-exist-' + Date.now());
  if (res.status !== 404) fail(`unknown URL returned ${res.status}, expected 404`); else ok('unknown URL → 404');
} catch (e) { fail(`404 check failed: ${e.message}`); }
// http → https
try {
  const res = await get(ORIGIN.replace('https://', 'http://') + '/');
  const loc = res.headers.get('location') || '';
  if (![301, 302, 307, 308].includes(res.status) || !loc.startsWith('https://')) fail(`http:// does not redirect to https (status ${res.status})`);
  else ok('http → https redirect');
} catch (e) { fail(`http redirect check failed: ${e.message}`); }

console.log(`\n${failures.length} failure(s)`);
process.exit(failures.length ? 1 : 0);
