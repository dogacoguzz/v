import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_STORE_PROVIDER_TOKEN,
  SITE,
  assetHash,
  composeHead,
  composePage,
  externalOrigins,
  hashAssetRefs,
  hashedAssetPath,
  renderPartial,
  shouldRedirectToTr,
  smartBannerMeta,
  storeUrl,
  trRedirectScript,
} from './lib/page.mjs';
import { keyDiff, keyParity } from './lib/prerender.mjs';
import { runBuilders } from './build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const strings = {
  en: JSON.parse(readFileSync(join(ROOT, 'assets/data/strings.en.json'), 'utf8')),
  tr: JSON.parse(readFileSync(join(ROOT, 'assets/data/strings.tr.json'), 'utf8')),
};

const fixture = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'velora-page-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
};
const withFixture = (files, fn) => {
  const dir = fixture(files);
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

// --- storeUrl / Smart App Banner (KTD6) ---

test('keyDiff names missing and extra keys; keyParity is true only when both are empty', () => {
  assert.deepEqual(keyDiff({ a: { b: 1 }, c: 2 }, { a: { d: 1 }, c: 3 }), { missing: ['a.b'], extra: ['a.d'] });
  assert.deepEqual(keyDiff({ a: 1 }, { a: 2 }), { missing: [], extra: [] });
  assert.equal(keyParity({ a: 1 }, { a: 2 }), true);
  assert.equal(keyParity({ a: 1 }, {}), false);
  assert.equal(keyParity({}, { a: 1 }), false);
});

test('storeUrl carries pt, ct=<locale>-<page>-<placement> and mt=8', () => {
  const url = new URL(storeUrl('tr', 'home', 'hero'));
  assert.equal(url.origin + url.pathname, 'https://apps.apple.com/app/id6748447208');
  assert.equal(url.searchParams.get('pt'), APP_STORE_PROVIDER_TOKEN);
  assert.equal(url.searchParams.get('ct'), 'tr-home-hero');
  assert.equal(url.searchParams.get('mt'), '8');
});

test('storeUrl throws when ct exceeds 40 characters', () => {
  assert.throws(() => storeUrl('en', 'guide-how-much-water-should-i-drink', 'inline'), /40/);
  assert.doesNotThrow(() => storeUrl('en', 'a'.repeat(40 - 'en--nav'.length), 'nav'));
});

test('storeUrl rejects unknown locales and malformed segments', () => {
  assert.throws(() => storeUrl('de', 'home', 'hero'), /locale/);
  assert.throws(() => storeUrl('en', 'Home Page', 'hero'), /page/);
  assert.throws(() => storeUrl('en', 'home', ''), /placement/);
});

test('smartBannerMeta carries app id and a banner campaign token', () => {
  assert.equal(
    smartBannerMeta('en', 'home'),
    `<meta name="apple-itunes-app" content="app-id=6748447208, affiliate-data=pt=${APP_STORE_PROVIDER_TOKEN}&amp;ct=en-home-banner" />`
  );
});

// --- composeHead (KTD2) ---

const trHead = () => composeHead({
  locale: 'tr',
  title: 'Gizlilik',
  description: 'Açıklama "tırnak" & işaret',
  canonicalPath: '/tr/privacy-policy/',
  alternates: { en: '/privacy-policy/', tr: '/tr/privacy-policy/' },
  ogImage: '/images/og.jpg',
  jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'x</script>' },
  preloads: [{ href: '/assets/fonts/a.woff2', as: 'font', type: 'font/woff2' }],
  stylesheets: ['/assets/css/base.css'],
  bannerPage: 'privacy',
});

test('TR head has canonical /tr/ and hreflang en/tr/x-default', () => {
  const head = trHead();
  assert.match(head, new RegExp(`<link rel="canonical" href="${SITE}/tr/privacy-policy/" />`));
  assert.match(head, new RegExp(`<link rel="alternate" hreflang="en" href="${SITE}/privacy-policy/" />`));
  assert.match(head, new RegExp(`<link rel="alternate" hreflang="tr" href="${SITE}/tr/privacy-policy/" />`));
  assert.match(head, new RegExp(`<link rel="alternate" hreflang="x-default" href="${SITE}/privacy-policy/" />`));
  assert.match(head, /<meta property="og:locale" content="tr_TR" \/>/);
  assert.match(head, new RegExp(`<meta property="og:image" content="${SITE}/images/og.jpg" />`));
  assert.match(head, /content="Açıklama &quot;tırnak&quot; &amp; işaret"/);
  assert.match(head, /<link rel="preload" href="\/assets\/fonts\/a.woff2" as="font" type="font\/woff2" crossorigin \/>/);
  assert.match(head, /ct=tr-privacy-banner/);
  assert.ok(!head.includes('x</script>'), 'JSON-LD must not close the script element');
});

test('composeHead rejects a canonical that is not the locale alternate', () => {
  assert.throws(() => composeHead({
    locale: 'tr', title: 't', description: 'd', canonicalPath: '/privacy-policy/',
    alternates: { en: '/privacy-policy/', tr: '/tr/privacy-policy/' },
  }), /canonical/);
});

// --- partials + composePage (KTD1) ---

test('renderPartial throws on a missing partial and on an unresolved placeholder', () => {
  withFixture({ 'p/ok.html': '<a href="{{href}}">{{label}}</a> {{{raw}}}' }, (dir) => {
    assert.throws(() => renderPartial('nope', {}, { dir }), /partial not found/);
    assert.throws(() => renderPartial('ok', { href: '/x' }, { dir: join(dir, 'p') }), /unresolved placeholder.*label/);
    assert.equal(
      renderPartial('ok', { href: '/a?b=1&c=2', label: '<b>', raw: '<i>ok</i>' }, { dir: join(dir, 'p') }),
      '<a href="/a?b=1&amp;c=2">&lt;b&gt;</a> <i>ok</i>'
    );
  });
});

const trPage = () => composePage({
  locale: 'tr',
  page: 'privacy',
  strings: strings.tr,
  head: {
    title: 'Gizlilik', description: 'd', canonicalPath: '/tr/privacy-policy/',
    alternates: { en: '/privacy-policy/', tr: '/tr/privacy-policy/' },
    stylesheets: ['/assets/css/base.css'],
  },
  body: '<article class="legal"><h1>Gizlilik</h1></article>',
});

test('composed TR page wires lang, data-locale, skip link, chrome and locale hrefs', () => {
  const page = trPage();
  assert.ok(page.startsWith('<!DOCTYPE html>\n<html lang="tr" data-locale="tr">'));
  assert.match(page, /<a class="skip-link" href="#main">İçeriğe atla<\/a>/);
  assert.match(page, /<main id="main">/);
  assert.match(page, /<a href="\/tr\/" class="brand-mark"/);
  assert.match(page, /<button type="button" data-locale="tr" aria-current="true">/);
  assert.match(page, /<button type="button" data-locale="en" aria-current="false">/);
  assert.match(page, /href="\/tr\/rehber\/"/);
  assert.match(page, /href="\/tr\/privacy-policy\/"/);
  assert.match(page, /href="\/tr\/terms-of-service\/"/);
  assert.match(page, /href="\/eula"/);
  assert.match(page, /ct=tr-privacy-nav/);
  assert.ok(page.includes(strings.tr.footer.disclaimer));
  assert.ok(!page.includes('{{'), 'no unresolved placeholder');
});

test('composed pages load nothing from an external origin except apps.apple.com', () => {
  for (const locale of ['en', 'tr']) {
    const page = composePage({
      locale, page: 'home', strings: strings[locale],
      head: {
        title: 't', description: 'd', canonicalPath: locale === 'tr' ? '/tr/' : '/',
        alternates: { en: '/', tr: '/tr/' }, ogImage: '/images/og.jpg', bannerPage: 'home',
        jsonLd: { '@context': 'https://schema.org' },
      },
      body: `<a href="${storeUrl(locale, 'home', 'hero')}">x</a>`,
    });
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(page));
    assert.deepEqual([...externalOrigins(page)], ['https://apps.apple.com']);
  }
});

test('externalOrigins reports third-party fetches but not the site origin', () => {
  const html = `<link rel="canonical" href="${SITE}/" /><script src="https://cdn.example.com/a.js"></script>`
    + '<img srcset="https://img.example.org/a.png 1x" />';
  assert.deepEqual([...externalOrigins(html)].sort(), ['https://cdn.example.com', 'https://img.example.org']);
});

test('nav/footer strings keep EN/TR key parity and carry no em dash', () => {
  assert.ok(keyParity(strings.en, strings.tr));
  for (const locale of ['en', 'tr']) {
    for (const key of ['coach', 'guides', 'privacy', 'getApp', 'homeAria', 'primaryAria']) {
      assert.equal(typeof strings[locale].nav[key], 'string', `${locale} nav.${key}`);
    }
    assert.ok(!JSON.stringify({ n: strings[locale].nav, f: strings[locale].footer }).includes('\u2014'));
  }
});

// --- asset hashing (KTD4) ---

const assetFiles = () => ({
  'assets/fonts/a.woff2': 'font-bytes-1',
  'assets/css/fonts.css': "@font-face { src: url('../fonts/a.woff2') format('woff2'); }\n",
  'assets/js/i18n.js': 'export const t = 1;\n',
  'assets/js/app.js': "import { t } from './i18n.js';\nexport * from \"./i18n.js?v=deadbeef\";\n",
  'images/logo.png': 'png',
});
const pageHtml = '<link rel="preload" href="/assets/fonts/a.woff2" as="font" crossorigin />'
  + '<link rel="stylesheet" href="/assets/css/fonts.css" /><script type="module" src="/assets/js/app.js"></script>'
  + '<img src="/images/logo.png" alt="" /><a href="https://apps.apple.com/app/id1">x</a>';

test('hashed URLs are stable for unchanged content and change when content changes', () => {
  withFixture(assetFiles(), (dir) => {
    const first = hashAssetRefs(pageHtml, dir);
    assert.match(first, /\/images\/logo\.png\?v=[0-9a-f]{8}"/);
    assert.equal(hashAssetRefs(pageHtml, dir), first, 'stable across runs');
    assert.equal(hashAssetRefs(first, dir), first, 'idempotent on already-hashed input');
    writeFileSync(join(dir, 'images/logo.png'), 'png2');
    const second = hashAssetRefs(pageHtml, dir);
    assert.notEqual(second, first);
    assert.ok(second.includes('https://apps.apple.com/app/id1"'), 'external links untouched');
  });
});

test('font preload href equals the @font-face src after hashing', () => {
  withFixture(assetFiles(), (dir) => {
    const html = hashAssetRefs(pageHtml, dir);
    const css = hashAssetRefs(readFileSync(join(dir, 'assets/css/fonts.css'), 'utf8'), dir, { file: 'assets/css/fonts.css' });
    const preload = /href="\/assets\/fonts\/a\.woff2(\?v=[0-9a-f]{8})"/.exec(html)[1];
    const fontFace = /url\('\.\.\/fonts\/a\.woff2(\?v=[0-9a-f]{8})'\)/.exec(css)[1];
    assert.equal(preload, fontFace);
    assert.equal(fontFace, `?v=${assetHash('assets/fonts/a.woff2', dir)}`);
  });
});

test('a changed i18n.js changes its hash in importing modules and in the page ref to them', () => {
  withFixture(assetFiles(), (dir) => {
    const app = () => hashAssetRefs(readFileSync(join(dir, 'assets/js/app.js'), 'utf8'), dir, { file: 'assets/js/app.js' });
    const before = app();
    const htmlBefore = hashAssetRefs(pageHtml, dir);
    const refs = before.match(/\.\/i18n\.js\?v=([0-9a-f]{8})/g);
    assert.equal(refs.length, 2, 'both static import and export-from are hashed');
    assert.equal(new Set(refs).size, 1);
    writeFileSync(join(dir, 'assets/js/i18n.js'), 'export const t = 2;\n');
    assert.notEqual(app(), before);
    const appRef = (h) => /\/assets\/js\/app\.js\?v=([0-9a-f]{8})/.exec(h)[1];
    assert.notEqual(appRef(hashAssetRefs(pageHtml, dir)), appRef(htmlBefore), 'transitive: importer hash changes');
  });
});

test('hashedAssetPath versions og:image by content: new og.jpg bytes give a new URL', () => {
  withFixture({ 'images/og.jpg': 'jpeg-1' }, (dir) => {
    const first = hashedAssetPath('/images/og.jpg', dir);
    assert.match(first, /^\/images\/og\.jpg\?v=[0-9a-f]{8}$/);
    assert.equal(hashedAssetPath('/images/og.jpg', dir), first, 'stable for unchanged bytes');
    const head = composeHead({ locale: 'en', title: 'T', description: 'D', canonicalPath: '/', ogImage: first });
    assert.ok(head.includes(`<meta property="og:image" content="${SITE}${first}" />`));
    assert.ok(head.includes(`<meta name="twitter:image" content="${SITE}${first}" />`));
    writeFileSync(join(dir, 'images/og.jpg'), 'jpeg-2');
    assert.notEqual(hashedAssetPath('/images/og.jpg', dir), first);
    assert.throws(() => hashedAssetPath('images/og.jpg', dir), /root-relative/);
    assert.throws(() => hashedAssetPath('/images/none.jpg', dir), /not found/);
  });
});

test('hashing throws on a missing local asset and tolerates import cycles', () => {
  withFixture({
    'assets/js/a.js': "import './b.js';\n",
    'assets/js/b.js': "import './a.js';\n",
  }, (dir) => {
    assert.throws(() => hashAssetRefs('<img src="/images/none.png" />', dir), /not found/);
    assert.match(hashAssetRefs('<script src="/assets/js/a.js"></script>', dir), /a\.js\?v=[0-9a-f]{8}/);
  });
});

// --- `/` pre-paint TR redirect (KTD2) ---

test('shouldRedirectToTr follows ?lang, then a saved choice, then the first supported browser language', () => {
  assert.equal(shouldRedirectToTr({ search: '?lang=tr', saved: 'en', languages: ['en-US'] }), true);
  assert.equal(shouldRedirectToTr({ search: '?lang=en', saved: 'tr', languages: ['tr-TR'] }), false);
  assert.equal(shouldRedirectToTr({ search: '', saved: 'tr', languages: ['en-US'] }), true);
  assert.equal(shouldRedirectToTr({ search: '', saved: 'en', languages: ['tr-TR'] }), false);
  assert.equal(shouldRedirectToTr({ search: '', saved: null, languages: ['tr-TR', 'en'] }), true);
  assert.equal(shouldRedirectToTr({ search: '', saved: null, languages: ['en-US', 'tr'] }), false);
  assert.equal(shouldRedirectToTr({ search: '', saved: null, languages: [] }), false);
  assert.equal(shouldRedirectToTr({ search: '', saved: null, languages: ['de', 'tr'] }), true);
  assert.equal(shouldRedirectToTr({ search: '', saved: null, languages: ['de-DE', 'EN-gb', 'tr'] }), false);
  assert.equal(shouldRedirectToTr({ search: '', saved: null, languages: ['de', 'fr'] }), false);
  assert.equal(shouldRedirectToTr({ search: '', saved: null, languages: ['tre', 'tr_TR'] }), true);
  assert.equal(shouldRedirectToTr({ search: '?lang=tr', saved: null, languages: ['en'] }), true);
});

test('trRedirectScript is an inline pre-paint script that redirects to /tr/', () => {
  const script = trRedirectScript();
  assert.match(script, /^<script>[\s\S]*<\/script>$/);
  assert.equal(script.match(/<\/script>/g).length, 1);
  assert.match(script, /location\.replace\('\/tr\/' \+ location\.hash\)/);

  const run = ({ search, saved, languages }) => {
    let target = null;
    const body = script.replace(/^<script>|<\/script>$/g, '');
    new Function('location', 'localStorage', 'navigator', body)(
      { search, hash: '#coach', replace: (u) => { target = u; } },
      { getItem: () => saved },
      { languages, language: languages[0] }
    );
    return target;
  };
  assert.equal(run({ search: '?lang=tr', saved: null, languages: ['en'] }), '/tr/#coach');
  assert.equal(run({ search: '', saved: 'en', languages: ['tr-TR'] }), null);
  assert.equal(run({ search: '', saved: null, languages: ['de', 'tr'] }), '/tr/#coach');
});

// --- build.mjs ---

test('runBuilders stops at the first failing builder', async () => {
  const ran = [];
  const builders = [
    { name: 'a', run: () => ran.push('a') },
    { name: 'b', run: () => { throw new Error('boom'); } },
    { name: 'c', run: () => ran.push('c') },
  ];
  await assert.rejects(runBuilders(builders, { log: () => {} }), /b: boom/);
  assert.deepEqual(ran, ['a']);
});
