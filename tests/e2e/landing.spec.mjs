// landing.spec.mjs: the one-day landing page (AE2, AE3, R5, R6, R20).

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const HOMES = ['/', '/tr/'];
const MOMENTS = ['t0640', 'coach', 't1240', 't1810', 't2130', 't2300'];
const GOAL_7000 = /7[.,]000/;
const STEPS_3900 = /^3[.,]900$/;

const settle = (page) => page.evaluate(() => Promise.all(
  document.getAnimations()
    .filter((a) => a.timeline === document.timeline && a.effect?.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => {})),
));

// html has scroll-behavior: smooth, so focus scrolling animates; wait until scrollY holds still.
const scrollSettled = (page) => page.evaluate(() => new Promise((resolve) => {
  let last = -1;
  let still = 0;
  const tick = () => {
    still = window.scrollY === last ? still + 1 : 0;
    last = window.scrollY;
    if (still >= 4) resolve();
    else requestAnimationFrame(tick);
  };
  tick();
}));

for (const home of HOMES) {
  test.describe(`landing ${home}`, () => {
    test('AE2: reduced motion shows every moment, every card and the final numbers', async ({ browser }) => {
      const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      await page.goto(home);

      for (const id of MOMENTS) await expect(page.locator(`#${id}`)).toBeVisible();
      const pops = page.locator('[data-pop]');
      const count = await pops.count();
      expect(count).toBeGreaterThan(8);
      for (let i = 0; i < count; i++) {
        await expect(pops.nth(i)).toHaveCSS('opacity', '1');
        await expect(pops.nth(i)).toHaveClass(/\bin\b/);
      }
      await expect(page.locator('[data-steps-now]')).toHaveText(STEPS_3900);
      await expect(page.locator('[data-goal-value]')).toHaveText(/6[.,]500/);
      await page.locator('[data-set-goal]').click();
      await expect(page.locator('[data-goal-value]')).toHaveText(GOAL_7000);
      await context.close();
    });

    test('AE3: with scroll-driven animation unsupported the clock still advances', async ({ page }) => {
      await page.addInitScript(() => {
        const original = CSS.supports.bind(CSS);
        CSS.supports = (...args) => (String(args[0]).includes('animation-timeline') ? false : original(...args));
      });
      await page.goto(home);
      const hh = page.locator('[data-clock-hh]');
      await expect(hh).toHaveText('06');
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await expect(hh).toHaveText('23');
      const progress = await page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--progress')));
      expect(progress).toBeGreaterThan(0.9);
      for (const id of MOMENTS) await expect(page.locator(`#${id}`)).toBeAttached();
    });

    test('rail clock is aria-hidden; Set 7,000 sets aria-pressed and announces', async ({ page }) => {
      await page.goto(home);
      const hidden = await page.locator('[data-clock-hh]').evaluate((el) => !!el.closest('[aria-hidden="true"]'));
      expect(hidden).toBe(true);

      const button = page.locator('[data-set-goal]');
      await expect(button).toHaveAttribute('aria-pressed', 'false');
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      const status = page.locator('[data-goal-status]');
      await expect(status).toHaveAttribute('aria-live', 'polite');
      await expect(status).toHaveText(GOAL_7000);
      await expect(page.locator('[data-goal-out]').first()).toHaveText(GOAL_7000);
    });

    test('mobile 390x844: hero Coach card is in the first viewport and no overflow', async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      await page.goto(home);
      const box = await page.locator('.coach-card--hero').boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeLessThan(844);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await context.close();
    });

    test('mobile 390x844: keyboard focus is never hidden under the sticky time strip', async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.goto(home);
      const seen = new Set();
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        await scrollSettled(page);
        const result = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          if (el.closest('.skip-link, .rail')) return { skip: true };
          const rail = document.querySelector('.rail').getBoundingClientRect();
          const r = el.getBoundingClientRect();
          const inViewport = r.bottom > 0 && r.top < window.innerHeight;
          const above = r.bottom <= rail.top + 1;
          const below = r.top >= rail.bottom - 1;
          const stuck = getComputedStyle(document.querySelector('.rail')).position === 'sticky';
          return { label: (el.textContent.trim() || el.getAttribute('aria-label') || el.tagName).slice(0, 30), inViewport, ok: above || below || !stuck };
        });
        if (!result || result.skip) continue;
        seen.add(result.label);
        expect(result.inViewport, `${result.label} scrolled into view`).toBe(true);
        expect(result.ok, `${result.label} is hidden under the sticky strip`).toBe(true);
      }
      expect(seen.size).toBeGreaterThan(3);
      await context.close();
    });
  });
}

test.describe('landing axe (EN)', () => {
  for (const id of MOMENTS) {
    test(`no serious or critical violations at moment ${id}`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate((target) => document.getElementById(target).scrollIntoView({ behavior: 'instant', block: 'center' }), id);
      await page.waitForFunction((target) => (
        [...document.querySelectorAll(`#${target} [data-pop]`)].every((el) => el.classList.contains('in'))
      ), id);
      await settle(page);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
});
