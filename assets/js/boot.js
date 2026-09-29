// boot.js: shared page boot for every page. Pages are prerendered per locale (data-locale),
// so this only wires the language switch and marks the current nav link.

import { persistLocale, resolveLocale } from './i18n.js';

const root = document.documentElement;
const locale = root.dataset.locale || resolveLocale();

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
    window.location.assign(alternatePath(next) + window.location.hash);
  });
});

document.querySelectorAll('.site-nav__links a[href]').forEach((link) => {
  try {
    const url = new URL(link.getAttribute('href'), window.location.href);
    if (!url.hash && url.pathname === window.location.pathname) link.setAttribute('aria-current', 'page');
  } catch (_) {}
});
