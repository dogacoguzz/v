// build-llms.test.mjs: /llms.txt mirrors the landing identity block and lists the sitemap URLs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTPUT_PATH, build, pageTitle } from './build-llms.mjs';
import { loadGuides } from './build-guides.mjs';
import { storeUrl } from './lib/page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const committed = read(OUTPUT_PATH);
const strings = { en: JSON.parse(read('assets/data/strings.en.json')), tr: JSON.parse(read('assets/data/strings.tr.json')) };

test('committed llms.txt equals a fresh build', () => {
  const out = mkdtempSync(join(tmpdir(), 'velora-llms-'));
  assert.deepEqual(build({ rootDir: ROOT, outDir: out, log: () => {} }), [OUTPUT_PATH]);
  assert.equal(readFileSync(join(out, OUTPUT_PATH), 'utf8'), committed, 'llms.txt is stale; run npm run build');
});

test('llms.txt lists exactly the sitemap URLs, each with its page title', () => {
  const sitemap = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const listed = [...committed.matchAll(/^- \[([^\]]+)\]\((https:\/\/[^)]+)\)$/gm)];
  assert.deepEqual(listed.map((m) => m[2]).sort(), [...sitemap].sort());
  const guides = loadGuides();
  for (const [, title, url] of listed) {
    const path = new URL(url).pathname;
    const locale = path.startsWith('/tr/') ? 'tr' : 'en';
    assert.equal(title, pageTitle(path, locale, { strings, guides }));
  }
  assert.throws(() => pageTitle('/nope/', 'en', { strings, guides }), /no title/);
});

test('llms.txt mirrors the visible identity block and FAQ, and links the store with a campaign', () => {
  const about = strings.en.day.about;
  assert.ok(committed.startsWith('# Velora: Health Companion\n'));
  assert.ok(committed.includes(`> ${about.text}`));
  assert.ok(committed.includes(about.notAffiliated));
  for (const { q, a } of Object.values(about.faq)) assert.ok(committed.includes(`- ${q} ${a}`), q);
  assert.ok(committed.includes(storeUrl('en', 'llms', 'link')));
});

test('llms.txt makes no unverified claim: no em dash, markers, prices, trials, founder or contact', () => {
  assert.ok(!committed.includes('—'));
  assert.ok(!/DOĞRULANMADI|DOGRULANMADI/i.test(committed));
  assert.ok(!/\$\s?\d|\d\s?(?:TL|TRY|USD)\b|7 days|7 gün|free trial|deneme/i.test(committed));
  assert.ok(!/founder|developer:|contact|@[a-z0-9-]+\./i.test(committed));
});
