// boot.js: shared page boot for every page. Pages are prerendered per locale (data-locale),
// so this only wires the language switch links and marks the current nav link.

import { pageLocale, persistLocale } from './i18n.js?v=9ac4c9b0';

const locale = pageLocale();

document.querySelectorAll('.lang-switch a[data-locale]').forEach((link) => {
  link.setAttribute('aria-current', link.dataset.locale === locale ? 'true' : 'false');
  link.addEventListener('click', (event) => {
    const next = link.dataset.locale;
    if (!next) return;
    if (next === locale) { event.preventDefault(); return; }
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    persistLocale(next);
    let path;
    try { path = new URL(link.getAttribute('href'), window.location.href).pathname; } catch (_) { return; }
    event.preventDefault();
    // "/" redirects TR browsers to /tr/ unless ?lang= or a saved choice says otherwise, and
    // storage can be blocked, so the EN home link carries the choice in the URL.
    const query = path === '/' ? `?lang=${next}` : '';
    window.location.assign(path + query + window.location.hash);
  });
});

document.querySelectorAll('.site-nav__links a[href]').forEach((link) => {
  try {
    const url = new URL(link.getAttribute('href'), window.location.href);
    if (!url.hash && url.pathname === window.location.pathname) link.setAttribute('aria-current', 'page');
  } catch (_) {}
});
