#!/usr/bin/env node
// build-legal.mjs — generates the four legal pages from a Firebase Remote Config export.
//
// Workflow after editing a document in the Remote Config console:
//   npx firebase-tools remoteconfig:get --project velora-79f7c -o /tmp/rc.json
//   node tools/build-legal.mjs /tmp/rc.json
// then commit privacy-policy/, terms-of-service/ and their tr/ siblings.
// The export itself is never committed; the legal text is copied verbatim (only presentation changes).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyI18nStrings, markLangSwitch, rewriteRootRelativePaths } from './lib/prerender.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://velorahealthcompanion.com';
const APP_NAME = 'Velora';

const DOCUMENTS = [
  { key: 'privacy_policy_en', locale: 'en', kind: 'privacy' },
  { key: 'privacy_policy_tr', locale: 'tr', kind: 'privacy' },
  { key: 'terms_of_service_en', locale: 'en', kind: 'terms' },
  { key: 'terms_of_service_tr', locale: 'tr', kind: 'terms' },
];
const SLUGS = { privacy: 'privacy-policy', terms: 'terms-of-service' };
const OG_LOCALES = { en: 'en_US', tr: 'tr_TR' };
const PREFIX = { en: '', tr: '/tr' };

export const outputPath = ({ locale, kind }) => `${locale === 'tr' ? 'tr/' : ''}${SLUGS[kind]}/index.html`;
export const OUTPUT_PATHS = DOCUMENTS.map(outputPath);

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TOP_LEVEL_ALLOWLIST = {
  h1: [''],
  h2: [''],
  p: ['', 'last-updated'],
  ul: [''],
  table: ['data-table'],
  div: ['legal__table-scroll', 'highlight', 'warning-box', 'danger-box', 'contact-info'],
};

const attrValue = (attrs, name) => {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m ? m[1].trim() : '';
};

// Inner HTML of the source's <div class="container">, found by depth-counting nested divs.
export function extractBody(html) {
  const open = '<div class="container">';
  const start = html.indexOf(open);
  if (start === -1) throw new Error('extractBody: no <div class="container"> in source document');
  const re = /<\/?div\b[^>]*>/g;
  re.lastIndex = start + open.length;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start + open.length, m.index);
  }
  throw new Error('extractBody: <div class="container"> is never closed');
}

const APP_VERSION_PARAGRAPH = /[ \t]*<p\b[^>]*>((?:(?!<\/p>)[\s\S])*?\\\(appVersion\)[\s\S]*?)<\/p>[ \t]*\r?\n?/g;
const APP_VERSION_LABEL = /<strong>\s*(?:App Version|Uygulama Sürümü):?\s*<\/strong>/g;

// The appVersion paragraph is dropped only when it carries nothing but its label and the placeholder.
export function substitutePlaceholders(html) {
  if (html.includes('\\(sharedCSS)')) throw new Error('substitutePlaceholders: \\(sharedCSS) reached the document body');
  return html
    .replace(APP_VERSION_PARAGRAPH, (_, inner) => {
      const leftover = inner.replace(APP_VERSION_LABEL, '').replace(/\\\(appVersion\)/g, '').trim();
      if (/[^\s\p{P}]/u.test(leftover)) {
        throw new Error(`substitutePlaceholders: appVersion paragraph carries extra wording: ${leftover}`);
      }
      return '';
    })
    .replace(/\\\(appName\)/g, APP_NAME);
}

export function stripInlineStyles(html) {
  return html.replace(/\s+style=(?:"[^"]*"|'[^']*')/g, '');
}

// Wraps each table.data-table in the horizontal-scroll container; a second run is a no-op.
export function wrapTables(html) {
  return html.replace(
    /(?<!<div class="legal__table-scroll">\s*)^([ \t]*)(<table\b[^>]*\bclass="data-table"[^>]*>[\s\S]*?<\/table>)/gm,
    (_, indent, table) => {
      const inner = table.split('\n').map((line) => (line.trim() ? `  ${line}` : line)).join('\n');
      return `${indent}<div class="legal__table-scroll">\n${indent}${inner}\n${indent}</div>`;
    }
  );
}

// Top-level elements must match the allowlist; nested markup is the document's own business.
export function assertClean(html) {
  const placeholder = /\\\([^)]*\)?/.exec(html);
  if (placeholder) throw new Error(`assertClean: unresolved placeholder ${placeholder[0]}`);
  const embedded = /<(script|style)\b/i.exec(html);
  if (embedded) throw new Error(`assertClean: embedded <${embedded[1].toLowerCase()}> element is not allowed`);

  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let depth = 0;
  for (let m = tagRe.exec(stripped); m; m = tagRe.exec(stripped)) {
    const [, closing, rawTag, attrs] = m;
    const tag = rawTag.toLowerCase();
    if (closing) { depth = Math.max(0, depth - 1); continue; }
    const selfClosing = VOID_TAGS.has(tag) || /\/\s*$/.test(attrs);
    if (depth === 0) {
      const cls = attrValue(attrs, 'class');
      const allowed = TOP_LEVEL_ALLOWLIST[tag];
      if (!allowed || !allowed.includes(cls)) {
        const label = cls ? `<${tag} class="${cls}">` : `<${tag}>`;
        throw new Error(`assertClean: top-level ${label} is outside the allowlist`);
      }
    }
    if (!selfClosing) depth += 1;
  }
  if (depth !== 0) throw new Error(`assertClean: unbalanced markup, ${depth} element(s) never closed`);
}

export function normaliseDocument(source) {
  const body = wrapTables(stripInlineStyles(substitutePlaceholders(extractBody(source))));
  assertClean(body);
  return body;
}

const sliceBetween = (html, startMarker, endMarker, label) => {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  if (start === -1 || end === -1) throw new Error(`loadChrome: ${label} not found in index.html`);
  return html.slice(start, end + endMarker.length);
};

// index.html is the single source of chrome: skip link, nav, footer, font and stylesheet links.
export function loadChrome(indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8')) {
  const skipLink = /<a class="skip-link"[^>]*>[^<]*<\/a>/.exec(indexHtml)?.[0];
  if (!skipLink) throw new Error('loadChrome: skip link not found in index.html');
  const fonts = indexHtml.match(/<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts\.[^"]+"[^>]*\/>/g) || [];
  if (fonts.length !== 3) throw new Error(`loadChrome: expected 3 font links in index.html, found ${fonts.length}`);
  const stylesheets = indexHtml.match(/<link rel="stylesheet" href="assets\/css\/[^"]+" \/>/g) || [];
  if (!stylesheets.length) throw new Error('loadChrome: no site stylesheets found in index.html');
  return {
    skipLink,
    nav: sliceBetween(indexHtml, '<!-- ========== NAV ========== -->', '</header>', 'nav block'),
    footer: sliceBetween(indexHtml, '<!-- ========== FOOTER ========== -->', '</footer>', 'footer block'),
    fonts,
    stylesheets: [...stylesheets, '<link rel="stylesheet" href="assets/css/legal.css" />'],
  };
}

const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const text = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const reindent = (html, indent) => {
  const lines = html.replace(/^\s*\n|\s+$/g, '').split('\n');
  const common = Math.min(...lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)[0].length));
  return lines.map((l) => (l.trim() ? indent + l.slice(common) : '')).join('\n');
};

export function composePage({ locale, kind, body, strings, chrome }) {
  const slug = SLUGS[kind];
  const prefix = PREFIX[locale];
  const title = strings.legal[kind].title;
  const description = strings.legal[kind].description;
  const url = `${SITE}${prefix}/${slug}/`;

  let { skipLink, nav, footer } = chrome;
  if (locale === 'tr') {
    const missing = [];
    [skipLink, nav, footer] = [skipLink, nav, footer].map((piece) => {
      const applied = applyI18nStrings(piece, strings);
      missing.push(...applied.missing);
      return applied.html;
    });
    if (missing.length) throw new Error(`MISSING TR KEYS: ${[...new Set(missing)].join(', ')}`);
  }
  nav = markLangSwitch(nav.replace('<a href="#top" class="brand-mark"', `<a href="${prefix}/" class="brand-mark"`), locale);

  const head = [
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${text(title)}</title>`,
    `<meta name="description" content="${attr(description)}" />`,
    '<meta name="color-scheme" content="dark" />',
    '<meta name="theme-color" content="#0c0f12" />',
    '',
    `<link rel="canonical" href="${url}" />`,
    `<link rel="alternate" hreflang="en" href="${SITE}/${slug}/" />`,
    `<link rel="alternate" hreflang="tr" href="${SITE}/tr/${slug}/" />`,
    `<link rel="alternate" hreflang="x-default" href="${SITE}/${slug}/" />`,
    '',
    '<link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png" />',
    '<link rel="apple-touch-icon" href="/images/apple-touch-icon.png" />',
    '',
    '<!-- Open Graph -->',
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Velora" />',
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    `<meta property="og:locale" content="${OG_LOCALES[locale]}" />`,
    '',
    '<!-- Twitter -->',
    '<meta name="twitter:card" content="summary" />',
    `<meta name="twitter:title" content="${attr(title)}" />`,
    `<meta name="twitter:description" content="${attr(description)}" />`,
    '',
    '<!-- Fonts -->',
    ...chrome.fonts,
    '',
    '<!-- Stylesheets (load order matters: tokens first, legal last) -->',
    ...chrome.stylesheets,
    '',
    '<script type="module" src="assets/js/app.js"></script>',
  ].map((line) => (line ? `  ${line}` : '')).join('\n');

  const page = `<!DOCTYPE html>
<html lang="${locale}" data-locale="${locale}">
<head>
${head}
</head>

<body data-accent="activities">

  ${skipLink}

  ${nav}

  <main id="top">
    <article class="legal">
${reindent(body, '      ')}
    </article>
  </main>

  ${footer}

</body>
</html>
`;
  return rewriteRootRelativePaths(page, { localePrefix: prefix });
}

// eula/index.html carries the URL three times; all copies must agree before the export is compared against it.
const EULA_URL_SOURCES = [
  /<meta http-equiv="refresh" content="0; url=([^"]+)" \/>/,
  /<a href="([^"]+)"/,
  /location\.replace\('([^']+)'\)/,
];

export function readEulaUrl(eulaHtml = readFileSync(join(ROOT, 'eula/index.html'), 'utf8')) {
  const urls = EULA_URL_SOURCES.map((re) => re.exec(eulaHtml)?.[1]);
  if (urls.some((url) => !url) || new Set(urls).size !== 1) {
    throw new Error('eula/index.html: meta refresh, link and location.replace URLs differ');
  }
  return urls[0];
}

export const count = (html, re) => (html.match(re) || []).length;

export function pageChecks({ page, source, locale, kind }) {
  const slug = SLUGS[kind];
  const prefix = PREFIX[locale];
  const article = /<article class="legal">([\s\S]*?)<\/article>/.exec(page)?.[1] ?? '';
  let allowlist = true;
  try { assertClean(article); } catch (e) { allowlist = e.message; }
  return {
    'exactly one h1': count(page, /<h1\b/g) === 1,
    'no unresolved placeholder': !page.includes('\\('),
    'no inline style': !/\sstyle=/.test(page),
    'no script/style in article': !/<(script|style)\b/i.test(article),
    'h2 count matches source': count(article, /<h2\b/g) === count(source, /<h2\b/g),
    'top-level allowlist': allowlist,
    'no bare legal href': !/href="(privacy-policy|terms-of-service)\//.test(page),
    'no bare asset path': !/(?:href|src)="(?:assets|images)\//.test(page),
    'brand href is locale home': page.includes(`<a href="${prefix}/" class="brand-mark"`),
    'data-locale matches lang': page.includes(`<html lang="${locale}" data-locale="${locale}">`),
    'canonical ends with slug': page.includes(`<link rel="canonical" href="${SITE}${prefix}/${slug}/" />`),
  };
}

const printChecks = (log, label, checks) => {
  for (const [k, v] of Object.entries(checks)) {
    log(`${v === true ? 'ok  ' : 'FAIL'} ${label}: ${k}${typeof v === 'string' ? ` — ${v}` : ''}`);
  }
};

// Builds all four pages and prints the sanity table before anything is written.
export function build({ exportPath, outDir = ROOT, log = console.log }) {
  if (!exportPath) throw new Error('usage: node tools/build-legal.mjs <path-to-rc-export.json>');
  if (!existsSync(exportPath)) throw new Error(`export not found: ${exportPath}`);
  const parameters = JSON.parse(readFileSync(exportPath, 'utf8')).parameters ?? {};
  const param = (key) => {
    const value = parameters[key]?.defaultValue?.value;
    if (typeof value !== 'string' || !value.trim()) throw new Error(`MISSING PARAMETER ${key}`);
    return value;
  };

  const eulaUrl = readEulaUrl();
  const exportEula = param('eula_url');
  if (exportEula !== eulaUrl) {
    throw new Error(`eula_url mismatch: export has ${exportEula}, eula/index.html has ${eulaUrl}`);
  }

  const chrome = loadChrome();
  const strings = {
    en: JSON.parse(readFileSync(join(ROOT, 'assets/data/strings.en.json'), 'utf8')),
    tr: JSON.parse(readFileSync(join(ROOT, 'assets/data/strings.tr.json'), 'utf8')),
  };

  const pages = DOCUMENTS.map((doc) => {
    const source = param(doc.key);
    const body = normaliseDocument(source);
    const page = composePage({ ...doc, body, strings: strings[doc.locale], chrome });
    return { ...doc, path: outputPath(doc), page, checks: pageChecks({ page, source, ...doc }) };
  });

  log(`eula_url matches eula/index.html: ${eulaUrl}`);
  let failed = false;
  for (const p of pages) {
    printChecks(log, p.path, p.checks);
    if (Object.values(p.checks).some((v) => v !== true)) failed = true;
  }
  if (failed) throw new Error('sanity checks failed; nothing written');

  for (const p of pages) {
    const file = join(outDir, p.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, p.page);
    log(`${p.path} written.`);
  }
  return pages.map((p) => p.path);
}

export function main(argv) {
  try {
    build({ exportPath: argv[0] });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
