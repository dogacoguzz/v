// build-sitemap.test.mjs: run with node --test tools/build-sitemap.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, collectPages, renderSitemap } from './build-sitemap.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content/guides');

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

test('sitemap: covers home, legal, guides index and every guide in both locales', () => {
  const xml = renderSitemap(collectPages({ contentDir: CONTENT }));
  const urls = locs(xml);
  for (const p of ['/', '/tr/', '/privacy-policy/', '/tr/privacy-policy/', '/terms-of-service/', '/tr/terms-of-service/', '/guides/', '/tr/rehber/']) {
    assert.ok(urls.includes(`https://velorahealthcompanion.com${p}`), p);
  }
  assert.ok(urls.includes('https://velorahealthcompanion.com/guides/daily-step-goal/'));
  assert.ok(urls.some((u) => u.startsWith('https://velorahealthcompanion.com/tr/rehber/') && u !== 'https://velorahealthcompanion.com/tr/rehber/'));
  assert.equal(new Set(urls).size, urls.length, 'no duplicate URLs');
  assert.ok(!urls.some((u) => /eula/.test(u)));
});

test('sitemap: every URL carries en, tr and x-default alternates that point at the pair', () => {
  const xml = renderSitemap(collectPages({ contentDir: CONTENT }));
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g);
  assert.ok(blocks.length >= 8);
  for (const block of blocks) {
    const alt = Object.fromEntries([...block.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    assert.deepEqual(Object.keys(alt).sort(), ['en', 'tr', 'x-default']);
    assert.equal(alt['x-default'], alt.en);
    assert.ok(block.includes(`<loc>${alt.en}</loc>`) || block.includes(`<loc>${alt.tr}</loc>`));
  }
});

test('sitemap: guide entries carry lastmod dates, other pages none', () => {
  const xml = renderSitemap(collectPages({ contentDir: CONTENT }));
  const dates = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
  assert.ok(dates.length > 0);
  for (const d of dates) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
  const home = xml.match(/<url>\s*<loc>https:\/\/velorahealthcompanion\.com\/<\/loc>[\s\S]*?<\/url>/)[0];
  assert.ok(!home.includes('lastmod'));
});

test('sitemap: build writes the file when every page exists and fails when one is missing', () => {
  const out = mkdtempSync(join(tmpdir(), 'velora-sitemap-'));
  const files = build({ rootDir: ROOT, outDir: out, log: () => {} });
  assert.deepEqual(files, ['sitemap.xml']);
  const xml = readFileSync(join(out, 'sitemap.xml'), 'utf8');
  assert.ok(xml.startsWith('<?xml'));
  assert.ok(!xml.includes(String.fromCharCode(0x2014)));

  const partial = mkdtempSync(join(tmpdir(), 'velora-sitemap-root-'));
  cpSync(CONTENT, join(partial, 'content/guides'), { recursive: true });
  assert.throws(() => build({ rootDir: partial, outDir: out, log: () => {} }), /built pages missing/);
  assert.ok(existsSync(join(out, 'sitemap.xml')));
});
