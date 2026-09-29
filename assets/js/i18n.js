// i18n.js: locale helpers shared by every page. Pages are prerendered per locale and bake it
// into <html data-locale>, so this only reads that value and remembers an explicit switch.

const STORAGE_KEY = 'velora-lang';
const SUPPORTED = ['en', 'tr'];
const DEFAULT_LOCALE = 'en';

export function pageLocale() {
  const fixed = document.documentElement.dataset.locale;
  return SUPPORTED.includes(fixed) ? fixed : DEFAULT_LOCALE;
}

export function persistLocale(locale) {
  try { localStorage.setItem(STORAGE_KEY, locale); } catch (_) {}
}
