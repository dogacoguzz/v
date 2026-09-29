// i18n.js: locale choice shared by every page. Pages are prerendered per locale, so this only
// resolves which locale the visitor wants and remembers an explicit switch.

const STORAGE_KEY = 'velora-lang';
const SUPPORTED = ['en', 'tr'];
const DEFAULT_LOCALE = 'en';

function detectBrowserLocale() {
  const langs = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || ''];
  for (const lang of langs) {
    const tag = String(lang).toLowerCase();
    if (tag.startsWith('tr')) return 'tr';
  }
  return DEFAULT_LOCALE;
}

// Every generated page bakes its locale into <html data-locale>.
function fixedLocaleAttr() {
  try { return document.documentElement.dataset.locale; } catch (_) { return undefined; }
}

export function resolveLocale() {
  // 1. Fixed-locale page: always wins
  const fixed = fixedLocaleAttr();
  if (fixed && SUPPORTED.includes(fixed)) return fixed;
  // 2. Dedicated path: /tr/ is the prerendered, crawlable Turkish page
  try {
    if (/^\/tr(\/|$)/.test(window.location.pathname)) return 'tr';
  } catch (_) {}
  // 3. Explicit URL choice (?lang=tr): legacy shareable entry point
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (fromUrl && SUPPORTED.includes(fromUrl)) return fromUrl;
  } catch (_) {}
  // 4. Saved choice
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (_) {}
  if (saved && SUPPORTED.includes(saved)) return saved;
  // 5. Browser language
  return detectBrowserLocale();
}

export function persistLocale(locale) {
  try { localStorage.setItem(STORAGE_KEY, locale); } catch (_) {}
}
