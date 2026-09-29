#!/usr/bin/env node
// build-legal.mjs: generates the four legal pages from content/legal/*.html.
//
// Workflow: edit a fragment under content/legal/, then:
//   node tools/build-legal.mjs
// review the diff and commit privacy-policy/, terms-of-service/ and their tr/ siblings.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  LOCALE_PATHS, PARTIALS_DIR, SITE, composePage as composeSitePage, fontPreloads, hashAssetRefs,
} from './lib/page.mjs';
import { EM_DASH, count, indent, reindent, reportChecks } from './lib/util.mjs';
import { BASE_ALLOWLIST, assertClean as assertAllowlisted } from './lib/validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = join(ROOT, 'content/legal');

const DOCUMENTS = [
  { locale: 'en', kind: 'privacy' },
  { locale: 'tr', kind: 'privacy' },
  { locale: 'en', kind: 'terms' },
  { locale: 'tr', kind: 'terms' },
];
const SLUGS = { privacy: 'privacy-policy', terms: 'terms-of-service' };
const PREFIX = { en: '', tr: '/tr' };

export const outputPath = ({ locale, kind }) => `${locale === 'tr' ? 'tr/' : ''}${SLUGS[kind]}/index.html`;
export const OUTPUT_PATHS = DOCUMENTS.map(outputPath);
export const sourcePath = ({ locale, kind }) => `content/legal/${SLUGS[kind]}.${locale}.html`;
export const SOURCE_PATHS = DOCUMENTS.map(sourcePath);

export const TOP_LEVEL_ALLOWLIST = { h1: [''], ...BASE_ALLOWLIST };

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

// Legal fragments use the legal allowlist unless a caller passes another one.
export const assertClean = (html, allowlist = TOP_LEVEL_ALLOWLIST) =>
  assertAllowlisted(html, allowlist, { text: 'user-facing legal' });

// Strips the file's leading `Source of truth` comment before any check or output.
export function normaliseDocument(source) {
  const stripped = source.replace(/^\s*<!--[\s\S]*?-->\s*\n?/, '');
  const body = wrapTables(stripInlineStyles(stripped));
  assertClean(body);
  return body;
}

const STYLESHEETS = ['tokens', 'base', 'layout', 'components', 'legal'].map((name) => `/assets/css/${name}.css`);
const MODULES = ['/assets/js/boot.js'];
const CT_PAGE = 'legal';

// Chrome (skip link, nav, footer) comes from tools/partials via the shared page library.
export function composePage({ locale, kind, body, strings, partialsDir = PARTIALS_DIR, rootDir = ROOT }) {
  const alternates = { en: LOCALE_PATHS.en[kind], tr: LOCALE_PATHS.tr[kind] };
  const html = composeSitePage({
    locale,
    page: CT_PAGE,
    strings,
    partialsDir,
    bodyAttrs: { 'data-page': 'legal' },
    head: {
      title: strings.legal[kind].title,
      description: strings.legal[kind].description,
      canonicalPath: alternates[locale],
      alternates,
      preloads: fontPreloads(rootDir),
      stylesheets: STYLESHEETS,
      modules: MODULES,
    },
    body: `<article class="legal">\n${indent(reindent(body), '  ')}\n</article>`,
  });
  return hashAssetRefs(html, rootDir);
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

export function pageChecks({ page, source, locale, kind }) {
  const slug = SLUGS[kind];
  const prefix = PREFIX[locale];
  const article = /<article class="legal">([\s\S]*?)<\/article>/.exec(page)?.[1] ?? '';
  let allowlist = true;
  // Em dashes are stripped here so the dedicated `no em dash` row below is the only one reporting them.
  try { assertClean(article.replaceAll(EM_DASH, '')); } catch (e) { allowlist = e.message; }
  return {
    'exactly one h1': count(page, /<h1\b/g) === 1,
    'no unresolved placeholder': !page.includes('\\('),
    'no inline style': !/\sstyle=/.test(page),
    'no script/style in article': !/<(script|style)\b/i.test(article),
    'h2 count matches source': count(article, /<h2\b/g) === count(source, /<h2\b/g),
    'top-level allowlist': allowlist,
    'no em dash': !article.includes(EM_DASH),
    'no bare legal href': !/href="(privacy-policy|terms-of-service)\//.test(page),
    'no bare asset path': !/(?:href|src)="(?:assets|images)\//.test(page),
    'brand href is locale home': page.includes(`<a href="${prefix}/" class="brand-mark"`),
    'data-locale matches lang': page.includes(`<html lang="${locale}" data-locale="${locale}">`),
    'canonical ends with slug': page.includes(`<link rel="canonical" href="${SITE}${prefix}/${slug}/" />`),
  };
}

// Builds all four pages from content/legal/*.html and prints the sanity table before writing.
export function build({ outDir = ROOT, contentDir = CONTENT_DIR, partialsDir = PARTIALS_DIR, log = console.log } = {}) {
  const eulaUrl = readEulaUrl();
  const strings = {
    en: JSON.parse(readFileSync(join(ROOT, 'assets/data/strings.en.json'), 'utf8')),
    tr: JSON.parse(readFileSync(join(ROOT, 'assets/data/strings.tr.json'), 'utf8')),
  };

  const pages = DOCUMENTS.map((doc) => {
    const file = join(contentDir, `${SLUGS[doc.kind]}.${doc.locale}.html`);
    if (!existsSync(file)) throw new Error(`source not found: ${file}`);
    const source = readFileSync(file, 'utf8');
    const body = normaliseDocument(source);
    const page = composePage({ ...doc, body, strings: strings[doc.locale], partialsDir });
    return { ...doc, path: outputPath(doc), page, checks: pageChecks({ page, source, ...doc }) };
  });

  log(`eula_url is consistent in eula/index.html: ${eulaUrl}`);
  reportChecks(pages, log);

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
    build();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
