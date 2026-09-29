// contrast.test.mjs: WCAG contrast of the design token pairs in assets/css/tokens.css.
// run with: node --test tools/contrast.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(ROOT, 'assets/css/tokens.css'), 'utf8');

const tokens = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const need = (name) => {
  assert.ok(tokens[name], `token --${name} missing from tokens.css`);
  return tokens[name];
};

const DAY_TONES = ['day-morning', 'day-day', 'day-evening', 'day-night', 'surface'];
const CARDS = ['surface-card', 'surface-card-2'];
const DATA_COLOURS = ['data-steps', 'data-run', 'data-water', 'data-drink', 'data-night'];

test('contrast: body and secondary text reach 4.5:1 on every day tone and card', () => {
  for (const fg of ['text-main', 'text-secondary', 'text-tertiary']) {
    for (const bg of [...DAY_TONES, ...CARDS]) {
      const ratio = contrast(need(fg), need(bg));
      assert.ok(ratio >= 4.5, `--${fg} on --${bg} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('contrast: coach card text reaches 4.5:1 on the coach surface', () => {
  for (const fg of ['text-main', 'coach-text-soft', 'coach']) {
    const ratio = contrast(need(fg), need('coach-surface'));
    assert.ok(ratio >= 4.5, `--${fg} on --coach-surface is ${ratio.toFixed(2)}:1`);
  }
});

test('contrast: dark ink on every data colour and on the coach colour reaches 4.5:1', () => {
  for (const bg of DATA_COLOURS) {
    const ratio = contrast(need('data-ink'), need(bg));
    assert.ok(ratio >= 4.5, `--data-ink on --${bg} is ${ratio.toFixed(2)}:1`);
  }
  const coach = contrast(need('coach-ink'), need('coach'));
  assert.ok(coach >= 4.5, `--coach-ink on --coach is ${coach.toFixed(2)}:1`);
});

test('contrast: data colours read as graphics (3:1) on the day tones and cards', () => {
  for (const fg of DATA_COLOURS) {
    for (const bg of [...DAY_TONES, ...CARDS]) {
      const ratio = contrast(need(fg), need(bg));
      assert.ok(ratio >= 3, `--${fg} on --${bg} is ${ratio.toFixed(2)}:1`);
    }
  }
});
