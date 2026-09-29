#!/usr/bin/env node
// build-guides.mjs: generates the guide pages and both guide index pages from
// content/guides/<en-slug>.<en|tr>.html (KTD8).
//
// Fragment format: the file opens with an HTML comment holding a JSON header, then the body.
//
//   <!--guide
//   {
//     "slug": { "en": "daily-step-goal", "tr": "gunluk-adim-hedefi" },
//     "ctPage": "g-steps",              campaign page id: ct = <locale>-<ctPage>-<placement>, max 40 chars
//     "order": 1,                       position on the index pages
//     "title": "...", "description": "...",
//     "lastReviewed": "2026-09-29",
//     "coach": { "title": "...", "line": "...", "body": "..." },   line follows the app's Coach rules
//     "sources": [{ "title": "...", "url": "https://..." }],
//     "tool": "steps-distance"          optional; the body then holds exactly one div.guide-tool
//   }
//   -->
//   <p>Answer first.</p> ...
//
// The header is stripped before output. Both locales of a guide must exist and agree on slug,
// ctPage, order and tool. The builder renders the h1 from the title, so the body carries none.
//
//   npm run build   (or: node tools/build-guides.mjs)

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TOP_LEVEL_ALLOWLIST, assertClean } from './build-legal.mjs';
import {
  LOCALES, LOCALE_PATHS, SITE, composePage, escapeAttr, escapeText, fontPreloads, hashAssetRefs, storeUrl,
} from './lib/page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = join(ROOT, 'content/guides');
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EM_DASH = '—';

const { h1: _legalTitle, ...LEGAL_WITHOUT_H1 } = TOP_LEVEL_ALLOWLIST;
export const GUIDE_ALLOWLIST = {
  ...LEGAL_WITHOUT_H1,
  h3: [''],
  ol: [''],
  div: [...TOP_LEVEL_ALLOWLIST.div, 'guide-tool'],
};

// Client-side tools a guide may embed; the module is loaded only on that guide's pages.
export const TOOLS = {
  'steps-distance': 'assets/js/tools/steps-distance.js',
};

const STYLESHEETS = ['tokens', 'base', 'layout', 'components', 'guide'].map((name) => `/assets/css/${name}.css`);
const BADGE_SIZE = { en: { width: 120, height: 40 }, tr: { width: 151, height: 40 } };
const INDEX_CT_PAGE = 'guides';

export const guidePath = (locale, slug) => `${LOCALE_PATHS[locale].guides}${slug}/`;
export const indexPath = (locale) => LOCALE_PATHS[locale].guides;
const fileFor = (urlPath) => `${urlPath.replace(/^\//, '')}index.html`;

export const outputPaths = (guides) => [
  ...guides.flatMap((g) => LOCALES.map((l) => fileFor(guidePath(l, g.en.meta.slug[l])))),
  ...LOCALES.map((l) => fileFor(indexPath(l))),
];

// The app's Coach output rules (R9): under 12 words, at most one number, opens with a word.
export function assertCoachLine(line, label) {
  if (typeof line !== 'string' || !line.trim()) throw new Error(`${label}: coach.line is required`);
  if (line.trim().split(/\s+/).length >= 12) throw new Error(`${label}: coach.line must stay under 12 words`);
  if ((line.match(/\d[\d.,]*/g) || []).length > 1) throw new Error(`${label}: coach.line may carry at most one number`);
  if (!/^\p{L}/u.test(line.trim())) throw new Error(`${label}: coach.line must open with a word`);
}

const isText = (v) => typeof v === 'string' && v.trim() !== '';

function validateMeta(meta, locale, file) {
  const need = (ok, msg) => { if (!ok) throw new Error(`${file}: ${msg}`); };
  need(meta && typeof meta === 'object', 'header must be a JSON object');
  need(meta.slug && LOCALES.every((l) => SEGMENT.test(meta.slug[l] ?? '')), 'slug.en and slug.tr must be lowercase-dashed segments');
  need(SEGMENT.test(meta.ctPage ?? ''), 'ctPage must be a lowercase-dashed segment');
  try { storeUrl(locale, meta.ctPage, 'banner'); } catch (e) { throw new Error(`${file}: ctPage: ${e.message}`); }
  need(Number.isFinite(meta.order), 'order must be a number');
  need(isText(meta.title), 'title is required');
  need(isText(meta.description) && meta.description.length <= 180, 'description is required (180 characters max)');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(meta.lastReviewed ?? '') ? new Date(`${meta.lastReviewed}T00:00:00Z`) : null;
  need(date && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === meta.lastReviewed,
    'lastReviewed must be a YYYY-MM-DD date');
  need(Array.isArray(meta.sources) && meta.sources.length > 0, 'sources must list at least one primary source');
  meta.sources.forEach((s, i) => {
    need(s && isText(s.title) && /^https:\/\/[^\s"<>]+$/.test(s.url ?? ''), `sources[${i}] needs a title and an https url`);
  });
  need(meta.coach && isText(meta.coach.title) && isText(meta.coach.body), 'coach.title and coach.body are required');
  assertCoachLine(meta.coach.line, file);
  need(meta.tool === undefined || Object.hasOwn(TOOLS, meta.tool), `unknown tool "${meta.tool}"`);
}

export function parseGuide(source, file = 'guide') {
  if (source.includes(EM_DASH)) throw new Error(`${file}: em dash (U+2014) is not allowed in guide text`);
  const locale = /\.(en|tr)\.html$/.exec(file)?.[1] ?? 'en';
  const header = /^\s*<!--guide\s*([\s\S]*?)-->[ \t]*\n?/.exec(source);
  if (!header) throw new Error(`${file}: missing the <!--guide {...} --> JSON header`);
  let meta;
  try { meta = JSON.parse(header[1]); } catch (e) { throw new Error(`${file}: header is not valid JSON (${e.message})`); }
  validateMeta(meta, locale, file);

  const body = source.slice(header[0].length).replace(/\s+$/, '');
  if (/\sstyle=/.test(body)) throw new Error(`${file}: inline style attributes are not allowed`);
  try { assertClean(body, GUIDE_ALLOWLIST); } catch (e) { throw new Error(`${file}: ${e.message}`); }
  const tools = (body.match(/<div class="guide-tool"/g) || []).length;
  if (meta.tool && tools !== 1) throw new Error(`${file}: a tool guide needs exactly one div.guide-tool, found ${tools}`);
  if (!meta.tool && tools !== 0) throw new Error(`${file}: div.guide-tool needs a "tool" in the header`);
  return { locale, meta, body };
}

// Reads every <en-slug>.<locale>.html pair, validated and sorted by `order`.
export function loadGuides(contentDir = CONTENT_DIR) {
  if (!existsSync(contentDir)) throw new Error(`guides content not found: ${contentDir}`);
  const groups = new Map();
  for (const name of readdirSync(contentDir).sort()) {
    const m = /^([a-z0-9-]+)\.(en|tr)\.html$/.exec(name);
    if (!m) continue;
    const parsed = parseGuide(readFileSync(join(contentDir, name), 'utf8'), name);
    if (!groups.has(m[1])) groups.set(m[1], {});
    groups.get(m[1])[m[2]] = parsed;
  }
  const guides = [];
  for (const [base, pair] of groups) {
    for (const l of LOCALES) if (!pair[l]) throw new Error(`guide "${base}" has no ${l} file (${base}.${l}.html)`);
    const { en, tr } = pair;
    if (base !== en.meta.slug.en) throw new Error(`guide "${base}": file name must be the EN slug "${en.meta.slug.en}"`);
    if (JSON.stringify(en.meta.slug) !== JSON.stringify(tr.meta.slug)) throw new Error(`guide "${base}": EN and TR slug headers differ`);
    for (const key of ['ctPage', 'order', 'tool']) {
      if (en.meta[key] !== tr.meta[key]) throw new Error(`guide "${base}": EN and TR ${key} differ`);
    }
    guides.push(pair);
  }
  for (const key of ['ctPage', 'order']) {
    const seen = guides.map((g) => g.en.meta[key]);
    if (new Set(seen).size !== seen.length) throw new Error(`guides: duplicate ${key}`);
  }
  return guides.sort((a, b) => a.en.meta.order - b.en.meta.order);
}

const reindent = (html) => {
  const lines = html.replace(/^\s*\n|\s+$/g, '').split('\n');
  const common = Math.min(...lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)[0].length));
  return lines.map((l) => (l.trim() ? l.slice(common) : '')).join('\n');
};
const indent = (html, pad) => html.split('\n').map((l) => (l ? pad + l : l)).join('\n');

export const formatDate = (iso, locale) =>
  new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));

function reviewedLine(template, iso, locale) {
  const [before, after = ''] = template.split('{date}');
  return `${escapeText(before)}<time datetime="${iso}">${escapeText(formatDate(iso, locale))}</time>${escapeText(after)}`;
}

function coachCta({ locale, ctPage, coach, strings }) {
  const { width, height } = BADGE_SIZE[locale];
  return `<aside class="guide-cta" aria-labelledby="guide-cta-title">
  <p class="guide-cta__label">${escapeText(strings.guides.coachLabel)}</p>
  <h2 id="guide-cta-title">${escapeText(coach.title)}</h2>
  <p class="guide-cta__line">${escapeText(coach.line)}</p>
  <p class="guide-cta__body">${escapeText(coach.body)}</p>
  <a class="store-badge" href="${escapeAttr(storeUrl(locale, ctPage, 'cta'))}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(strings.nav.ctaAria)}">
    <img src="/images/badge-appstore-${locale}.svg" alt="" width="${width}" height="${height}" />
  </a>
</aside>`;
}

function guideBody({ locale, meta, body, strings }) {
  const g = strings.guides;
  const sources = meta.sources
    .map((s) => `      <li><a href="${escapeAttr(s.url)}" rel="noopener noreferrer">${escapeText(s.title)}</a></li>`)
    .join('\n');
  return `<article class="guide">
  <header class="guide__header">
    <p class="guide__crumb"><a href="${indexPath(locale)}">${escapeText(g.breadcrumb)}</a></p>
    <h1>${escapeText(meta.title)}</h1>
  </header>
  <div class="guide__body">
${indent(reindent(body), '    ')}
  </div>
  <section class="guide-sources" aria-labelledby="guide-sources-title">
    <h2 id="guide-sources-title">${escapeText(g.sources)}</h2>
    <ol>
${sources}
    </ol>
    <p class="guide-sources__reviewed">${reviewedLine(g.lastReviewed, meta.lastReviewed, locale)}</p>
    <p class="guide-sources__note">${escapeText(g.note)}</p>
  </section>
${indent(coachCta({ locale, ctPage: meta.ctPage, coach: meta.coach, strings }), '  ')}
</article>`;
}

function indexBody({ locale, guides, strings }) {
  const g = strings.guides;
  const items = guides.map(({ [locale]: { meta } }) => `    <li class="guide-list__item">
      <h2 class="guide-list__title"><a class="guide-list__link" href="${guidePath(locale, meta.slug[locale])}">${escapeText(meta.title)}</a></h2>
      <p class="guide-list__desc">${escapeText(meta.description)}</p>
    </li>`).join('\n');
  return `<section class="guides-index">
  <header class="guide__header">
    <h1>${escapeText(g.indexTitle)}</h1>
    <p class="guide__intro">${escapeText(g.indexIntro)}</p>
  </header>
  <ul class="guide-list">
${items}
  </ul>
${indent(coachCta({ locale, ctPage: INDEX_CT_PAGE, coach: g.indexCoach, strings }), '  ')}
</section>`;
}

const articleJsonLd = ({ locale, meta, url }) => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: meta.title,
  description: meta.description,
  inLanguage: locale,
  dateModified: meta.lastReviewed,
  mainEntityOfPage: url,
  author: { '@type': 'Organization', name: 'Velora', url: `${SITE}/` },
  publisher: { '@type': 'Organization', name: 'Velora', url: `${SITE}/` },
  citation: meta.sources.map((s) => s.url),
});

function renderPage({ locale, ctPage, strings, title, description, alternates, body, modules, jsonLd, rootDir }) {
  const html = composePage({
    locale,
    page: ctPage,
    strings,
    bodyAttrs: { 'data-page': 'guide' },
    head: {
      title,
      description,
      canonicalPath: alternates[locale],
      alternates,
      ogImage: '/images/og.jpg',
      bannerPage: ctPage,
      preloads: fontPreloads(rootDir),
      stylesheets: STYLESHEETS,
      modules,
      jsonLd,
    },
    body,
  });
  return hashAssetRefs(html, rootDir);
}

export function composeGuidePage({ locale, guide, strings, rootDir = ROOT }) {
  const { meta, body } = guide[locale];
  const alternates = { en: guidePath('en', meta.slug.en), tr: guidePath('tr', meta.slug.tr) };
  return renderPage({
    locale,
    ctPage: meta.ctPage,
    strings,
    title: `${meta.title}${strings.guides.titleSuffix}`,
    description: meta.description,
    alternates,
    body: guideBody({ locale, meta, body, strings }),
    modules: ['/assets/js/boot.js', ...(meta.tool ? [`/${TOOLS[meta.tool]}`] : [])],
    jsonLd: articleJsonLd({ locale, meta, url: `${SITE}${alternates[locale]}` }),
    rootDir,
  });
}

export function composeIndexPage({ locale, guides, strings, rootDir = ROOT }) {
  return renderPage({
    locale,
    ctPage: INDEX_CT_PAGE,
    strings,
    title: strings.guides.indexMetaTitle,
    description: strings.guides.indexDescription,
    alternates: { en: indexPath('en'), tr: indexPath('tr') },
    body: indexBody({ locale, guides, strings }),
    modules: ['/assets/js/boot.js'],
    rootDir,
  });
}

const count = (html, re) => (html.match(re) || []).length;

export function pageChecks({ page, locale, canonicalPath, ctPage }) {
  return {
    'exactly one h1': count(page, /<h1\b/g) === 1,
    'data-locale matches lang': page.includes(`<html lang="${locale}" data-locale="${locale}">`),
    'canonical matches path': page.includes(`<link rel="canonical" href="${SITE}${canonicalPath}" />`),
    'hreflang pair present': count(page, /<link rel="alternate" hreflang="(?:en|tr|x-default)"/g) === 3,
    'cta carries its campaign': page.includes(`ct=${locale}-${ctPage}-cta&amp;mt=8`),
    'locale badge': page.includes(`src="/images/badge-appstore-${locale}.svg?v=`),
    'no em dash': !page.includes(EM_DASH),
    'no unresolved placeholder': !/\{date\}|\{\{/.test(page),
    'no inline style': !/\sstyle=/.test(page),
    'no external asset': ![...page.matchAll(/\ssrc="([^"]+)"|<link rel="(?:stylesheet|preload)" href="([^"]+)"/g)]
      .some((m) => !(m[1] ?? m[2]).startsWith('/')),
  };
}

function loadStrings(rootDir) {
  const strings = {};
  for (const l of LOCALES) {
    strings[l] = JSON.parse(readFileSync(join(rootDir, `assets/data/strings.${l}.json`), 'utf8'));
    const g = strings[l].guides;
    if (!g) throw new Error(`strings.${l}.json has no "guides" object`);
    if (JSON.stringify(g).includes(EM_DASH)) throw new Error(`strings.${l}.json guides: em dash (U+2014) is not allowed`);
    assertCoachLine(g.indexCoach?.line, `strings.${l}.json guides.indexCoach`);
  }
  return strings;
}

// Validates and composes every page first; writes only when every sanity check passes.
export function build({ outDir = ROOT, contentDir = CONTENT_DIR, rootDir = ROOT, log = console.log } = {}) {
  const strings = loadStrings(rootDir);
  const guides = loadGuides(contentDir);

  const pages = [];
  for (const guide of guides) {
    for (const locale of LOCALES) {
      const { meta } = guide[locale];
      const canonicalPath = guidePath(locale, meta.slug[locale]);
      const page = composeGuidePage({ locale, guide, strings: strings[locale], rootDir });
      pages.push({ path: fileFor(canonicalPath), page, checks: pageChecks({ page, locale, canonicalPath, ctPage: meta.ctPage }) });
    }
  }
  for (const locale of LOCALES) {
    const canonicalPath = indexPath(locale);
    const page = composeIndexPage({ locale, guides, strings: strings[locale], rootDir });
    pages.push({ path: fileFor(canonicalPath), page, checks: pageChecks({ page, locale, canonicalPath, ctPage: INDEX_CT_PAGE }) });
  }

  let failed = false;
  for (const p of pages) {
    for (const [k, v] of Object.entries(p.checks)) {
      log(`${v ? 'ok  ' : 'FAIL'} ${p.path}: ${k}`);
      if (!v) failed = true;
    }
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

export function main() {
  try {
    build();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
