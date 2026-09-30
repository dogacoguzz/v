#!/usr/bin/env node
// build-sitemap.mjs: writes sitemap.xml from the built pages, with hreflang alternates per URL.
// /eula stays out of it. Run after the other builders (npm run build).
//
//   node tools/build-sitemap.mjs

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { guidePath, indexPath, loadGuides } from './build-guides.mjs';
import { LOCALES, LOCALE_PATHS, SITE, escapeAttr } from './lib/page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const fileFor = (urlPath) => `${urlPath.replace(/^\//, '')}index.html`;

// Each entry is one page pair: paths[locale] are the canonical URL paths.
export function collectPages({ contentDir }) {
  const pages = [
    { paths: { en: LOCALE_PATHS.en.home, tr: LOCALE_PATHS.tr.home } },
    { paths: { en: LOCALE_PATHS.en.privacy, tr: LOCALE_PATHS.tr.privacy } },
    { paths: { en: LOCALE_PATHS.en.terms, tr: LOCALE_PATHS.tr.terms } },
    { paths: { en: indexPath('en'), tr: indexPath('tr') } },
  ];
  for (const guide of loadGuides(contentDir)) {
    pages.push({
      paths: Object.fromEntries(LOCALES.map((l) => [l, guidePath(l, guide[l].meta.slug[l])])),
      lastmod: { en: guide.en.meta.lastReviewed, tr: guide.tr.meta.lastReviewed },
    });
  }
  return pages;
}

export function renderSitemap(pages) {
  const abs = (p) => `${SITE}${p}`;
  const urls = [];
  for (const page of pages) {
    const alternates = [
      ...LOCALES.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${escapeAttr(abs(page.paths[l]))}" />`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeAttr(abs(page.paths.en))}" />`,
    ].join('\n');
    for (const l of LOCALES) {
      const lastmod = page.lastmod?.[l] ? `\n    <lastmod>${page.lastmod[l]}</lastmod>` : '';
      urls.push(`  <url>\n    <loc>${escapeAttr(abs(page.paths[l]))}</loc>${lastmod}\n${alternates}\n  </url>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

export function build({ rootDir = ROOT, outDir = rootDir, contentDir = join(rootDir, 'content/guides'), log = console.log } = {}) {
  const pages = collectPages({ contentDir });
  const missing = pages.flatMap((p) => LOCALES.map((l) => fileFor(p.paths[l]))).filter((f) => !existsSync(join(rootDir, f)));
  if (missing.length) throw new Error(`sitemap: built pages missing (run the other builders first): ${missing.join(', ')}`);
  const xml = renderSitemap(pages);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'sitemap.xml'), xml);
  log(`sitemap.xml written (${pages.length * LOCALES.length} URLs).`);
  return ['sitemap.xml'];
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
