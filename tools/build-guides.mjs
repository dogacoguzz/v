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
//     "datePublished": "2026-09-29", "lastReviewed": "2026-09-29",
//     "coach": { "title": "...", "line": "...", "body": "..." },   line follows the app's Coach rules
//     "pro": true,                      optional; the CTA shows a Pro (paid Coach) moment and carries the badge
//     "related": ["how-much-water"],    optional; 2 or 3 EN slugs of other guides
//     "sources": [{ "title": "...", "url": "https://..." }],
//     "tool": "steps-distance"          optional; the body then holds exactly one div.guide-tool
//   }
//   -->
//   <p>Answer first.</p> ...
//
// The header is stripped before output. Both locales of a guide must exist and agree on slug,
// ctPage, order, tool, pro, related and datePublished. The builder renders the h1 from the title, so the body carries none.
//
//   npm run build   (or: node tools/build-guides.mjs)

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  APP_NAME, LOCALES, LOCALE_PATHS, ORG_ID, SITE, WEBSITE_ID, composePage, organization, escapeAttr, escapeText, fontPreloads, hashAssetRefs, hashedAssetPath,
  storeUrl,
} from './lib/page.mjs';
import { EM_DASH, SEGMENT, count, indent, reindent, reportChecks } from './lib/util.mjs';
import { BASE_ALLOWLIST, assertClean } from './lib/validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = join(ROOT, 'content/guides');

// The builder renders the h1 itself, so guide bodies get no h1.
export const GUIDE_ALLOWLIST = {
  ...BASE_ALLOWLIST,
  h3: [''],
  ol: [''],
  div: [...BASE_ALLOWLIST.div, 'guide-tool'],
};

// Client-side tools a guide may embed; the module is loaded only on that guide's pages.
export const TOOLS = {
  'steps-distance': 'assets/js/tools/steps-distance.js',
};

const STYLESHEETS = ['tokens', 'base', 'layout', 'components', 'guide'].map((name) => `/assets/css/${name}.css`);
const BADGE_SIZE = { en: { width: 120, height: 40 }, tr: { width: 151, height: 40 } };
const INDEX_CT_PAGE = 'guides';
const OG_IMAGE = '/images/og.jpg';

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
const isDate = (v) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? new Date(`${v}T00:00:00Z`) : null;
  return !!d && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

function validateMeta(meta, locale, file) {
  const need = (ok, msg) => { if (!ok) throw new Error(`${file}: ${msg}`); };
  need(meta && typeof meta === 'object', 'header must be a JSON object');
  need(meta.slug && LOCALES.every((l) => SEGMENT.test(meta.slug[l] ?? '')), 'slug.en and slug.tr must be lowercase-dashed segments');
  need(SEGMENT.test(meta.ctPage ?? ''), 'ctPage must be a lowercase-dashed segment');
  try { storeUrl(locale, meta.ctPage, 'banner'); } catch (e) { throw new Error(`${file}: ctPage: ${e.message}`); }
  need(Number.isFinite(meta.order), 'order must be a number');
  need(isText(meta.title), 'title is required');
  need(isText(meta.description) && meta.description.length <= 180, 'description is required (180 characters max)');
  need(isDate(meta.lastReviewed), 'lastReviewed must be a YYYY-MM-DD date');
  need(isDate(meta.datePublished) && meta.datePublished <= meta.lastReviewed,
    'datePublished must be a YYYY-MM-DD date on or before lastReviewed');
  need(Array.isArray(meta.sources) && meta.sources.length > 0, 'sources must list at least one primary source');
  meta.sources.forEach((s, i) => {
    need(s && isText(s.title) && /^https:\/\/[^\s"<>]+$/.test(s.url ?? ''), `sources[${i}] needs a title and an https url`);
  });
  need(meta.coach && isText(meta.coach.title) && isText(meta.coach.body), 'coach.title and coach.body are required');
  assertCoachLine(meta.coach.line, file);
  need(meta.tool === undefined || Object.hasOwn(TOOLS, meta.tool), `unknown tool "${meta.tool}"`);
  need(meta.pro === undefined || typeof meta.pro === 'boolean', 'pro must be true or false');
  need(meta.related === undefined || (Array.isArray(meta.related) && meta.related.length >= 2 && meta.related.length <= 3
    && meta.related.every((slug) => SEGMENT.test(slug ?? ''))), 'related must list 2 or 3 guide slugs');
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
  try { assertClean(body, GUIDE_ALLOWLIST, { text: 'guide' }); } catch (e) { throw new Error(`${file}: ${e.message}`); }
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
    for (const key of ['ctPage', 'order', 'tool', 'pro', 'related', 'datePublished']) {
      if (JSON.stringify(en.meta[key]) !== JSON.stringify(tr.meta[key])) throw new Error(`guide "${base}": EN and TR ${key} differ`);
    }
    guides.push(pair);
  }
  const slugs = new Set(guides.map((g) => g.en.meta.slug.en));
  for (const { en: { meta } } of guides) {
    for (const slug of meta.related ?? []) {
      if (slug === meta.slug.en || !slugs.has(slug)) throw new Error(`guide "${meta.slug.en}": related "${slug}" is not another guide`);
    }
    if (new Set(meta.related ?? []).size !== (meta.related ?? []).length) throw new Error(`guide "${meta.slug.en}": related lists a guide twice`);
  }
  for (const key of ['ctPage', 'order']) {
    const seen = guides.map((g) => g.en.meta[key]);
    if (new Set(seen).size !== seen.length) throw new Error(`guides: duplicate ${key}`);
  }
  return guides.sort((a, b) => a.en.meta.order - b.en.meta.order);
}

export const formatDate = (iso, locale) =>
  new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));

function reviewedLine(template, iso, locale) {
  const [before, after = ''] = template.split('{date}');
  return `${escapeText(before)}<time datetime="${iso}">${escapeText(formatDate(iso, locale))}</time>${escapeText(after)}`;
}

function coachCta({ locale, ctPage, coach, pro = false, strings }) {
  const { width, height } = BADGE_SIZE[locale];
  const badge = pro ? ` <span class="pro-badge">${escapeText(strings.pro.badge)}</span>` : '';
  return `<aside class="guide-cta" aria-labelledby="guide-cta-title">
  <p class="guide-cta__label">${escapeText(strings.guides.coachLabel)}${badge}</p>
  <h2 id="guide-cta-title">${escapeText(coach.title)}</h2>
  <p class="guide-cta__line">${escapeText(coach.line)}</p>
  <p class="guide-cta__body">${escapeText(coach.body)}</p>
  <a class="store-badge" href="${escapeAttr(storeUrl(locale, ctPage, 'cta'))}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(strings.nav.ctaAria)}">
    <img src="/images/badge-appstore-${locale}.svg" alt="" width="${width}" height="${height}" />
  </a>
</aside>`;
}

function relatedGuides({ locale, meta, guides, strings }) {
  if (!meta.related?.length) return '';
  const items = meta.related.map((slug) => {
    const { meta: other } = guides.find((g) => g.en.meta.slug.en === slug)[locale];
    return `    <li><a href="${guidePath(locale, other.slug[locale])}">${escapeText(other.title)}</a></li>`;
  }).join('\n');
  return `<section class="guide-related" aria-labelledby="guide-related-title">
  <h2 id="guide-related-title">${escapeText(strings.guides.related)}</h2>
  <ul>
${items}
  </ul>
</section>`;
}

function guideBody({ locale, meta, body, guides, strings }) {
  const g = strings.guides;
  const related = relatedGuides({ locale, meta, guides, strings });
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
${related ? `${indent(related, '  ')}\n` : ''}${indent(coachCta({ locale, ctPage: meta.ctPage, coach: meta.coach, pro: meta.pro, strings }), '  ')}
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

const breadcrumb = (locale, strings, crumbs) => ({
  '@type': 'BreadcrumbList',
  itemListElement: [
    { name: 'Velora', path: LOCALE_PATHS[locale].home },
    { name: strings.guides.breadcrumb, path: indexPath(locale) },
    ...crumbs,
  ].map(({ name, path }, i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${path}` })),
});

const articleJsonLd = ({ locale, meta, path, image, strings }) => ({
  '@context': 'https://schema.org',
  '@graph': [
    organization(locale),
    {
      '@type': 'Article',
      headline: meta.title,
      description: meta.description,
      inLanguage: locale,
      datePublished: meta.datePublished,
      dateModified: meta.lastReviewed,
      image: `${SITE}${image}`,
      mainEntityOfPage: `${SITE}${path}`,
      author: { '@id': ORG_ID },
      publisher: { '@id': ORG_ID },
      citation: meta.sources.map((s) => s.url),
    },
    breadcrumb(locale, strings, [{ name: meta.title, path }]),
  ],
});

const indexJsonLd = ({ locale, guides, strings }) => ({
  '@context': 'https://schema.org',
  '@graph': [
    organization(locale),
    {
      '@type': 'CollectionPage',
      '@id': `${SITE}${indexPath(locale)}`,
      url: `${SITE}${indexPath(locale)}`,
      name: strings.guides.indexTitle,
      description: strings.guides.indexDescription,
      inLanguage: locale,
      isPartOf: { '@id': WEBSITE_ID },
      publisher: { '@id': ORG_ID },
      hasPart: guides.map(({ [locale]: { meta } }) => ({
        '@type': 'Article',
        headline: meta.title,
        url: `${SITE}${guidePath(locale, meta.slug[locale])}`,
      })),
    },
    breadcrumb(locale, strings, []),
  ],
});

function renderPage({ locale, ctPage, strings, title, description, alternates, body, modules, jsonLd, rootDir }) {
  const ogImage = hashedAssetPath(OG_IMAGE, rootDir);
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
      ogImage,
      bannerPage: ctPage,
      preloads: fontPreloads(rootDir),
      stylesheets: STYLESHEETS,
      modules,
      jsonLd: jsonLd(ogImage),
    },
    body,
  });
  return hashAssetRefs(html, rootDir);
}

export function composeGuidePage({ locale, guide, guides = [guide], strings, rootDir = ROOT }) {
  const { meta, body } = guide[locale];
  const alternates = { en: guidePath('en', meta.slug.en), tr: guidePath('tr', meta.slug.tr) };
  return renderPage({
    locale,
    ctPage: meta.ctPage,
    strings,
    title: `${meta.title}${strings.guides.titleSuffix}`,
    description: meta.description,
    alternates,
    body: guideBody({ locale, meta, body, guides, strings }),
    modules: ['/assets/js/boot.js', ...(meta.tool ? [`/${TOOLS[meta.tool]}`] : [])],
    jsonLd: (image) => articleJsonLd({ locale, meta, path: alternates[locale], image, strings }),
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
    jsonLd: () => indexJsonLd({ locale, guides, strings }),
    rootDir,
  });
}

const ldTypes = (page) => {
  try {
    return JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page)?.[1])['@graph'].map((n) => n['@type']);
  } catch (_) {
    return [];
  }
};

export function pageChecks({ page, locale, canonicalPath, ctPage, ld }) {
  return {
    'JSON-LD graph types': JSON.stringify(ldTypes(page)) === JSON.stringify(ld) || `got ${ldTypes(page).join(', ')}`,
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
    if (!isText(strings[l].pro?.badge)) throw new Error(`strings.${l}.json has no pro.badge`);
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
      const page = composeGuidePage({ locale, guide, guides, strings: strings[locale], rootDir });
      const ld = ['Organization', 'Article', 'BreadcrumbList'];
      pages.push({ path: fileFor(canonicalPath), page, checks: pageChecks({ page, locale, canonicalPath, ctPage: meta.ctPage, ld }) });
    }
  }
  for (const locale of LOCALES) {
    const canonicalPath = indexPath(locale);
    const page = composeIndexPage({ locale, guides, strings: strings[locale], rootDir });
    const ld = ['Organization', 'CollectionPage', 'BreadcrumbList'];
    pages.push({ path: fileFor(canonicalPath), page, checks: pageChecks({ page, locale, canonicalPath, ctPage: INDEX_CT_PAGE, ld }) });
  }

  reportChecks(pages, log);

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
