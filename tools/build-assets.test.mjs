import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, siteAssetFiles } from './build-assets.mjs';
import { BUILDERS } from './build.mjs';
import { assetHash, fontPreloads, hashAssetRefs } from './lib/page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT = 'bricolage-grotesque-var.woff2';
const quiet = { log: () => {} };

const SITE_FILES = {
  [`assets/fonts/${FONT}`]: 'font-bytes-1',
  'assets/css/tokens.css': `@font-face { src: url('/assets/fonts/${FONT}') format('woff2'); }\n`,
  'assets/css/base.css': 'body { margin: 0; }\n',
  'assets/js/i18n.js': 'export const resolveLocale = () => "en";\n',
  'assets/js/boot.js': "import { resolveLocale } from './i18n.js';\nresolveLocale();\n",
  'assets/js/tools/calc.js': "import { resolveLocale } from '../i18n.js';\nresolveLocale();\n",
  '404.html': `<link rel="preload" href="/assets/fonts/${FONT}" as="font" crossorigin />`
    + '<link rel="stylesheet" href="/assets/css/tokens.css" />',
};

const withSite = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'velora-assets-'));
  try {
    for (const [path, content] of Object.entries(SITE_FILES)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    return fn(dir, (path) => readFileSync(join(dir, path), 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// A generated page as the builders render it: font preloads, stylesheet and boot module, hashed.
const renderPage = (dir, extraModule = '') => hashAssetRefs(
  fontPreloads(dir, [FONT]).map(({ href }) => `<link rel="preload" href="${href}" as="font" crossorigin />`).join('')
    + '<link rel="stylesheet" href="/assets/css/tokens.css" /><script type="module" src="/assets/js/boot.js"></script>'
    + extraModule,
  dir);

const q = (re, text) => re.exec(text)?.[1];
const fontFaceQuery = (css) => q(new RegExp(`url\\('/assets/fonts/${FONT}(\\?v=[0-9a-f]{8})'\\)`), css);
const preloadQuery = (html) => q(new RegExp(`rel="preload" href="/assets/fonts/${FONT}(\\?v=[0-9a-f]{8})"`), html);
const bootRef = (html) => q(/src="\/assets\/js\/boot\.js\?v=([0-9a-f]{8})"/, html);

test('assets run first and the sitemap last in npm run build', () => {
  const names = BUILDERS.map((b) => b.name);
  assert.equal(names[0], 'assets');
  assert.equal(names.at(-1), 'sitemap');
  assert.deepEqual([...names].sort(), ['assets', 'guides', 'landing', 'legal', 'sitemap']);
});

test('siteAssetFiles lists every CSS and JS file, nested ones included, plus 404.html', () => {
  withSite((dir) => {
    assert.deepEqual(siteAssetFiles(dir), [
      'assets/css/base.css', 'assets/css/tokens.css',
      'assets/js/boot.js', 'assets/js/i18n.js', 'assets/js/tools/calc.js',
      '404.html',
    ]);
  });
});

test('in-place hashing rewrites url() and imports once, then is idempotent', () => {
  withSite((dir, read) => {
    const changed = build({ rootDir: dir, ...quiet });
    assert.deepEqual(changed.sort(), ['404.html', 'assets/css/tokens.css', 'assets/js/boot.js', 'assets/js/tools/calc.js']);
    assert.equal(fontFaceQuery(read('assets/css/tokens.css')), `?v=${assetHash(`assets/fonts/${FONT}`, dir)}`);
    const i18n = assetHash('assets/js/i18n.js', dir);
    assert.ok(read('assets/js/boot.js').includes(`from './i18n.js?v=${i18n}'`));
    assert.ok(read('assets/js/tools/calc.js').includes(`from '../i18n.js?v=${i18n}'`));
    const snapshot = siteAssetFiles(dir).map(read);
    assert.deepEqual(build({ rootDir: dir, ...quiet }), []);
    assert.deepEqual(siteAssetFiles(dir).map(read), snapshot, 'second run changes nothing');
  });
});

test('a changed font file changes the preload URL and the @font-face src identically', () => {
  withSite((dir, read) => {
    build({ rootDir: dir, ...quiet });
    const before = { css: fontFaceQuery(read('assets/css/tokens.css')), page: preloadQuery(renderPage(dir)) };
    assert.equal(before.page, before.css);
    assert.equal(preloadQuery(read('404.html')), before.css, '404.html preload matches too');

    writeFileSync(join(dir, `assets/fonts/${FONT}`), 'font-bytes-2');
    build({ rootDir: dir, ...quiet });
    const after = { css: fontFaceQuery(read('assets/css/tokens.css')), page: preloadQuery(renderPage(dir)) };
    assert.notEqual(after.css, before.css);
    assert.equal(after.page, after.css);
    assert.equal(preloadQuery(read('404.html')), after.css);
  });
});

test('a changed i18n.js changes the hash in boot.js\'s import and in every page referencing boot.js', () => {
  withSite((dir, read) => {
    build({ rootDir: dir, ...quiet });
    const importRef = () => q(/from '\.\/i18n\.js\?v=([0-9a-f]{8})'/, read('assets/js/boot.js'));
    const pages = () => [renderPage(dir), renderPage(dir, '<script type="module" src="/assets/js/tools/calc.js"></script>')];
    const before = { import: importRef(), pages: pages().map(bootRef) };
    assert.equal(new Set(before.pages).size, 1);

    writeFileSync(join(dir, 'assets/js/i18n.js'), 'export const resolveLocale = () => "tr";\n');
    build({ rootDir: dir, ...quiet });
    const after = { import: importRef(), pages: pages().map(bootRef) };
    assert.equal(after.import, assetHash('assets/js/i18n.js', dir));
    assert.notEqual(after.import, before.import);
    for (const ref of after.pages) {
      assert.notEqual(ref, before.pages[0]);
      assert.equal(ref, assetHash('assets/js/boot.js', dir), 'page hash equals the rewritten boot.js on disk');
    }
  });
});

// --- The committed site ---

const SKIP_DIRS = new Set(['node_modules', 'tools', 'tests', 'content', 'test-results', 'playwright-report', 'lighthouse']);
const htmlPages = (dir = ROOT) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) return [];
  const path = join(dir, e.name);
  if (e.isDirectory()) return htmlPages(path);
  return e.name.endsWith('.html') ? [relative(ROOT, path)] : [];
});

test('committed CSS, JS and 404.html carry current hashes', () => {
  assert.deepEqual(build({ rootDir: ROOT, write: false, ...quiet }), [], 'stale asset hashes; run npm run build');
});

test('every generated page loads boot.js at its current hash and preloads fonts as tokens.css declares them', () => {
  const tokens = readFileSync(join(ROOT, 'assets/css/tokens.css'), 'utf8');
  const fontSrc = new Map([...tokens.matchAll(/url\('(\/assets\/fonts\/[^'?]+)(\?v=[0-9a-f]{8})'\)/g)].map((m) => [m[1], m[2]]));
  const boot = assetHash('assets/js/boot.js', ROOT);
  const generated = htmlPages().filter((p) => /data-locale="(?:en|tr)"/.test(readFileSync(join(ROOT, p), 'utf8')));
  assert.ok(generated.length >= 16, `found ${generated.length} generated pages`);
  for (const path of [...generated, '404.html']) {
    const html = readFileSync(join(ROOT, path), 'utf8');
    if (path !== '404.html') {
      assert.equal(bootRef(html), boot, `${path}: boot.js ref`);
      assert.ok(!html.includes('/assets/js/app.js'), `${path}: still loads app.js`);
    }
    const preloads = [...html.matchAll(/<link rel="preload" href="(\/assets\/fonts\/[^"?]+)(\?v=[0-9a-f]{8})"/g)];
    assert.ok(preloads.length >= 1 && preloads.length <= 2, `${path}: ${preloads.length} font preloads`);
    for (const [, href, query] of preloads) assert.equal(query, fontSrc.get(href), `${path}: ${href}`);
  }
});
