#!/usr/bin/env node
// lighthouse.mjs: lab performance check against a local serve of the site (KTD5, R20).
// Mobile emulation (Lighthouse default). Fails when LCP, CLS or TBT exceed lighthouse/budget.json.
//
//   npm run lighthouse
//
// Needs a Chrome or Chromium binary: set CHROME_PATH (or PW_CHROMIUM_PATH), else chrome-launcher
// looks for an installed Chrome.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { createServer } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.LIGHTHOUSE_PORT) || 4180;

export const loadBudget = (file = join(ROOT, 'lighthouse/budget.json')) => JSON.parse(readFileSync(file, 'utf8'));

// Returns one message per exceeded budget; empty when the page passes.
export function evaluate(metrics, budget) {
  const failures = [];
  if (metrics.lcp > budget.lcpMs) failures.push(`LCP ${Math.round(metrics.lcp)} ms > ${budget.lcpMs} ms`);
  if (metrics.cls > budget.cls) failures.push(`CLS ${metrics.cls.toFixed(3)} > ${budget.cls}`);
  if (metrics.tbt > budget.tbtMs) failures.push(`TBT ${Math.round(metrics.tbt)} ms > ${budget.tbtMs} ms`);
  return failures;
}

export async function main() {
  const budget = loadBudget();
  const server = createServer().listen(PORT, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const chromePath = process.env.CHROME_PATH || process.env.PW_CHROMIUM_PATH || undefined;
  const chrome = await launch({ chromePath, chromeFlags: ['--headless=new', '--no-sandbox'] });
  let failed = false;
  try {
    for (const path of budget.urls) {
      const result = await lighthouse(`http://127.0.0.1:${PORT}${path}`, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance'],
      });
      const audits = result.lhr.audits;
      const metrics = {
        lcp: audits['largest-contentful-paint'].numericValue,
        cls: audits['cumulative-layout-shift'].numericValue,
        tbt: audits['total-blocking-time'].numericValue,
      };
      const failures = evaluate(metrics, budget);
      const score = Math.round((result.lhr.categories.performance.score ?? 0) * 100);
      console.log(`${failures.length ? 'FAIL' : 'ok  '} ${path}  perf ${score}  LCP ${Math.round(metrics.lcp)} ms  CLS ${metrics.cls.toFixed(3)}  TBT ${Math.round(metrics.tbt)} ms`);
      for (const f of failures) console.log(`       ${f}`);
      if (failures.length) failed = true;
    }
  } finally {
    await chrome.kill();
    server.close();
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
