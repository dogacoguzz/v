// boot.js: shared page boot for every page. Pages are prerendered per locale (data-locale),
// so this only wires the language switch and marks the current nav link.

import { pageLocale, persistLocale } from './i18n.js?v=9ac4c9b0';

const locale = pageLocale();

function alternatePath(target) {
  const link = document.querySelector(`link[rel="alternate"][hreflang="${target}"]`);
  try {
    if (link) return new URL(link.getAttribute('href'), window.location.href).pathname;
  } catch (_) {}
  return target === 'tr' ? '/tr/' : '/';
}

document.querySelectorAll('.lang-switch button[data-locale]').forEach((btn) => {
  btn.setAttribute('aria-current', btn.dataset.locale === locale ? 'true' : 'false');
  btn.addEventListener('click', () => {
    const next = btn.dataset.locale;
    if (!next || next === locale) return;
    persistLocale(next);
    // "/" redirects TR browsers to /tr/ unless ?lang= or a saved choice says otherwise, and
    // storage can be blocked, so the EN home link carries the choice in the URL.
    const path = alternatePath(next);
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
