#!/usr/bin/env node
// build-tr.mjs — prerenders the static Turkish page at tr/index.html.
//
// Why: the site's i18n is client-side JS. Googlebot renders JS, but most other
// crawlers (Bing partially, AI bots like ClaudeBot/GPTBot) do not — so Turkish
// content was invisible to them. This script bakes strings.tr.json into a real
// static page. Run it after ANY change to index.html or strings.tr.json:
//
//   node tools/build-tr.mjs
//
// and commit the regenerated tr/index.html together with your change.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyI18nStrings, keyParity, markLangSwitch, rewriteRootRelativePaths } from './lib/prerender.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://velorahealthcompanion.com';

const strings = JSON.parse(readFileSync(join(ROOT, 'assets/data/strings.tr.json'), 'utf8'));
const stringsEn = JSON.parse(readFileSync(join(ROOT, 'assets/data/strings.en.json'), 'utf8'));
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');

const get = (path) => path.split('.').reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), strings);

// --- <html lang> ---
html = html.replace('<html lang="en">', '<html lang="tr">');

// --- head: title, descriptions, canonical, og, twitter ---
const title = get('meta.title');
const desc = get('meta.description');
html = html
  .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${desc}$2`)
  .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
  .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${desc}$2`)
  .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`)
  .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${desc}$2`)
  .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${SITE}/tr/$2`)
  .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${SITE}/tr/$2`)
  .replace(/(<meta property="og:locale" content=")[^"]*(")/, '$1tr_TR$2')
  .replace(/(<meta property="og:locale:alternate" content=")[^"]*(")/, '$1en_US$2');

// --- JSON-LD: localized description ---
html = html.replace(
  /("description": ")[^"]*(",\s*\n\s*"offers")/,
  `$1${desc}$2`
);

// --- replace the early-locale inline script with a static TR preload ---
html = html.replace(
  /  <!-- Early locale:[\s\S]*?<\/script>\n/,
  '  <link rel="preload" as="image" href="/images/tr1.webp" />\n'
);

// --- data-i18n / data-i18n-html / data-i18n-alt / data-i18n-aria-label ---
const { html: localized, missing } = applyI18nStrings(html, strings);
html = localized;

// --- per-locale image sources: point every swappable img at its TR variant ---
html = html.replace(/<img[^>]*data-src-tr="([^"]+)"[^>]*>/g, (tag, trSrc) =>
  tag.replace(/src="[^"]*"/, `src="${trSrc}"`)
);
// Sticky showcase phone: no data-src-* on the img itself; JS drives it from the
// section attributes at runtime, but the static page should start Turkish too.
html = html.replace(
  /(<img[^>]*data-showcase-phone[^>]*src=")[^"]*(")/,
  '$1images/tr1.webp$2'
);
html = html.replace(
  /(<img[^>]*data-showcase-phone[^>]*alt=")[^"]*(")/,
  `$1${get('showcase.metrics.imgAlt')}$2`
);

// --- root-relative asset/image/legal paths (page lives under /tr/) + lang switch state ---
html = markLangSwitch(rewriteRootRelativePaths(html, { localePrefix: '/tr' }), 'tr');

if (missing.length) {
  console.error('MISSING TR KEYS:', [...new Set(missing)].join(', '));
  process.exit(1);
}

mkdirSync(join(ROOT, 'tr'), { recursive: true });
writeFileSync(join(ROOT, 'tr/index.html'), html);

// sanity output
const checks = {
  'lang=tr': html.includes('<html lang="tr">'),
  'title TR': html.includes('Antrenman, metrik ve trendler'),
  'canonical /tr/': html.includes(`${SITE}/tr/`),
  'no bare assets/ path': !/(?:href|src)="assets\//.test(html),
  'tr screenshot': html.includes('/images/tr1.webp'),
  'no EN hero left': !html.includes('Your week,'),
  'legal links /tr/': html.includes('/tr/privacy-policy/') && html.includes('/tr/terms-of-service/')
    && !/href="(privacy-policy|terms-of-service)\//.test(html),
  'i18n attr keys intact': ![...html.matchAll(/data-i18n-(?:aria-label|alt)="([^"]*)"/g)].some((m) => /\s/.test(m[1])),
  'strings key parity': keyParity(stringsEn, strings),
};
console.log('tr/index.html written.');
for (const [k, v] of Object.entries(checks)) console.log(`${v ? 'ok ' : 'FAIL'} ${k}`);
if (Object.values(checks).some((v) => !v)) process.exit(1);
