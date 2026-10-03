// claims.test.mjs: AE2. Until the store offers and prices are verified (F-03, F-04), the landing
// pages, guides and llms.txt state no trial and no price. Legal pages are out of scope.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outputPaths, loadGuides } from './build-guides.mjs';
import { OUTPUT_PATHS } from './build-landing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [...Object.values(OUTPUT_PATHS), ...outputPaths(loadGuides()), 'llms.txt'];
const UNVERIFIED = [
  [/\$\s?\d|\d\s?\$/, 'a dollar price'],
  [/[€£]\s?\d|\d\s?[€£]|\d\s?(?:USD|EUR|GBP|TRY|TL|₺)(?![\p{L}\d])|₺\s?\d/u, 'a lira, euro, pound or USD price'],
  [/\b7[- ]days?\b|\bseven days\b|\b1[- ]week\b|\b(?:one|a)[- ]week (?:free|trial)\b/i, 'a trial length'],
  [/7 gün|yedi gün|1 hafta|bir hafta/i, 'a TR trial length'],
  [/\btrials?\b|deneme/i, 'a trial'],
  [/\/month|\/year|per month|per year|aylık \d|yıllık \d/i, 'a subscription price'],
];

test('AE2: no trial or price claim on the landing, guides or llms.txt', () => {
  assert.ok(FILES.length >= 13);
  for (const file of FILES) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    for (const [re, label] of UNVERIFIED) assert.ok(!re.test(text), `${file}: ${label} (${re.exec(text)?.[0]})`);
  }
});

test('AE2: the claim scan catches the stage 2 sentences it guards against', () => {
  for (const sample of [
    'Coach with Pro, 7 days free on yearly', 'Velora Pro: $4.99', 'yıllık 1.999,99 TL', '7 gün ücretsiz',
    '1.999,99 ₺', '1.999,99₺', '₺249,99', '€4.99', '£3.99', '4,99 $', 'one week free', 'a week free',
    'start your trial', 'bir hafta ücretsiz', '1 hafta', 'deneme', 'free for 1 week', '1-week Pro pass',
  ]) {
    assert.ok(UNVERIFIED.some(([re]) => re.test(sample)), sample);
  }
});
