#!/usr/bin/env node
// build.mjs: runs every site builder in order: asset hashes, legal, landing, guides, sitemap, llms.txt.
// The first builder that throws stops the run; later builders never start.
//
//   npm run build   (or: node tools/build.mjs)

import { pathToFileURL } from 'node:url';
import { build as buildAssets } from './build-assets.mjs';
import { build as buildGuides } from './build-guides.mjs';
import { build as buildLanding } from './build-landing.mjs';
import { build as buildLegal } from './build-legal.mjs';
import { build as buildLlms } from './build-llms.mjs';
import { build as buildSitemap } from './build-sitemap.mjs';

// Assets run first so the CSS and JS on disk match the hashes the pages reference.
export const BUILDERS = [
  { name: 'assets', run: ({ log }) => buildAssets({ log }) },
  { name: 'legal', run: ({ log }) => buildLegal({ log }) },
  { name: 'landing', run: ({ log }) => buildLanding({ log }) },
  { name: 'guides', run: ({ log }) => buildGuides({ log }) },
  { name: 'sitemap', run: ({ log }) => buildSitemap({ log }) },
  { name: 'llms', run: ({ log }) => buildLlms({ log }) },
];

export async function runBuilders(builders = BUILDERS, { log = console.log } = {}) {
  for (const builder of builders) {
    log(`== ${builder.name}`);
    try {
      await builder.run({ log });
    } catch (e) {
      throw new Error(`${builder.name}: ${e.message}`);
    }
  }
}

export async function main() {
  try {
    await runBuilders();
  } catch (e) {
    console.error(`build failed at ${e.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
