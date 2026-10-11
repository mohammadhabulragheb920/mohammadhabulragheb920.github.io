/* Abu Al-Ragheb Tires — site analytics (Umami + Microsoft Clarity).
 * Umami: traffic sources, UTM campaigns, pages, time on site, countries/devices, Core Web Vitals, and the
 *        business events below (cookieless).
 * Clarity: heatmaps and session recordings (inputs and numbers masked by default).
 * Runs only on the live domain, so local previews and CI (Lighthouse) are never tracked.
 * Events, one per customer action, each with page + lang + target:
 *   whatsapp    — any wa.me link (target = sales-jo | faz3a | dubai | number; size = tire size if the message has one)
 *   call        — tel: links (target = number)
 *   directions  — Google Maps / Waze links (target = branch)
 *   email       — mailto:
 *   social      — Instagram, Facebook, TikTok, Linktree, YouTube, X
 *   outbound    — any other external site (target = hostname, e.g. a brand site)
 *   lang_switch — EN <-> AR
 */
(function () {
  var CFG = {
    umamiWebsiteId: '76b73c32-7342-4966-b915-85aa1a8585c2',
    clarityProjectId: 'yw5b690ooq',
    domain: 'abualraghebtires.com'
  };
  var LINES = { '962775040601': 'sales-jo', '962775040602': 'faz3a', '971507678529': 'dubai' };

  var host = location.hostname;
  if (host !== CFG.domain && host !== 'www.' + CFG.domain) return;

  var path = location.pathname;
  var lang = /^\/ar(\/|$)/.test(path) ? 'ar' : 'en';
  var page = path.replace(/^\/ar(?=\/|$)/, '') || '/';
  page = page.replace(/\.html$/, '').replace(/\/index$/, '/');
  var section = page === '/' ? 'home' : page.split('/')[1];
  var branch = (page.match(/^\/branches\/([^\/]+)/) || [])[1] || '';

  // Umami
  if (CFG.umamiWebsiteId.indexOf('UMAMI') !== 0) {
    var u = document.createElement('script');
    u.defer = true;
    u.src = 'https://cloud.umami.is/script.js';
    u.setAttribute('data-website-id', CFG.umamiWebsiteId);
    u.setAttribute('data-domains', CFG.domain + ',www.' + CFG.domain);
    u.setAttribute('data-performance', 'true');
    u.setAttribute('data-tag', lang);
    document.head.appendChild(u);
  }

  // Microsoft Clarity (official loader)
  if (CFG.clarityProjectId.indexOf('CLARITY') !== 0) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CFG.clarityProjectId);
    window.clarity('set', 'lang', lang);
    window.clarity('set', 'section', section);
    if (branch) window.clarity('set', 'branch', branch);
  }

  var SOCIAL = /(^|\.)(instagram\.com|facebook\.com|fb\.com|tiktok\.com|linktr\.ee|youtube\.com|youtu\.be|x\.com|twitter\.com|snapchat\.com)$/i;
  var MAPS = /(^|\.)(google\.[a-z.]+|goo\.gl|waze\.com)$/i;
  var SIZE = /(\d{3})\s*\/\s*(\d{2})\s*Z?R?\s*(\d{2})/i;

  function classify(href) {
    if (!href) return null;
    if (/^tel:/i.test(href)) return { name: 'call', target: href.replace(/^tel:/i, '').replace(/[^\d+]/g, '') };
    if (/^mailto:/i.test(href)) return { name: 'email', target: 'email' };
    var url;
    try { url = new URL(href, location.href); } catch (e) { return null; }
    var h = url.hostname.replace(/^www\./, '');
    if (h === 'wa.me' || h === 'api.whatsapp.com' || h === 'web.whatsapp.com') {
      var num = (url.pathname.replace(/\D/g, '') || url.searchParams.get('phone') || '').replace(/\D/g, '');
      var ev = { name: 'whatsapp', target: LINES[num] || num || 'unknown' };
      var text = url.searchParams.get('text') || '';
      var m = text.match(SIZE);
      if (m) ev.size = m[1] + '/' + m[2] + ' R' + m[3];
      var tag = text.match(/#([A-Z]{2,12})\b/);
      if (tag) ev.topic = tag[1].toLowerCase();
      return ev;
    }
    if (MAPS.test(h) && (/maps/.test(url.pathname + h) || h === 'goo.gl' || /waze/.test(h))) return { name: 'directions', target: branch || 'map' };
    if (SOCIAL.test(h)) return { name: 'social', target: h.split('.').slice(-2, -1)[0] };
    if (h === CFG.domain || h === location.hostname) {
      var toAr = /^\/ar(\/|$)/.test(url.pathname);
      if (toAr !== (lang === 'ar') && url.pathname !== path) return { name: 'lang_switch', target: toAr ? 'ar' : 'en' };
      return null;
    }
    if (/^https?:$/.test(url.protocol)) return { name: 'outbound', target: h };
    return null;
  }

  function send(ev) {
    var data = { page: page, lang: lang, target: ev.target };
    if (ev.size) data.size = ev.size;
    if (ev.topic) data.topic = ev.topic;
    try { if (window.umami && window.umami.track) window.umami.track(ev.name, data); } catch (e) {}
    try { if (window.clarity) { window.clarity('event', ev.name); window.clarity('upgrade', ev.name); } } catch (e) {}
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var ev = classify(a.getAttribute('href'));
    if (ev) send(ev);
  }, true);

  window.__arrtAnalytics = { classify: classify, context: { page: page, lang: lang, section: section, branch: branch } };
})();
