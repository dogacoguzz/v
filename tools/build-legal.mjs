#!/usr/bin/env node
// build-legal.mjs — generates the four legal pages from content/legal/*.html.
//
// Workflow: edit a fragment under content/legal/, then:
//   node tools/build-legal.mjs
// review the diff and commit privacy-policy/, terms-of-service/ and their tr/ siblings.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyI18nStrings, markLangSwitch, rewriteRootRelativePaths } from './lib/prerender.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://velorahealthcompanion.com';
const CONTENT_DIR = join(ROOT, 'content/legal');

const DOCUMENTS = [
  { locale: 'en', kind: 'privacy' },
  { locale: 'tr', kind: 'privacy' },
  { locale: 'en', kind: 'terms' },
  { locale: 'tr', kind: 'terms' },
];
const SLUGS = { privacy: 'privacy-policy', terms: 'terms-of-service' };
const OG_LOCALES = { en: 'en_US', tr: 'tr_TR' };
const PREFIX = { en: '', tr: '/tr' };

export const outputPath = ({ locale, kind }) => `${locale === 'tr' ? 'tr/' : ''}${SLUGS[kind]}/index.html`;
export const OUTPUT_PATHS = DOCUMENTS.map(outputPath);
export const sourcePath = ({ locale, kind }) => `content/legal/${SLUGS[kind]}.${locale}.html`;
export const SOURCE_PATHS = DOCUMENTS.map(sourcePath);

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
export function assertClean(html, { allowEmDash = false } = {}) {
  const placeholder = /\\\([^)]*\)?/.exec(html);
  if (placeholder) throw new Error(`assertClean: unresolved placeholder ${placeholder[0]}`);
  const embedded = /<(script|style)\b/i.exec(html);
  if (embedded) throw new Error(`assertClean: embedded <${embedded[1].toLowerCase()}> element is not allowed`);
  // TEMPORARY: allowEmDash bypasses this guard only for the byte-preserving seed round-trip.
  if (!allowEmDash && html.includes('—')) {
    throw new Error('assertClean: em dash (U+2014) is not allowed in user-facing legal text');
  }

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

// Strips the file's leading `Source of truth` comment before any check or output.
export function normaliseDocument(source, { allowEmDash = false } = {}) {
  const stripped = source.replace(/^\s*<!--[\s\S]*?-->\s*\n?/, '');
  const body = wrapTables(stripInlineStyles(stripped));
  assertClean(body, { allowEmDash });
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

// eula/index.html carries the URL three times; all copies must agree with each other.
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

export function pageChecks({ page, source, locale, kind, allowEmDash = false }) {
  const slug = SLUGS[kind];
  const prefix = PREFIX[locale];
  const article = /<article class="legal">([\s\S]*?)<\/article>/.exec(page)?.[1] ?? '';
  let allowlist = true;
  try { assertClean(article, { allowEmDash: true }); } catch (e) { allowlist = e.message; }
  return {
    'exactly one h1': count(page, /<h1\b/g) === 1,
    'no unresolved placeholder': !page.includes('\\('),
    'no inline style': !/\sstyle=/.test(page),
    'no script/style in article': !/<(script|style)\b/i.test(article),
    'h2 count matches source': count(article, /<h2\b/g) === count(source, /<h2\b/g),
    'top-level allowlist': allowlist,
    'no em dash': allowEmDash || !article.includes('—'),
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

// Builds all four pages from content/legal/*.html and prints the sanity table before writing.
export function build({ outDir = ROOT, contentDir = CONTENT_DIR, log = console.log, allowEmDash = false } = {}) {
  const eulaUrl = readEulaUrl();
  const chrome = loadChrome();
  const strings = {
    en: JSON.parse(readFileSync(join(ROOT, 'assets/data/strings.en.json'), 'utf8')),
    tr: JSON.parse(readFileSync(join(ROOT, 'assets/data/strings.tr.json'), 'utf8')),
  };

  const pages = DOCUMENTS.map((doc) => {
    const file = join(contentDir, `${SLUGS[doc.kind]}.${doc.locale}.html`);
    if (!existsSync(file)) throw new Error(`source not found: ${file}`);
    const source = readFileSync(file, 'utf8');
    const body = normaliseDocument(source, { allowEmDash });
    const page = composePage({ ...doc, body, strings: strings[doc.locale], chrome });
    return { ...doc, path: outputPath(doc), page, checks: pageChecks({ page, source, allowEmDash, ...doc }) };
  });

  log(`eula_url is consistent in eula/index.html: ${eulaUrl}`);
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
  if (argv.length) {
    console.error('usage: node tools/build-legal.mjs (no arguments; edit content/legal/*.html instead)');
    process.exit(1);
    return;
  }
  try {
    build({ allowEmDash: process.env.LEGAL_ALLOW_EM_DASH === '1' });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
