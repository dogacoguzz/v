// calculator.spec.mjs: the steps-to-distance tool wired into its guide pages (R15).

import { test, expect } from '@playwright/test';

const EN = '/guides/steps-to-distance/';
const TR = '/tr/rehber/adim-mesafe/';

async function open(page, path) {
  await page.goto(path);
  const tool = page.locator('[data-steps-distance]');
  await expect(tool.locator('form')).toBeVisible();
  return { tool, output: tool.locator('output'), steps: tool.locator('input[name="steps"]') };
}

test('EN: steps and step length give a distance', async ({ page }) => {
  const { tool, output, steps } = await open(page, EN);
  await steps.fill('8000');
  await tool.locator('input[name="stepLengthCm"]').fill('80');
  await expect(output).toHaveAttribute('data-state', 'result');
  await expect(output).toHaveText('6.4 km at 80 cm per step');
});

test('EN: height mode and imperial units swap the visible fields and the result', async ({ page }) => {
  const { tool, output, steps } = await open(page, EN);
  await steps.fill('10000');
  await expect(tool.locator('[data-show-mode="stepLength"]')).toBeVisible();
  await expect(tool.locator('[data-show-mode="height"]')).toBeHidden();

  await tool.locator('input[name="mode"][value="height"]').check();
  await expect(tool.locator('[data-show-mode="height"]')).toBeVisible();
  await expect(tool.locator('[data-show-mode="stepLength"]')).toBeHidden();
  await expect(tool.locator('input[name="heightCm"]')).toBeVisible();
  await expect(tool.locator('input[name="heightFt"]')).toBeHidden();
  await expect(output).toHaveText('7.26 km at 72.6 cm per step');

  await tool.locator('input[name="units"][value="imperial"]').check();
  await expect(tool.locator('input[name="heightFt"]')).toBeVisible();
  await expect(tool.locator('input[name="heightIn"]')).toBeVisible();
  await expect(tool.locator('input[name="heightCm"]')).toBeHidden();
  await expect(output).toHaveAttribute('data-state', 'result');
  await expect(output).toHaveText('4.52 mi at 28.6 in per step');
});

for (const path of [EN, TR]) {
  test(`${path}: clearing steps marks the field invalid and shows the message`, async ({ page }) => {
    const { tool, output, steps } = await open(page, path);
    await steps.fill('');
    await expect(steps).toHaveAttribute('aria-invalid', 'true');
    await expect(output).toHaveAttribute('data-state', 'message');
    await expect(output).toHaveText(await tool.getAttribute('data-msg-empty'));
    await steps.fill('9000');
    await expect(steps).not.toHaveAttribute('aria-invalid', /.*/);
    await expect(output).toHaveAttribute('data-state', 'result');
  });
}

test('TR: the result uses Turkish number formatting', async ({ page }) => {
  const { tool, output, steps } = await open(page, TR);
  await steps.fill('8000');
  await tool.locator('input[name="stepLengthCm"]').fill('80');
  await expect(output).toHaveAttribute('data-state', 'result');
  await expect(output).toHaveText('6,4 km (adım başına 80 cm)');
  await tool.locator('input[name="mode"][value="height"]').check();
  await tool.locator('input[name="heightCm"]').fill('180');
  await steps.fill('10000');
  await expect(output).toHaveText('7,47 km (adım başına 74,7 cm)');
});
