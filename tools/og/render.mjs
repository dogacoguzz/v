// Renders tools/og/og-card.html to images/og.jpg (1200x630). Run: node tools/og/render.mjs
import { chromium } from '@playwright/test';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'images', 'og.jpg');
const executablePath =
  process.env.PW_CHROMIUM_PATH ||
  path.join(homedir(), 'Library/Caches/ms-playwright/chromium-1178/chrome-mac/Chromium.app/Contents/MacOS/Chromium');

const browser = await chromium.launch({ executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(here, 'og-card.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, type: 'jpeg', quality: 85 });
} finally {
  await browser.close();
}
