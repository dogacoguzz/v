// build-guides.test.mjs: guide fragments, page composition and the guides build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GUIDE_ALLOWLIST,
  build,
  guidePath,
  indexPath,
  loadGuides,
  outputPaths,
  parseGuide,
} from './build-guides.mjs';
import { TOP_LEVEL_ALLOWLIST } from './build-legal.mjs';
import { assertClean } from './lib/validate.mjs';
import { MESSAGE_KEYS } from '../assets/js/tools/steps-distance-core.js';
import { keyParity } from './lib/prerender.mjs';
import { assetHash, hashedAssetPath, organization } from './lib/page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://velorahealthcompanion.com';
const tmpDir = () => mkdtempSync(join(tmpdir(), 'build-guides-'));
const listFiles = (dir) => readdirSync(dir, { recursive: true }).filter((f) => statSync(join(dir, f)).isFile());
const quiet = { log: () => {} };

const header = (locale, overrides = {}) => ({
  slug: { en: 'sample-guide', tr: 'ornek-rehber' },
  ctPage: 'g-sample',
  order: 1,
  title: locale === 'en' ? 'Sample guide' : 'Örnek rehber',
  description: locale === 'en' ? 'A sample guide.' : 'Örnek bir rehber.',
  datePublished: '2026-09-29',
  lastReviewed: '2026-09-29',
  coach: { title: 'Coach title', line: 'Try 7,000 steps today.', body: 'Coach body.' },
  sources: [{ title: 'A primary source', url: 'https://example.org/paper' }],
  ...overrides,
});

const fragment = (locale, overrides = {}, body = '<p>Answer first.</p>\n<h2>Why?</h2>\n<p>Because.</p>') => {
  const meta = header(locale, overrides);
  for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete meta[k];
  return `<!--guide\n${JSON.stringify(meta, null, 2)}\n-->\n${body}\n`;
};

function seed(dir, files) {
  mkdirSync(dir, { recursive: true });
  for (const [name, source] of Object.entries(files)) writeFileSync(join(dir, name), source);
  return dir;
}

const pair = (enOverrides = {}, trOverrides = {}, enBody, trBody) => ({
  'sample-guide.en.html': fragment('en', enOverrides, enBody),
  'sample-guide.tr.html': fragment('tr', trOverrides, trBody),
});

// --- fragment validation (KTD8) ---

test('a guide without sources fails', () => {
  assert.throws(() => parseGuide(fragment('en', { sources: undefined }), 'x.en.html'), /sources/);
  assert.throws(() => parseGuide(fragment('en', { sources: [] }), 'x.en.html'), /sources/);
  assert.throws(() => parseGuide(fragment('en', { sources: [{ title: 'No url' }] }), 'x.en.html'), /sources\[0\]/);
});

test('a guide without a valid lastReviewed date fails', () => {
  assert.throws(() => parseGuide(fragment('en', { lastReviewed: undefined }), 'x.en.html'), /lastReviewed/);
  assert.throws(() => parseGuide(fragment('en', { lastReviewed: '2026-13-40' }), 'x.en.html'), /lastReviewed/);
});

test('a guide without its JSON header fails', () => {
  assert.throws(() => parseGuide('<p>No header.</p>', 'x.en.html'), /header/);
});

test('an em dash anywhere in a guide fails, header included', () => {
  assert.throws(() => parseGuide(fragment('en', {}, '<p>a — b</p>'), 'x.en.html'), /em dash/);
  assert.throws(() => parseGuide(fragment('en', { title: 'Steps — how many' }), 'x.en.html'), /em dash/);
});

test('a disallowed element in a guide fails', () => {
  assert.throws(() => parseGuide(fragment('en', {}, '<blockquote>q</blockquote>'), 'x.en.html'), /<blockquote>/);
  assert.throws(() => parseGuide(fragment('en', {}, '<h1>Second title</h1>'), 'x.en.html'), /<h1>/);
  assert.throws(() => parseGuide(fragment('en', {}, '<p>x</p><script>1</script>'), 'x.en.html'), /<script>/);
  assert.throws(() => parseGuide(fragment('en', {}, '<div class="promo"></div>'), 'x.en.html'), /<div class="promo">/);
});

test('guides allow h3, ol and one div.guide-tool; legal keeps its own allowlist', () => {
  const body = '<h2>A</h2><h3>B</h3><ol><li>x</li></ol><div class="guide-tool"><p>t</p></div>';
  assert.doesNotThrow(() => assertClean(body, GUIDE_ALLOWLIST));
  assert.throws(() => assertClean('<h3>B</h3>', TOP_LEVEL_ALLOWLIST), /<h3>/);
  assert.throws(() => assertClean('<ol><li>x</li></ol>', TOP_LEVEL_ALLOWLIST), /<ol>/);
  assert.throws(() => assertClean('<h1>T</h1>', GUIDE_ALLOWLIST), /<h1>/);
  assert.doesNotThrow(() => assertClean('<h1>T</h1>', TOP_LEVEL_ALLOWLIST));
  const two = '<div class="guide-tool"></div><div class="guide-tool"></div>';
  assert.throws(() => parseGuide(fragment('en', { tool: 'steps-distance' }, two), 'x.en.html'), /guide-tool/);
});

test('a tool guide needs exactly one guide-tool container and a known tool', () => {
  assert.throws(() => parseGuide(fragment('en', { tool: 'steps-distance' }), 'x.en.html'), /guide-tool/);
  assert.throws(() => parseGuide(fragment('en', {}, '<div class="guide-tool"></div>'), 'x.en.html'), /guide-tool/);
  assert.throws(() => parseGuide(fragment('en', { tool: 'bmi' }, '<div class="guide-tool"></div>'), 'x.en.html'), /tool/);
});

test('the Coach line follows the app output rules: under 12 words, one number, opens with a word', () => {
  assert.throws(() => parseGuide(fragment('en', { coach: { title: 't', body: 'b', line: 'Your average is 6,500 steps. Try 7,000.' } }), 'x.en.html'), /one number/);
  assert.throws(() => parseGuide(fragment('en', { coach: { title: 't', body: 'b', line: 'You walked a lot more this week than you usually do on weekdays.' } }), 'x.en.html'), /12 words/);
  assert.throws(() => parseGuide(fragment('en', { coach: { title: 't', body: 'b', line: '7,000 steps is a good next goal.' } }), 'x.en.html'), /open with a word/);
});

test('datePublished is a real date on or before lastReviewed', () => {
  assert.throws(() => parseGuide(fragment('en', { datePublished: undefined }), 'x.en.html'), /datePublished/);
  assert.throws(() => parseGuide(fragment('en', { datePublished: '2026-02-30' }), 'x.en.html'), /datePublished/);
  assert.throws(() => parseGuide(fragment('en', { datePublished: '2026-10-01' }), 'x.en.html'), /datePublished/);
  assert.doesNotThrow(() => parseGuide(fragment('en', { datePublished: '2026-09-01' }), 'x.en.html'));
});

test('pro is a boolean and related lists 2 or 3 slugs', () => {
  assert.throws(() => parseGuide(fragment('en', { pro: 'yes' }), 'x.en.html'), /pro/);
  assert.throws(() => parseGuide(fragment('en', { related: ['one'] }), 'x.en.html'), /related/);
  assert.throws(() => parseGuide(fragment('en', { related: ['a', 'b', 'c', 'd'] }), 'x.en.html'), /related/);
  assert.throws(() => parseGuide(fragment('en', { related: ['Bad Slug', 'b'] }), 'x.en.html'), /related/);
  assert.doesNotThrow(() => parseGuide(fragment('en', { pro: true, related: ['a', 'b'] }), 'x.en.html'));
});

test('related guides must exist, differ from the guide, appear once and match across locales', () => {
  const other = (locale, overrides = {}) => fragment(locale, {
    slug: { en: 'other-guide', tr: 'diger-rehber' }, ctPage: 'g-other', order: 2, ...overrides,
  });
  const files = (enRelated, trRelated = enRelated) => ({
    ...pair({ related: enRelated }, { related: trRelated }),
    'other-guide.en.html': other('en', { related: ['sample-guide', 'third-guide'] }),
    'other-guide.tr.html': other('tr', { related: ['sample-guide', 'third-guide'] }),
    'third-guide.en.html': fragment('en', { slug: { en: 'third-guide', tr: 'ucuncu' }, ctPage: 'g-third', order: 3 }),
    'third-guide.tr.html': fragment('tr', { slug: { en: 'third-guide', tr: 'ucuncu' }, ctPage: 'g-third', order: 3 }),
  });
  assert.doesNotThrow(() => loadGuides(seed(join(tmpDir(), 'c'), files(['other-guide', 'third-guide']))));
  assert.throws(() => loadGuides(seed(join(tmpDir(), 'c'), files(['other-guide', 'missing-guide']))), /missing-guide/);
  assert.throws(() => loadGuides(seed(join(tmpDir(), 'c'), files(['sample-guide', 'other-guide']))), /sample-guide/);
  assert.throws(() => loadGuides(seed(join(tmpDir(), 'c'), files(['other-guide', 'other-guide']))), /twice/);
  assert.throws(() => loadGuides(seed(join(tmpDir(), 'c'), files(['other-guide', 'third-guide'], ['third-guide', 'other-guide']))), /related differ/);
});

test('a campaign page id that would push ct past 40 characters fails', () => {
  assert.throws(() => parseGuide(fragment('en', { ctPage: 'g-a-very-long-campaign-page-name-here' }), 'x.en.html'), /ct|40/);
});

test('guides must come in EN/TR pairs that agree on slugs and campaign page', () => {
  assert.throws(() => loadGuides(seed(join(tmpDir(), 'c'), { 'sample-guide.en.html': fragment('en') })), /tr/);
  assert.throws(() => loadGuides(seed(join(tmpDir(), 'c'), pair({}, { ctPage: 'g-other' }))), /ctPage/);
  assert.throws(() => loadGuides(seed(join(tmpDir(), 'c'), pair({}, { slug: { en: 'sample-guide', tr: 'baska' } }))), /slug/);
});

// --- build: fails before writing ---

test('build fails and writes nothing when a guide has no sources', () => {
  const dir = tmpDir();
  const outDir = join(dir, 'out');
  const contentDir = seed(join(dir, 'c'), pair({}, { sources: [] }));
  assert.throws(() => build({ outDir, contentDir, ...quiet }), /sources/);
  assert.ok(!existsSync(outDir) || listFiles(outDir).length === 0);
});

test('build fails and writes nothing when a guide carries an em dash', () => {
  const dir = tmpDir();
  const outDir = join(dir, 'out');
  const contentDir = seed(join(dir, 'c'), pair({}, {}, undefined, '<p>bir — iki</p>'));
  assert.throws(() => build({ outDir, contentDir, ...quiet }), /em dash/);
  assert.ok(!existsSync(outDir) || listFiles(outDir).length === 0);
});

// --- build: the real content ---

const built = (() => {
  let cache;
  return () => {
    if (!cache) {
      const outDir = join(tmpDir(), 'out');
      const paths = build({ outDir, ...quiet });
      cache = { outDir, paths, read: (p) => readFileSync(join(outDir, p), 'utf8'), guides: loadGuides() };
    }
    return cache;
  };
})();

const fileFor = (urlPath) => `${urlPath.replace(/^\//, '')}index.html`;

test('the first set has four guides in EN and TR, one of them the calculator', () => {
  const { guides } = built();
  assert.equal(guides.length, 4);
  assert.deepEqual(guides.map((g) => g.en.meta.slug.en), ['daily-step-goal', 'how-much-water', 'alcohol-and-training', 'steps-to-distance']);
  assert.deepEqual(guides.map((g) => g.en.meta.slug.tr), ['gunluk-adim-hedefi', 'ne-kadar-su', 'alkol-ve-antrenman', 'adim-mesafe']);
  assert.deepEqual(guides.filter((g) => g.en.meta.tool).map((g) => g.en.meta.tool), ['steps-distance']);
});

test('build writes every guide page and both index pages, and the committed output matches', () => {
  const { outDir, paths } = built();
  assert.deepEqual(listFiles(outDir).sort(), [...paths].sort());
  assert.deepEqual([...paths].sort(), outputPaths(built().guides).sort());
  assert.equal(paths.length, 10);
  for (const p of paths) assert.equal(built().read(p), readFileSync(join(ROOT, p), 'utf8'), `${p} is stale; run npm run build`);
});

test('EN and TR guides link to each other with hreflang, and the language switch has its counterpart', () => {
  const { guides, read } = built();
  for (const g of guides) {
    const en = guidePath('en', g.en.meta.slug.en);
    const tr = guidePath('tr', g.en.meta.slug.tr);
    for (const [locale, own] of [['en', en], ['tr', tr]]) {
      const page = read(fileFor(own));
      assert.ok(page.includes(`<html lang="${locale}" data-locale="${locale}">`));
      assert.ok(page.includes(`<link rel="canonical" href="${SITE}${own}" />`), own);
      assert.ok(page.includes(`<link rel="alternate" hreflang="en" href="${SITE}${en}" />`), own);
      assert.ok(page.includes(`<link rel="alternate" hreflang="tr" href="${SITE}${tr}" />`), own);
      assert.ok(page.includes(`<link rel="alternate" hreflang="x-default" href="${SITE}${en}" />`), own);
      // boot.js sends the language switch to the page's own hreflang alternate.
      assert.match(page, /<script type="module" src="\/assets\/js\/boot\.js\?v=[0-9a-f]{8}"><\/script>/);
      assert.ok(page.includes(`<a href="${own}" hreflang="${locale}" lang="${locale}" data-locale="${locale}" aria-current="true">`), own);
      const other = locale === 'en' ? 'tr' : 'en';
      const otherPath = other === 'en' ? en : tr;
      assert.ok(page.includes(`<a href="${otherPath}" hreflang="${other}" lang="${other}" data-locale="${other}" aria-current="false">`), own);
    }
  }
});

test('both index pages list every guide in the locale, with hreflang between them', () => {
  const { guides, read } = built();
  for (const locale of ['en', 'tr']) {
    const page = read(fileFor(indexPath(locale)));
    assert.ok(page.includes(`<link rel="alternate" hreflang="en" href="${SITE}${indexPath('en')}" />`));
    assert.ok(page.includes(`<link rel="alternate" hreflang="tr" href="${SITE}${indexPath('tr')}" />`));
    const links = [...page.matchAll(/<a class="guide-list__link" href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(links, guides.map((g) => guidePath(locale, g.en.meta.slug[locale])));
    for (const g of guides) assert.ok(page.includes(g[locale].meta.title.replace(/&/g, '&amp;')), g[locale].meta.title);
  }
});

test('each guide ends with a Coach CTA, a last-reviewed date and its sources', () => {
  const { guides, read } = built();
  for (const g of guides) {
    for (const locale of ['en', 'tr']) {
      const { meta } = g[locale];
      const page = read(fileFor(guidePath(locale, meta.slug[locale])));
      const ct = `ct=${locale}-${meta.ctPage}-cta`;
      assert.ok(page.includes(`${ct}&amp;mt=8`) || page.includes(`${ct}&mt=8`), `${meta.slug[locale]} CTA ct`);
      assert.ok(page.includes(`affiliate-data=pt=`) && page.includes(`${locale}-${meta.ctPage}-banner`));
      assert.match(page, new RegExp(`src="/images/badge-appstore-${locale}\\.svg\\?v=[0-9a-f]{8}"`));
      assert.ok(page.includes(`<time datetime="${meta.lastReviewed}">`));
      for (const s of meta.sources) assert.ok(page.includes(`href="${s.url.replace(/&/g, '&amp;')}"`), s.url);
      assert.ok(page.lastIndexOf('class="guide-cta"') > page.lastIndexOf('class="guide-sources"'));
      assert.equal((page.match(/<h1\b/g) || []).length, 1);
      assert.ok(!page.includes('—'));
      assert.ok(meta.sources.every((s) => s.url.startsWith('https://')));
    }
  }
});

test('every guide links to 2 or 3 other guides in its own locale, never to itself', () => {
  const { guides, read } = built();
  for (const g of guides) {
    for (const locale of ['en', 'tr']) {
      const own = guidePath(locale, g[locale].meta.slug[locale]);
      const section = /<section class="guide-related"[\s\S]*?<\/section>/.exec(read(fileFor(own)))?.[0] ?? '';
      const links = [...section.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)];
      assert.ok(links.length >= 2 && links.length <= 3, `${own}: ${links.length} related links`);
      for (const [, href, title] of links) {
        assert.notEqual(href, own);
        const target = guides.find((o) => guidePath(locale, o[locale].meta.slug[locale]) === href);
        assert.ok(target, `${own}: ${href} is not a ${locale} guide`);
        assert.equal(title, target[locale].meta.title.replace(/&/g, '&amp;'));
      }
    }
  }
});

test('AE1: only the CTAs that show an AI goal suggestion carry the Pro badge', () => {
  const { guides, read } = built();
  const pro = guides.filter((g) => g.en.meta.pro).map((g) => g.en.meta.slug.en);
  assert.deepEqual(pro.sort(), ['daily-step-goal', 'steps-to-distance']);
  for (const g of guides) {
    for (const locale of ['en', 'tr']) {
      const cta = /<aside class="guide-cta"[\s\S]*?<\/aside>/.exec(read(fileFor(guidePath(locale, g[locale].meta.slug[locale]))))[0];
      assert.equal(cta.includes('<span class="pro-badge">Pro</span>'), !!g.en.meta.pro, `${locale} ${g.en.meta.slug.en}`);
    }
  }
  for (const locale of ['en', 'tr']) assert.ok(!read(fileFor(indexPath(locale))).includes('pro-badge'), `${locale} index CTA`);
});

test('guide JSON-LD: Article with dates, image and publisher id, plus a breadcrumb of real URLs', () => {
  const { guides, read } = built();
  const og = `${SITE}${hashedAssetPath('/images/og.jpg', ROOT)}`;
  const urls = new Set(outputPaths(guides).map((p) => `${SITE}/${p.replace(/index\.html$/, '')}`));
  urls.add(`${SITE}/`).add(`${SITE}/tr/`);
  for (const g of guides) {
    for (const locale of ['en', 'tr']) {
      const { meta } = g[locale];
      const own = guidePath(locale, meta.slug[locale]);
      const blocks = [...read(fileFor(own)).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      assert.equal(blocks.length, 1);
      const graph = JSON.parse(blocks[0][1])['@graph'];
      const org = graph.find((n) => n['@type'] === 'Organization');
      const article = graph.find((n) => n['@type'] === 'Article');
      const crumbs = graph.find((n) => n['@type'] === 'BreadcrumbList').itemListElement;
      assert.equal(org['@id'], `${SITE}/#org`);
      assert.deepEqual(org, organization(locale));
      assert.equal(article.headline, meta.title);
      assert.equal(article.datePublished, meta.datePublished);
      assert.equal(article.dateModified, meta.lastReviewed);
      assert.equal(article.image, og);
      assert.equal(article.mainEntityOfPage, `${SITE}${own}`);
      assert.deepEqual(article.publisher, { '@id': org['@id'] });
      assert.deepEqual(article.author, { '@id': org['@id'] });
      assert.deepEqual(crumbs.map((c) => c.position), [1, 2, 3]);
      assert.equal(crumbs.at(-1).item, `${SITE}${own}`);
      for (const c of crumbs) assert.ok(urls.has(c.item), c.item);
    }
  }
});

test('guides index JSON-LD: CollectionPage of every guide plus a two-step breadcrumb', () => {
  const { guides, read } = built();
  for (const locale of ['en', 'tr']) {
    const graph = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(read(fileFor(indexPath(locale))))[1])['@graph'];
    const page = graph.find((n) => n['@type'] === 'CollectionPage');
    assert.equal(page.url, `${SITE}${indexPath(locale)}`);
    assert.deepEqual(page.hasPart.map((a) => a.url), guides.map((g) => `${SITE}${guidePath(locale, g[locale].meta.slug[locale])}`));
    const crumbs = graph.find((n) => n['@type'] === 'BreadcrumbList').itemListElement;
    assert.deepEqual(crumbs.map((c) => c.item), [`${SITE}${locale === 'en' ? '/' : '/tr/'}`, `${SITE}${indexPath(locale)}`]);
  }
});

test('guide and index titles carry the canonical name and stay within 70 characters', () => {
  const { guides, paths, read } = built();
  for (const p of paths) {
    const title = /<title>([^<]+)<\/title>/.exec(read(p))[1].replace(/&amp;/g, '&');
    assert.ok(title.endsWith(' · Velora: Health Companion'), `${p}: ${title}`);
    assert.ok([...title].length <= 70, `${p}: ${[...title].length} characters`);
  }
  for (const locale of ['en', 'tr']) {
    const index = /<title>([^<]+)<\/title>/.exec(read(fileFor(indexPath(locale))))[1];
    assert.match(index, /iPhone/);
    assert.match(index, locale === 'en' ? /Health/ : /Sağlık/);
  }
  assert.equal(guides.length * 2 + 2, paths.length);
});

test('pages load styles, scripts and images only from the site itself', () => {
  const { paths, read } = built();
  for (const p of paths) {
    const page = read(p);
    for (const [, url] of page.matchAll(/\ssrc="([^"]+)"/g)) assert.ok(url.startsWith('/'), `${p}: ${url}`);
    for (const [, url] of page.matchAll(/<link rel="(?:stylesheet|preload)" href="([^"]+)"/g)) assert.ok(url.startsWith('/'), `${p}: ${url}`);
    assert.ok(!page.includes('fonts.googleapis'));
    assert.ok(page.includes('/assets/css/guide.css?v='), p);
  }
});

test('guide og:image and twitter:image carry the og.jpg content hash', () => {
  const { paths, read } = built();
  const og = `${SITE}${hashedAssetPath('/images/og.jpg', ROOT)}`;
  for (const p of paths) {
    const page = read(p);
    assert.ok(page.includes(`<meta property="og:image" content="${og}" />`), p);
    assert.ok(page.includes(`<meta name="twitter:image" content="${og}" />`), p);
  }
});

test('the calculator page loads its module and both locales carry every calculator message', () => {
  const { guides, read } = built();
  const calc = guides.find((g) => g.en.meta.tool === 'steps-distance');
  for (const locale of ['en', 'tr']) {
    const page = read(fileFor(guidePath(locale, calc[locale].meta.slug[locale])));
    assert.match(page, /<script type="module" src="\/assets\/js\/tools\/steps-distance\.js\?v=[0-9a-f]{8}"><\/script>/);
    const tool = /<div class="guide-tool"[^>]*>/.exec(page)?.[0] ?? '';
    const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    for (const key of [...MESSAGE_KEYS.filter((k) => locale === 'en' || !k.endsWith('Imperial')), 'result']) {
      assert.match(tool, new RegExp(`data-msg-${kebab(key)}="[^"]+"`), `${locale}: ${key}`);
    }
    assert.equal(/data-units-toggle/.test(page), locale === 'en', 'imperial toggle only on EN');
  }
  const other = guides.filter((g) => !g.en.meta.tool);
  for (const g of other) assert.ok(!read(fileFor(guidePath('en', g.en.meta.slug.en))).includes('steps-distance.js'));
});

test('the committed calculator module imports its core with the current content hash', () => {
  const module = readFileSync(join(ROOT, 'assets/js/tools/steps-distance.js'), 'utf8');
  const hash = assetHash('assets/js/tools/steps-distance-core.js', ROOT);
  assert.ok(module.includes(`from './steps-distance-core.js?v=${hash}'`), 'stale core hash; run npm run build');
});

test('guides strings keep EN/TR key parity and carry no em dash', () => {
  const en = JSON.parse(readFileSync(join(ROOT, 'assets/data/strings.en.json'), 'utf8'));
  const tr = JSON.parse(readFileSync(join(ROOT, 'assets/data/strings.tr.json'), 'utf8'));
  assert.ok(en.guides && tr.guides);
  assert.ok(keyParity(en.guides, tr.guides));
  assert.ok(!JSON.stringify(en.guides).includes('—') && !JSON.stringify(tr.guides).includes('—'));
});
