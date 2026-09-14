// build-legal.test.mjs — run with: node --test tools/build-legal.test.mjs
// RC_EXPORT may point at a Remote Config export; the real-document tests skip without it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  count,
  OUTPUT_PATHS,
  assertClean,
  build,
  composePage,
  extractBody,
  loadChrome,
  stripInlineStyles,
  substitutePlaceholders,
  wrapTables,
} from './build-legal.mjs';
import { applyI18nStrings, keyParity, markLangSwitch, rewriteRootRelativePaths } from './lib/prerender.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RC_EXPORT = process.env.RC_EXPORT || '/tmp/rc.json';
const LEGAL_KEYS = ['privacy_policy_en', 'privacy_policy_tr', 'terms_of_service_en', 'terms_of_service_tr'];

const readExport = () => (existsSync(RC_EXPORT) ? JSON.parse(readFileSync(RC_EXPORT, 'utf8')) : null);
const tmpDir = () => mkdtempSync(join(tmpdir(), 'build-legal-'));
const writeExport = (dir, parameters) => {
  const file = join(dir, 'rc-export.json');
  writeFileSync(file, JSON.stringify({ parameters }));
  return file;
};
const param = (value) => ({ defaultValue: { value } });
const listFiles = (dir) => readdirSync(dir, { recursive: true }).filter((f) => statSync(join(dir, f)).isFile());

const SAMPLE = `<!DOCTYPE html>
<html><head><title>\\(appName) Privacy</title><style>\\(sharedCSS)</style></head>
<body>
  <div class="container">
    <h1>\\(appName) Privacy Policy</h1>
    <p class="last-updated">Effective: 1 Jan 2026</p>
    <div class="highlight">
      <h2>1. Summary</h2>
      <p>\\(appName) keeps data on device.</p>
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
      <p><strong>App Version:</strong> \\(appVersion)</p>
      <p style="margin-top: 20px; font-size: 12px; color: #666;">© \\(appName) / Doğaç Oğuz. All Rights Reserved.</p>
    </div>
  </div>
</body></html>`;

const normalise = (html) => wrapTables(stripInlineStyles(substitutePlaceholders(extractBody(html))));

test('extractBody unwraps the container and keeps order and h2 count', () => {
  const body = extractBody(SAMPLE);
  assert.ok(body.trim().startsWith('<h1>'));
  assert.ok(body.trim().endsWith('</div>'));
  assert.equal(count(body, /<h2/g), 3);
  assert.ok(body.indexOf('1. Summary') < body.indexOf('2. Data'));
  assert.ok(body.indexOf('2. Data') < body.indexOf('3. Contact'));
  assert.ok(!body.includes('<div class="container">'));
  assert.ok(!body.includes('</body>'));
});

test('extractBody throws when the container is missing', () => {
  assert.throws(() => extractBody('<html><body><p>x</p></body></html>'), /div class="container"/);
});

test('substitutePlaceholders maps appName and drops only the appVersion paragraph', () => {
  const out = substitutePlaceholders(extractBody(SAMPLE));
  assert.ok(!out.includes('\\(appName)'));
  assert.ok(out.includes('<h1>Velora Privacy Policy</h1>'));
  assert.ok(out.includes('<p>Velora keeps data on device.</p>'));
  assert.ok(!out.includes('appVersion'));
  assert.ok(!out.includes('App Version'));
  assert.ok(out.includes('<p>Email: <strong>dnf.velora@gmail.com</strong></p>'));
  assert.ok(out.includes('© Velora / Doğaç Oğuz. All Rights Reserved.'));
  assert.equal(count(out, /<p\b/g), 4);
});

test('substitutePlaceholders throws when sharedCSS reaches the body', () => {
  assert.throws(() => substitutePlaceholders('<p>\\(sharedCSS)</p>'), /sharedCSS/);
});

test('sharedCSS in the source head never reaches the normalised body', () => {
  const out = normalise(SAMPLE);
  assert.ok(!out.includes('\\('));
  assert.doesNotThrow(() => assertClean(out));
});

test('stripInlineStyles removes the copyright style attribute and keeps its text', () => {
  const out = stripInlineStyles(extractBody(SAMPLE));
  assert.ok(!/ style=/.test(out));
  assert.ok(out.includes('<p>© \\(appName) / Doğaç Oğuz. All Rights Reserved.</p>'));
});

test('wrapTables wraps each data table exactly once and is idempotent', () => {
  const once = wrapTables(extractBody(SAMPLE));
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

test('the four real documents pass assertClean after normalisation', (t) => {
  const rc = readExport();
  if (!rc) return t.skip(`no export at ${RC_EXPORT}`);
  for (const key of LEGAL_KEYS) {
    const source = rc.parameters[key].defaultValue.value;
    const out = normalise(source);
    assert.doesNotThrow(() => assertClean(out), key);
    assert.equal(count(out, /<h2/g), count(source, /<h2/g), key);
    assert.equal(count(out, /<h1/g), 1, key);
  }
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

test('composePage builds the locale-specific head and chrome around the body', () => {
  const chrome = loadChrome();
  const strings = JSON.parse(readFileSync(join(ROOT, 'assets/data/strings.tr.json'), 'utf8'));
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

test('build fails on a missing parameter and writes nothing', (t) => {
  const rc = readExport();
  if (!rc) return t.skip(`no export at ${RC_EXPORT}`);
  const parameters = Object.fromEntries(LEGAL_KEYS.map((k) => [k, rc.parameters[k]]));
  parameters.eula_url = rc.parameters.eula_url;
  delete parameters.terms_of_service_tr;
  const dir = tmpDir();
  const outDir = join(dir, 'out');
  assert.throws(() => build({ exportPath: writeExport(dir, parameters), outDir, log: () => {} }), /MISSING PARAMETER terms_of_service_tr/);
  assert.ok(!existsSync(outDir) || listFiles(outDir).length === 0);
});

test('build fails when eula_url differs from eula.html and writes nothing', (t) => {
  const rc = readExport();
  if (!rc) return t.skip(`no export at ${RC_EXPORT}`);
  const parameters = Object.fromEntries(LEGAL_KEYS.map((k) => [k, rc.parameters[k]]));
  parameters.eula_url = param('https://example.com/eula');
  const dir = tmpDir();
  const outDir = join(dir, 'out');
  assert.throws(() => build({ exportPath: writeExport(dir, parameters), outDir, log: () => {} }), /eula_url/);
  assert.ok(!existsSync(outDir) || listFiles(outDir).length === 0);
});

test('build fails when a document carries a disallowed element and writes nothing', (t) => {
  const rc = readExport();
  if (!rc) return t.skip(`no export at ${RC_EXPORT}`);
  const parameters = Object.fromEntries(LEGAL_KEYS.map((k) => [k, rc.parameters[k]]));
  parameters.eula_url = rc.parameters.eula_url;
  const broken = rc.parameters.privacy_policy_en.defaultValue.value.replace('<h1>', '<blockquote>x</blockquote><h1>');
  parameters.privacy_policy_en = param(broken);
  const dir = tmpDir();
  const outDir = join(dir, 'out');
  assert.throws(() => build({ exportPath: writeExport(dir, parameters), outDir, log: () => {} }), /<blockquote>/);
  assert.ok(!existsSync(outDir) || listFiles(outDir).length === 0);
});

test('build writes the four pages and matches the committed output', (t) => {
  const rc = readExport();
  if (!rc) return t.skip(`no export at ${RC_EXPORT}`);
  const outDir = join(tmpDir(), 'out');
  build({ exportPath: RC_EXPORT, outDir, log: () => {} });
  assert.deepEqual(listFiles(outDir).sort(), [...OUTPUT_PATHS].sort());
  for (const p of OUTPUT_PATHS) {
    if (!existsSync(join(ROOT, p))) continue;
    assert.equal(readFileSync(join(outDir, p), 'utf8'), readFileSync(join(ROOT, p), 'utf8'), p);
  }
});
