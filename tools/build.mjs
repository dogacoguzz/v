#!/usr/bin/env node
// build.mjs: runs every site builder in order: legal, landing, then (as later units land)
// guides and sitemap. The first builder that throws stops the run; later builders never start.
//
//   npm run build   (or: node tools/build.mjs)

import { pathToFileURL } from 'node:url';
import { build as buildGuides } from './build-guides.mjs';
import { build as buildLanding } from './build-landing.mjs';
import { build as buildLegal } from './build-legal.mjs';

export const BUILDERS = [
  { name: 'legal', run: ({ log }) => buildLegal({ log }) },
  { name: 'landing', run: ({ log }) => buildLanding({ log }) },
  { name: 'guides', run: ({ log }) => buildGuides({ log }) },
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
