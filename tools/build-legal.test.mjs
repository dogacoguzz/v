// build-legal.test.mjs — run with: node --test tools/build-legal.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  count,
  OUTPUT_PATHS,
  SOURCE_PATHS,
  assertClean,
  build,
  composePage,
  loadChrome,
  normaliseDocument,
  main,
  pageChecks,
  readEulaUrl,
  sourcePath,
  stripInlineStyles,
  wrapTables,
} from './build-legal.mjs';
import { applyI18nStrings, keyParity, markLangSwitch, rewriteRootRelativePaths } from './lib/prerender.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = [
  { locale: 'en', kind: 'privacy' },
  { locale: 'tr', kind: 'privacy' },
  { locale: 'en', kind: 'terms' },
  { locale: 'tr', kind: 'terms' },
];

const tmpDir = () => mkdtempSync(join(tmpdir(), 'build-legal-'));
const listFiles = (dir) => readdirSync(dir, { recursive: true }).filter((f) => statSync(join(dir, f)).isFile());
const loadStrings = (locale) => JSON.parse(readFileSync(join(ROOT, `assets/data/strings.${locale}.json`), 'utf8'));

const SAMPLE_FRAGMENT = `<!-- Source of truth for /privacy-policy/ (en). Edit here, then run: node tools/build-legal.mjs -->
<h1>Velora Privacy Policy</h1>
<p class="last-updated">Effective: 1 Jan 2026</p>
<div class="highlight">
  <h2>1. Summary</h2>
  <p>Velora keeps data on device.</p>
</div>
<h2>2. Data</h2>
<table class="data-table">
  <tr><th>A</th><th>B</th></tr>
  <tr><td>1</td><td>2</td></tr>
</table>
<ul><li>One</li><li>Two</li></ul>
<div class="contact-info">
  <h2>3. Contact</h2>
  <p>Email: <strong>dnf.velora@gmail.com</strong></p>
</div>
`;

const seedContentDir = (dir, { overrides = {}, skip = [] } = {}) => {
  mkdirSync(dir, { recursive: true });
  for (const doc of DOCS) {
    const key = `${doc.kind}.${doc.locale}`;
    if (skip.includes(key)) continue;
    const body = overrides[key] ?? SAMPLE_FRAGMENT;
    writeFileSync(join(dir, sourcePath(doc).split('/').pop()), body);
  }
  return dir;
};

test('normaliseDocument strips the leading source comment and yields one h1', () => {
  const body = normaliseDocument(SAMPLE_FRAGMENT);
  assert.ok(!body.includes('Source of truth'));
  assert.equal(count(body, /<h1\b/g), 1);
  assert.ok(body.trim().startsWith('<h1>'));
});

test('normaliseDocument runs cleanly on all four real source files', () => {
  for (const doc of DOCS) {
    const source = readFileSync(join(ROOT, sourcePath(doc)), 'utf8');
    const body = normaliseDocument(source);
    assert.equal(count(body, /<h1\b/g), 1, sourcePath(doc));
  }
});

test('normaliseDocument rejects an em dash', () => {
  const withDash = SAMPLE_FRAGMENT.replace('Velora keeps data on device.', 'Velora keeps data on device — always.');
  assert.throws(() => normaliseDocument(withDash), /em dash \(U\+2014\)/);
});

test('stripInlineStyles removes a style attribute and keeps the text', () => {
  const out = stripInlineStyles('<p style="color: red">Text</p>');
  assert.ok(!/ style=/.test(out));
  assert.ok(out.includes('>Text</p>'));
});

test('wrapTables wraps each data table exactly once and is idempotent', () => {
  const src = '<table class="data-table">\n  <tr><td>1</td></tr>\n</table>';
  const once = wrapTables(src);
  const twice = wrapTables(once);
  assert.equal(count(once, /legal__table-scroll/g), 1);
  assert.equal(twice, once);
  assert.match(once, /<div class="legal__table-scroll">\s*<table class="data-table">[\s\S]*<\/table>\s*<\/div>/);
});

test('assertClean rejects a stray placeholder', () => {
  assert.throws(() => assertClean('<p>\\(foo)</p>'), /\\\(foo\)/);
});

test('assertClean rejects a top-level blockquote naming the tag', () => {
  assert.throws(() => assertClean('<h1>T</h1><blockquote>q</blockquote>'), /<blockquote>/);
});

test('assertClean rejects an unknown div class naming tag and class', () => {
  assert.throws(() => assertClean('<h1>T</h1><div class="promo"><p>x</p></div>'), /<div class="promo">/);
});

test('assertClean rejects an embedded style or script element', () => {
  assert.throws(() => assertClean('<h1>T</h1><style>p{}</style>'), /<style>/);
  assert.throws(() => assertClean('<h1>T</h1><p>x</p><script>1</script>'), /<script>/);
});

test('assertClean rejects markup that is never closed', () => {
  assert.throws(() => assertClean('<h1>T</h1>\n<p>open\n<blockquote>q</blockquote>'), /unbalanced markup, 1 element\(s\) never closed/);
});

test('assertClean rejects an em dash', () => {
  assert.throws(() => assertClean('<p>a — b</p>'), /assertClean: em dash \(U\+2014\) is not allowed in user-facing legal text/);
});

test('assertClean accepts every allowlisted top-level element', () => {
  const ok = [
    '<h1>T</h1>', '<p class="last-updated">d</p>', '<p>x<br />y</p>', '<h2>1.</h2>', '<ul><li>a</li></ul>',
    '<div class="legal__table-scroll"><table class="data-table"><tr><td>1</td></tr></table></div>',
    '<table class="data-table"><tr><td>1</td></tr></table>',
    '<div class="highlight"><h2>h</h2><p>p</p></div>', '<div class="warning-box"><p>p</p></div>',
    '<div class="danger-box"><p>p</p></div>', '<div class="contact-info"><p>p</p></div>',
  ].join('\n');
  assert.doesNotThrow(() => assertClean(ok));
});

test('rewriteRootRelativePaths maps assets, images and legal hrefs per prefix and leaves /eula', () => {
  const src = '<link href="assets/css/a.css" /><img src="images/x.png" data-src-tr="images/y.png" />'
    + '<section data-src-en="images/e.png"></section>'
    + '<a href="privacy-policy/">P</a><a href="terms-of-service/">T</a><a href="/eula">E</a>';
  const en = rewriteRootRelativePaths(src, { localePrefix: '' });
  assert.ok(en.includes('href="/assets/css/a.css"'));
  assert.ok(en.includes('src="/images/x.png"'));
  assert.ok(en.includes('data-src-tr="/images/y.png"'));
  assert.ok(en.includes('data-src-en="/images/e.png"'));
  assert.ok(en.includes('href="/privacy-policy/"'));
  assert.ok(en.includes('href="/terms-of-service/"'));
  assert.ok(en.includes('href="/eula"'));
  const tr = rewriteRootRelativePaths(src, { localePrefix: '/tr' });
  assert.ok(tr.includes('href="/tr/privacy-policy/"'));
  assert.ok(tr.includes('href="/tr/terms-of-service/"'));
  assert.ok(tr.includes('href="/eula"'));
  assert.equal(rewriteRootRelativePaths(tr, { localePrefix: '/tr' }), tr);
});

test('applyI18nStrings rewrites the real aria-label/alt and keeps the data-i18n-* keys', () => {
  const strings = { nav: { langGroupAria: 'Dil', skipLink: 'İçeriğe atla' }, img: { alt: 'Resim' }, hero: { h1: 'A<br /><em>B</em>' } };
  const src = '<a class="skip-link" href="#top" data-i18n="nav.skipLink">Skip to content</a>'
    + '<div class="lang-switch" role="group" data-i18n-aria-label="nav.langGroupAria" aria-label="Language"></div>'
    + '<img data-i18n-alt="img.alt" alt="Picture" src="x.png" />'
    + '<h1 data-i18n-html="hero.h1">X<br /><em>Y</em></h1>';
  const { html, missing } = applyI18nStrings(src, strings);
  assert.deepEqual(missing, []);
  assert.ok(html.includes('data-i18n="nav.skipLink">İçeriğe atla</a>'));
  assert.ok(html.includes('data-i18n-aria-label="nav.langGroupAria" aria-label="Dil"'));
  assert.ok(html.includes('data-i18n-alt="img.alt" alt="Resim"'));
  assert.ok(html.includes('<h1 data-i18n-html="hero.h1">A<br /><em>B</em></h1>'));
});

test('applyI18nStrings reports missing keys and leaves those nodes untouched', () => {
  const { html, missing } = applyI18nStrings('<span data-i18n="nope.key">Keep</span>', {});
  assert.deepEqual(missing, ['nope.key']);
  assert.ok(html.includes('>Keep</span>'));
});

test('applyI18nStrings leaves html, alt and aria-label nodes untouched when their key is missing', () => {
  const cases = {
    'hero.h1': ['<h1 data-i18n-html="hero.h1">X<br /><em>Y</em></h1>', '>X<br /><em>Y</em></h1>'],
    'img.alt': ['<img data-i18n-alt="img.alt" alt="Picture" src="x.png" />', 'alt="Picture"'],
    'nav.langGroupAria': ['<div data-i18n-aria-label="nav.langGroupAria" aria-label="Language"></div>', 'aria-label="Language"'],
  };
  for (const [key, [src, kept]] of Object.entries(cases)) {
    const { html, missing } = applyI18nStrings(src, {});
    assert.deepEqual(missing, [key]);
    assert.equal(html, src);
    assert.ok(html.includes(kept), key);
  }
});

test('markLangSwitch flips aria-current to the given locale', () => {
  const src = '<button type="button" data-locale="en" aria-current="true">EN</button>'
    + '<button type="button" data-locale="tr" aria-current="false">TR</button>';
  const tr = markLangSwitch(src, 'tr');
  assert.ok(tr.includes('data-locale="en" aria-current="false"'));
  assert.ok(tr.includes('data-locale="tr" aria-current="true"'));
  assert.equal(markLangSwitch(src, 'en'), src);
});

test('keyParity compares flattened key sets', () => {
  assert.equal(keyParity({ a: { b: 1 }, c: 2 }, { c: 3, a: { b: 4 } }), true);
  assert.equal(keyParity({ a: { b: 1 } }, { a: { b: 1, d: 2 } }), false);
});

test('readEulaUrl returns the URL when meta refresh, link and location.replace agree', () => {
  const eula = readFileSync(join(ROOT, 'eula/index.html'), 'utf8');
  const url = readEulaUrl(eula);
  assert.match(url, /^https:\/\/www\.apple\.com\/legal\//);
  assert.equal(readEulaUrl(), url);
  assert.equal(count(eula, new RegExp(url.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'g')), 3);
});

test('readEulaUrl throws when one copy of the URL drifts or the meta refresh is missing', () => {
  const eula = readFileSync(join(ROOT, 'eula/index.html'), 'utf8');
  const drifted = eula.replace(/location\.replace\('[^']+'\)/, "location.replace('https://example.com/eula')");
  assert.notEqual(drifted, eula);
  assert.throws(() => readEulaUrl(drifted), /meta refresh, link and location\.replace URLs differ/);
  const noMeta = eula.replace(/<meta http-equiv="refresh"[^>]*>\n/, '');
  assert.notEqual(noMeta, eula);
  assert.throws(() => readEulaUrl(noMeta), /meta refresh, link and location\.replace URLs differ/);
});

test('composePage keeps English chrome, root brand href and EN canonical for locale en', () => {
  const chrome = loadChrome();
  const strings = loadStrings('en');
  const page = composePage({ locale: 'en', kind: 'privacy', body: '<h1>Title</h1>\n<p>Text</p>', strings, chrome });
  assert.ok(page.startsWith('<!DOCTYPE html>\n<html lang="en" data-locale="en">'));
  assert.ok(page.includes(`<title>${strings.legal.privacy.title}</title>`));
  assert.ok(page.includes('<link rel="canonical" href="https://velorahealthcompanion.com/privacy-policy/" />'));
  assert.ok(page.includes('<meta property="og:locale" content="en_US" />'));
  assert.ok(page.includes('<a href="/" class="brand-mark"'));
  assert.ok(page.includes('data-i18n="nav.skipLink">Skip to content</a>'));
  assert.ok(page.includes('data-i18n-aria-label="nav.langGroupAria" aria-label="Language"'));
  assert.ok(page.includes('href="/privacy-policy/"'));
  assert.ok(page.includes('href="/terms-of-service/"'));
  assert.ok(!page.includes('href="/tr/privacy-policy/"'));
  assert.ok(page.includes('data-locale="en" aria-current="true"'));
  assert.ok(page.includes('data-locale="tr" aria-current="false"'));
  assert.ok(!/(?:href|src)="(?:assets|images)\//.test(page));
});

test('composePage builds the locale-specific head and chrome around the body', () => {
  const chrome = loadChrome();
  const strings = loadStrings('tr');
  const page = composePage({ locale: 'tr', kind: 'privacy', body: '<h1>Başlık</h1>\n<p>Metin</p>', strings, chrome });
  assert.ok(page.startsWith('<!DOCTYPE html>\n<html lang="tr" data-locale="tr">'));
  assert.ok(page.includes(`<title>${strings.legal.privacy.title}</title>`));
  assert.ok(page.includes('<link rel="canonical" href="https://velorahealthcompanion.com/tr/privacy-policy/" />'));
  assert.ok(page.includes('<link rel="alternate" hreflang="en" href="https://velorahealthcompanion.com/privacy-policy/" />'));
  assert.ok(page.includes('<link rel="alternate" hreflang="tr" href="https://velorahealthcompanion.com/tr/privacy-policy/" />'));
  assert.ok(page.includes('<link rel="alternate" hreflang="x-default" href="https://velorahealthcompanion.com/privacy-policy/" />'));
  assert.ok(page.includes('<link rel="stylesheet" href="/assets/css/legal.css" />'));
  assert.ok(page.includes('<script type="module" src="/assets/js/app.js"></script>'));
  assert.ok(page.includes('<meta property="og:locale" content="tr_TR" />'));
  assert.ok(page.includes('<a href="/tr/" class="brand-mark"'));
  assert.ok(page.includes('data-i18n-aria-label="nav.langGroupAria" aria-label="Dil"'));
  assert.ok(page.includes('data-i18n="nav.skipLink">İçeriğe atla</a>'));
  assert.ok(page.includes('href="/tr/privacy-policy/"'));
  assert.ok(page.includes('href="/tr/terms-of-service/"'));
  assert.ok(page.includes('href="/eula"'));
  assert.ok(page.includes('data-locale="tr" aria-current="true"'));
  assert.ok(page.includes('<main id="top">'));
  assert.ok(page.includes('<article class="legal">'));
  assert.ok(!page.includes('application/ld+json'));
  assert.ok(!page.includes('Early locale'));
  assert.ok(!/(?:href|src)="(?:assets|images)\//.test(page));
});

test('importing the generator module runs no CLI code and writes nothing', async () => {
  const before = OUTPUT_PATHS.map((p) => (existsSync(join(ROOT, p)) ? statSync(join(ROOT, p)).mtimeMs : null));
  await import(`./build-legal.mjs?fresh=${Date.now()}`);
  const after = OUTPUT_PATHS.map((p) => (existsSync(join(ROOT, p)) ? statSync(join(ROOT, p)).mtimeMs : null));
  assert.deepEqual(after, before);
});

test('pageChecks passes every check for a well-formed page built from a clean fragment', () => {
  const page = composePage({ locale: 'en', kind: 'privacy', body: normaliseDocument(SAMPLE_FRAGMENT), strings: loadStrings('en'), chrome: loadChrome() });
  const checks = pageChecks({ page, source: SAMPLE_FRAGMENT, locale: 'en', kind: 'privacy' });
  assert.deepEqual(Object.values(checks), Object.keys(checks).map(() => true));
});

test('pageChecks flags each defect it guards against', () => {
  const page = composePage({ locale: 'en', kind: 'privacy', body: normaliseDocument(SAMPLE_FRAGMENT), strings: loadStrings('en'), chrome: loadChrome() });
  const swap = (from, to) => {
    assert.ok(page.includes(from), `fixture lacks ${from}`);
    return page.replace(from, to);
  };
  const defects = {
    'exactly one h1': swap('<h1>', '<h1>Extra</h1><h1>'),
    'no unresolved placeholder': swap('</article>', '\\(foo)</article>'),
    'no inline style': swap('<p>Email', '<p style="color: red">Email'),
    'no script/style in article': swap('</article>', '<script>1</script></article>'),
    'top-level allowlist': swap('<article class="legal">', '<article class="legal"><blockquote>q</blockquote>'),
    'no em dash': swap('<p>Email: <strong>dnf.velora@gmail.com</strong></p>', '<p>Email — <strong>dnf.velora@gmail.com</strong></p>'),
    'no bare legal href': swap('href="/privacy-policy/"', 'href="privacy-policy/"'),
    'no bare asset path': swap('href="/assets/css/legal.css"', 'href="assets/css/legal.css"'),
    'brand href is locale home': swap('<a href="/" class="brand-mark"', '<a href="/tr/" class="brand-mark"'),
    'data-locale matches lang': swap('<html lang="en" data-locale="en">', '<html lang="en" data-locale="tr">'),
    'canonical ends with slug': swap('href="https://velorahealthcompanion.com/privacy-policy/" />', 'href="https://velorahealthcompanion.com/privacy-policy" />'),
  };
  for (const [check, broken] of Object.entries(defects)) {
    const checks = pageChecks({ page: broken, source: SAMPLE_FRAGMENT, locale: 'en', kind: 'privacy' });
    assert.notEqual(checks[check], true, check);
  }
  const extraH2 = pageChecks({ page, source: `${SAMPLE_FRAGMENT}<h2>ghost</h2>`, locale: 'en', kind: 'privacy' });
  assert.equal(extraH2['h2 count matches source'], false);
});

test('build writes the four pages from a synthetic content dir', () => {
  const dir = tmpDir();
  const outDir = join(dir, 'out');
  const contentDir = seedContentDir(join(dir, 'content'));
  const lines = [];
  build({ outDir, contentDir, log: (l) => lines.push(l) });
  assert.deepEqual(listFiles(outDir).sort(), [...OUTPUT_PATHS].sort());
  assert.ok(lines.every((l) => !l.startsWith('FAIL')));
});

test('build fails and writes nothing when a source file is missing', () => {
  const dir = tmpDir();
  const outDir = join(dir, 'out');
  const contentDir = seedContentDir(join(dir, 'content'), { skip: ['terms.tr'] });
  assert.throws(() => build({ outDir, contentDir, log: () => {} }), /source not found/);
  assert.ok(!existsSync(outDir) || listFiles(outDir).length === 0);
});

test('build fails and writes nothing when a source file carries a disallowed element', () => {
  const dir = tmpDir();
  const outDir = join(dir, 'out');
  const contentDir = seedContentDir(join(dir, 'content'), {
    overrides: { 'privacy.en': SAMPLE_FRAGMENT.replace('<h1>', '<blockquote>x</blockquote><h1>') },
  });
  assert.throws(() => build({ outDir, contentDir, log: () => {} }), /<blockquote>/);
  assert.ok(!existsSync(outDir) || listFiles(outDir).length === 0);
});

test('build fails and writes nothing when a source file carries an em dash', () => {
  const dir = tmpDir();
  const outDir = join(dir, 'out');
  const contentDir = seedContentDir(join(dir, 'content'), {
    overrides: { 'terms.tr': SAMPLE_FRAGMENT.replace('Velora keeps data on device.', 'Velora keeps data on device — always.') },
  });
  assert.throws(() => build({ outDir, contentDir, log: () => {} }), /em dash \(U\+2014\)/);
  assert.ok(!existsSync(outDir) || listFiles(outDir).length === 0);
});

test('build writes the four pages matching the committed output from the real sources', () => {
  const outDir = join(tmpDir(), 'out');
  build({ outDir, log: () => {} });
  assert.deepEqual(listFiles(outDir).sort(), [...OUTPUT_PATHS].sort());
  for (const p of OUTPUT_PATHS) {
    assert.equal(readFileSync(join(outDir, p), 'utf8'), readFileSync(join(ROOT, p), 'utf8'), p);
  }
});

test('main exits non-zero on an unexpected argument', () => {
  const originalExit = process.exit;
  const originalError = console.error;
  let code;
  const errors = [];
  process.exit = (c) => { code = c; throw new Error('__exit__'); };
  console.error = (m) => errors.push(m);
  try {
    assert.throws(() => main(['x']), /__exit__/);
  } finally {
    process.exit = originalExit;
    console.error = originalError;
  }
  assert.equal(code, 1);
  assert.ok(errors.some((m) => m.includes('usage:')));
});

test('SOURCE_PATHS names the four content fragments', () => {
  assert.deepEqual(SOURCE_PATHS.sort(), [
    'content/legal/privacy-policy.en.html',
    'content/legal/privacy-policy.tr.html',
    'content/legal/terms-of-service.en.html',
    'content/legal/terms-of-service.tr.html',
  ].sort());
});
