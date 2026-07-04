// i18n.js — translation engine for Velora landing.
// Strings are fetched per-locale from /assets/data/strings.<locale>.json.

const STORAGE_KEY = 'velora-lang';
const SUPPORTED = ['en', 'tr'];
const DEFAULT_LOCALE = 'en';

const cache = new Map();

function get(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

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

export function resolveLocale() {
  // 1. Explicit URL choice (?lang=tr) — shareable / crawlable entry point
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (fromUrl && SUPPORTED.includes(fromUrl)) return fromUrl;
  } catch (_) {}
  // 2. Saved choice
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (_) {}
  if (saved && SUPPORTED.includes(saved)) return saved;
  // 3. Browser language
  return detectBrowserLocale();
}

export function persistLocale(locale) {
  try { localStorage.setItem(STORAGE_KEY, locale); } catch (_) {}
}

const STRINGS_VERSION = '2026-07-04-4';

async function loadStrings(locale) {
  if (cache.has(locale)) return cache.get(locale);
  // The ?v= version param already busts stale caches; no-cache would force
  // a revalidation round-trip on every load.
  const url = new URL(`../data/strings.${locale}.json?v=${STRINGS_VERSION}`, import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${locale} strings`);
  const data = await res.json();
  cache.set(locale, data);
  return data;
}

export async function applyLocale(locale) {
  if (!SUPPORTED.includes(locale)) locale = DEFAULT_LOCALE;
  const strings = await loadStrings(locale);

  // <html lang>
  document.documentElement.lang = locale;

  // <title> + meta description
  const title = get(strings, 'meta.title');
  if (title) document.title = title;
  const desc = get(strings, 'meta.description');
  if (desc) {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', desc);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', desc);
    const twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.setAttribute('content', desc);
  }
  if (title) {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);
    const twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute('content', title);
  }

  // Text nodes
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = get(strings, el.getAttribute('data-i18n'));
    if (typeof value === 'string') el.textContent = value;
  });

  // HTML nodes (allows <em>)
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const value = get(strings, el.getAttribute('data-i18n-html'));
    if (typeof value === 'string') el.innerHTML = value;
  });

  // Image alt
  document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
    const value = get(strings, el.getAttribute('data-i18n-alt'));
    if (typeof value === 'string') el.setAttribute('alt', value);
  });

  // aria-label
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const value = get(strings, el.getAttribute('data-i18n-aria-label'));
    if (typeof value === 'string') el.setAttribute('aria-label', value);
  });

  // Image src swap (per-locale image variants)
  document.querySelectorAll('[data-src-en][data-src-tr]').forEach((el) => {
    const src = locale === 'tr'
      ? el.getAttribute('data-src-tr')
      : el.getAttribute('data-src-en');
    if (src && el.getAttribute('src') !== src) el.setAttribute('src', src);
  });

  // Lang switch button state
  document.querySelectorAll('.lang-switch button[data-locale]').forEach((btn) => {
    const isCurrent = btn.dataset.locale === locale;
    btn.setAttribute('aria-current', isCurrent ? 'true' : 'false');
  });

  // Notify listeners (e.g. showcase to refresh phone src)
  document.dispatchEvent(new CustomEvent('locale:changed', { detail: { locale } }));
}
