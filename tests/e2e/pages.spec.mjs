// pages.spec.mjs: every page family (R6, R15, R16, R19, R20): overflow, origins, axe, language
// switch, sitemap.

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const OVERFLOW_PAGES = [
  ['/', 200],
  ['/tr/', 200],
  ['/privacy-policy/', 200],
  ['/tr/terms-of-service/', 200],
  ['/guides/', 200],
  ['/guides/steps-to-distance/', 200],
  ['/tr/rehber/adim-mesafe/', 200],
  ['/404-check', 404],
];
const AXE_PAGES = ['/tr/', '/privacy-policy/', '/guides/daily-step-goal/'];
const ORIGIN_PAGES = ['/', '/tr/', '/privacy-policy/', '/guides/', '/guides/daily-step-goal/', '/404-check'];

// Pop-in cards start at opacity 0; axe must read them after their entry transitions finish.
const settle = (page) => page.evaluate(() => Promise.all(
  document.getAnimations()
    .filter((a) => a.timeline === document.timeline && a.effect?.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => {})),
));

for (const [path, status] of OVERFLOW_PAGES) {
  test(`no horizontal overflow at 390 px: ${path}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const response = await page.goto(path);
    expect(response.status()).toBe(status);
    await page.evaluate(() => document.fonts.ready);
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(scroll).toBeLessThanOrEqual(inner);
    await context.close();
  });
}

for (const path of ORIGIN_PAGES) {
  test(`makes no request to another origin: ${path}`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const foreign = [];
    page.on('request', (request) => {
      const url = request.url();
      if (/^(data|blob|about):/.test(url)) return;
      if (new URL(url).origin !== origin) foreign.push(url);
    });
    await page.goto(path);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForLoadState('networkidle');
    expect(foreign).toEqual([]);
  });
}

for (const path of AXE_PAGES) {
  test(`axe: no serious or critical violations: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await settle(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
}

const LANG_SWITCH = [
  ['/privacy-policy/', 'tr', '/tr/privacy-policy/'],
  ['/tr/terms-of-service/', 'en', '/terms-of-service/'],
  ['/guides/daily-step-goal/', 'tr', '/tr/rehber/gunluk-adim-hedefi/'],
  ['/tr/rehber/', 'en', '/guides/'],
];

for (const [from, locale, to] of LANG_SWITCH) {
  test(`language switch on ${from} goes to its ${locale} counterpart ${to}`, async ({ page }) => {
    await page.goto(from);
    await expect(page.locator(`.lang-switch button[data-locale="${locale}"]`)).toHaveAttribute('aria-current', 'false');
    await Promise.all([
      page.waitForURL((url) => url.pathname === to),
      page.locator(`.lang-switch button[data-locale="${locale}"]`).click(),
    ]);
    await expect(page.locator('html')).toHaveAttribute('data-locale', locale);
    expect(await page.evaluate(() => localStorage.getItem('velora-lang'))).toBe(locale);
  });
}

test('404 page is noindex and links home in both languages', async ({ page }) => {
  const response = await page.goto('/no/such/page');
  expect(response.status()).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('a[href="/"]')).toBeVisible();
  await expect(page.locator('a[href="/tr/"]')).toBeVisible();
});

test('every sitemap URL returns 200 from the local server', async ({ request }) => {
  const xml = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  const paths = [...new Set([...xml.matchAll(/<(?:loc|xhtml:link)[^>]*?(?:href="|>)https:\/\/velorahealthcompanion\.com([^"<]*)/g)].map((m) => m[1]))];
  expect(paths.length).toBeGreaterThanOrEqual(16);
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }
});
