#!/usr/bin/env node
// build-assets.mjs: content-hashes the references inside the served CSS and JS (KTD4):
// url() in assets/css/*.css and relative imports in assets/js/**/*.js, rewritten in place.
// A file's hash covers its rewritten text, so leaves are hashed first and a changed font or
// module propagates to every importer. 404.html is hand-written, so its refs are hashed here too.
//
//   node tools/build-assets.mjs   (also run first by: npm run build)

import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hashAssetsInPlace } from './lib/page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STANDALONE_PAGES = ['404.html'];

const walk = (dir, ext) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const path = join(dir, e.name);
  if (e.isDirectory()) return walk(path, ext);
  return e.name.endsWith(ext) ? [path] : [];
});

// Root-relative paths, sorted so the log and the rewrite order are stable across machines.
export function siteAssetFiles(rootDir = ROOT) {
  const files = [
    ...walk(join(rootDir, 'assets/css'), '.css'),
    ...walk(join(rootDir, 'assets/js'), '.js'),
  ].map((f) => relative(rootDir, f)).sort();
  return [...files, ...STANDALONE_PAGES];
}

export function build({ rootDir = ROOT, write = true, log = console.log } = {}) {
  const changed = hashAssetsInPlace(rootDir, siteAssetFiles(rootDir), { write });
  for (const f of changed) log(`${f} asset hashes ${write ? 'updated' : 'stale'}.`);
  if (!changed.length) log('asset hashes up to date.');
  return changed;
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
