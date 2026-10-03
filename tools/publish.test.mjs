// publish.test.mjs: _config.yml keeps dev tooling out of the GitHub Pages bundle (KTD5)
// without excluding anything the site needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = readFileSync(join(ROOT, '_config.yml'), 'utf8');

const DEV_FILES = [
  'package.json', 'package-lock.json', 'tools', 'tests', 'content', 'playwright.config.mjs', 'lighthouse', 'README.md',
  'node_modules',
];
const PUBLISHED = [
  'index.html', '404.html', 'CNAME', 'robots.txt', 'sitemap.xml', 'llms.txt', 'eula', 'assets', 'images', 'guides', 'tr',
  'privacy-policy', 'terms-of-service',
];

const excludeList = (yaml) => {
  const lines = yaml.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  assert.deepEqual(lines.filter((l) => !/^\s+- /.test(l)), ['exclude:'], 'only an exclude: list is configured');
  return lines.filter((l) => /^\s+- /.test(l)).map((l) => l.replace(/^\s+- /, '').trim());
};

test('_config.yml excludes exactly the dev files', () => {
  assert.deepEqual(excludeList(config), DEV_FILES);
  for (const entry of DEV_FILES.filter((e) => e !== 'node_modules')) assert.ok(existsSync(join(ROOT, entry)), entry);
});

test('nothing the site serves is excluded, and no .nojekyll turns Jekyll off', () => {
  const excluded = new Set(excludeList(config));
  const keyFiles = readdirSync(ROOT).filter((f) => /\.txt$/.test(f));
  for (const path of [...PUBLISHED, ...keyFiles]) {
    assert.ok(!excluded.has(path), `${path} must stay published`);
    assert.ok(existsSync(join(ROOT, path)), `${path} exists`);
  }
  assert.ok(!existsSync(join(ROOT, '.nojekyll')));
});
