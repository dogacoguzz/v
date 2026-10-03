#!/usr/bin/env node
// build-llms.mjs: writes /llms.txt from the landing "What is Velora" block, its FAQ and the
// sitemap URLs. Runs after the sitemap builder: node tools/build-llms.mjs (or npm run build).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SOURCE_PATH, faqEntries } from './build-landing.mjs';
import { APP_NAME } from './lib/page.mjs';
import { guidePath, indexPath, loadGuides } from './build-guides.mjs';
import { collectPages } from './build-sitemap.mjs';
import { LOCALES, LOCALE_PATHS, SITE, storeUrl } from './lib/page.mjs';
import { EM_DASH } from './lib/util.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUT_PATH = 'llms.txt';

export function pageTitle(path, locale, { strings, guides }) {
  const s = strings[locale];
  const p = LOCALE_PATHS[locale];
  if (path === p.home) return s.meta.title;
  if (path === p.privacy) return s.legal.privacy.title;
  if (path === p.terms) return s.legal.terms.title;
  if (path === indexPath(locale)) return s.guides.indexMetaTitle;
  const guide = guides.find((g) => guidePath(locale, g[locale].meta.slug[locale]) === path);
  if (!guide) throw new Error(`llms.txt: no title for ${path}`);
  return guide[locale].meta.title;
}

export function renderLlms({ strings, guides, pages, source }) {
  const about = strings.en.day.about;
  const facts = faqEntries(source, strings.en).map(({ q, a }) => `- ${q} ${a}`);
  const links = pages.flatMap((page) => LOCALES.map((l) =>
    `- [${pageTitle(page.paths[l], l, { strings, guides })}](${SITE}${page.paths[l]})`));
  const text = `# ${APP_NAME}

> ${about.text}

${about.notAffiliated}

## Facts

${facts.join('\n')}

## Pages

${links.join('\n')}

## Get the app

- App Store: ${storeUrl('en', 'llms', 'link')}
`;
  if (text.includes(EM_DASH)) throw new Error('llms.txt: em dash (U+2014) is not allowed');
  return text;
}

export function build({ rootDir = ROOT, outDir = rootDir, contentDir = join(rootDir, 'content/guides'), log = console.log } = {}) {
  const strings = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(join(rootDir, `assets/data/strings.${l}.json`), 'utf8'))]));
  const source = readFileSync(join(rootDir, SOURCE_PATH), 'utf8');
  const text = renderLlms({ strings, guides: loadGuides(contentDir), pages: collectPages({ contentDir }), source });
  writeFileSync(join(outDir, OUTPUT_PATH), text);
  log(`${OUTPUT_PATH} written.`);
  return [OUTPUT_PATH];
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
