#!/usr/bin/env node
// build.mjs: runs every site builder in order: legal, landing, then (as later units land)
// guides and sitemap. The first builder that throws stops the run; later builders never start.
//
//   npm run build   (or: node tools/build.mjs)

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as buildLegal } from './build-legal.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// build-tr.mjs runs on import and exits the process on failure, so it runs as a child process.
function runNodeScript(path) {
  const result = spawnSync(process.execPath, [join(ROOT, path)], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${path} exited with status ${result.status ?? result.signal}`);
}

export const BUILDERS = [
  { name: 'legal', run: ({ log }) => buildLegal({ log }) },
  { name: 'landing', run: () => runNodeScript('tools/build-tr.mjs') },
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
