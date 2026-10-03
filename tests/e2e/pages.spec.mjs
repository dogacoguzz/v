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
    const link = page.locator(`.lang-switch a[data-locale="${locale}"]`);
    await expect(link).toHaveAttribute('aria-current', 'false');
    await expect(link).toHaveAttribute('href', to);
    await Promise.all([
      page.waitForURL((url) => url.pathname === to),
      link.click(),
    ]);
    await expect(page.locator('html')).toHaveAttribute('data-locale', locale);
    expect(await page.evaluate(() => localStorage.getItem('velora-lang'))).toBe(locale);
  });
}

test('a modified click on the other language leaves the saved locale alone', async ({ page }) => {
  await page.goto('/privacy-policy/');
  await page.evaluate(() => localStorage.setItem('velora-lang', 'en'));
  await page.locator('.lang-switch a[data-locale="tr"]').click({ modifiers: ['ControlOrMeta'] });
  await page.waitForTimeout(300);
  expect(new URL(page.url()).pathname).toBe('/privacy-policy/');
  expect(await page.evaluate(() => localStorage.getItem('velora-lang'))).toBe('en');
});

test('the EN home switch link on the TR home carries ?lang=en', async ({ page }) => {
  await page.goto('/tr/');
  await expect(page.locator('.lang-switch a[data-locale="en"]')).toHaveAttribute('href', '/?lang=en');
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', 'https://velorahealthcompanion.com/');
});

test('a TR browser with blocked storage can switch from /tr/ to the EN home and stay there', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'tr-TR' });
  await context.addInitScript(() => {
    const blocked = () => { throw new DOMException('storage blocked', 'SecurityError'); };
    Storage.prototype.getItem = blocked;
    Storage.prototype.setItem = blocked;
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForURL((url) => url.pathname === '/tr/');

  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.locator('.lang-switch a[data-locale="en"]').click(),
  ]);
  await page.waitForLoadState('load');
  await page.waitForTimeout(300);
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.locator('html')).toHaveAttribute('data-locale', 'en');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://velorahealthcompanion.com/');
  await context.close();
});

test('without JavaScript the language switch is a plain link to the counterpart page', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [from, locale, to] of [['/privacy-policy/', 'tr', '/tr/privacy-policy/'], ['/tr/rehber/ne-kadar-su/', 'en', '/guides/how-much-water/']]) {
    await page.goto(from);
    await Promise.all([
      page.waitForURL((url) => url.pathname === to),
      page.locator(`.lang-switch a[data-locale="${locale}"]`).click(),
    ]);
    await expect(page.locator('html')).toHaveAttribute('data-locale', locale);
    await expect(page.locator(`.lang-switch a[data-locale="${locale}"]`)).toHaveAttribute('aria-current', 'true');
  }
  await context.close();
});

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
