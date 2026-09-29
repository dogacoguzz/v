import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAnchors,
  clockParts,
  easeOutCubic,
  formatNumber,
  goalProgress,
  minutesAt,
  phaseFor,
  remainingSteps,
  scrollProgress,
  toMinutes,
} from '../assets/js/day-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// A desktop-shaped day: stamps roughly one viewport apart, as measured in the browser.
const VH = 800;
const STAMPS = [
  { t: toMinutes('06:40'), top: 0 },
  { t: toMinutes('07:30'), top: 1000 },
  { t: toMinutes('12:40'), top: 1900 },
  { t: toMinutes('18:10'), top: 2900 },
  { t: toMinutes('21:30'), top: 4100 },
  { t: toMinutes('23:00'), top: 5000 },
];
const MAX = 6200;
const anchors = buildAnchors(STAMPS, { vh: VH, maxScroll: MAX });

test('toMinutes and clockParts round-trip HH:MM stamps', () => {
  assert.equal(toMinutes('06:40'), 400);
  assert.equal(toMinutes('23:00'), 1380);
  assert.deepEqual(clockParts(760), { hh: '12', mm: '40' });
  assert.deepEqual(clockParts(400.9), { hh: '06', mm: '40' });
  assert.throws(() => toMinutes('6h40'), /expected HH:MM/);
});

test('the clock reads each stamp exactly when its stamp crosses the reading line (AE1)', () => {
  anchors.forEach((a, i) => assert.equal(minutesAt(a.start, anchors), STAMPS[i].t, `anchor ${i}`));
  assert.equal(minutesAt(0, anchors), toMinutes('06:40'));
  assert.equal(minutesAt(-50, anchors), toMinutes('06:40'));
});

test('the 12:40 anchor reads 12:40 and the clock interpolates between anchors', () => {
  const noon = anchors[2];
  assert.equal(minutesAt(noon.start, anchors), toMinutes('12:40'));
  const next = anchors[3];
  const mid = (noon.end + next.start) / 2;
  const t = minutesAt(mid, anchors);
  assert.ok(t > toMinutes('12:40') && t < toMinutes('18:10'), `expected between, got ${t}`);
  assert.equal(Math.round(t), Math.round((toMinutes('12:40') + toMinutes('18:10')) / 2));
});

test('a stamp at the very top of the viewport still shows its own time, not the next one', () => {
  STAMPS.slice(0, -1).forEach((s, i) => {
    assert.equal(minutesAt(s.top, anchors), s.t, `stamp ${i} at viewport top`);
  });
});

test('the clock never runs past the next anchor and never goes backwards', () => {
  let prev = -Infinity;
  for (let y = 0; y <= MAX; y += 7) {
    const t = minutesAt(y, anchors);
    assert.ok(t >= prev, `clock went back at y=${y}`);
    prev = t;
    let i = 0;
    anchors.forEach((a, k) => { if (a.start <= y) i = k; });
    const ceiling = anchors[i + 1] ? anchors[i + 1].t : anchors[i].t;
    assert.ok(t <= ceiling, `clock ran past ${ceiling} at y=${y}: ${t}`);
    assert.ok(t >= anchors[i].t);
  }
  assert.equal(minutesAt(MAX + 500, anchors), toMinutes('23:00'));
});

test('anchors stay ordered when stamps sit near the end of a short page', () => {
  const tight = buildAnchors(
    [{ t: 400, top: 0 }, { t: 450, top: 300 }, { t: 760, top: 900 }, { t: 1380, top: 950 }],
    { vh: 800, maxScroll: 500 },
  );
  for (let i = 1; i < tight.length; i++) assert.ok(tight[i].start >= tight[i - 1].start);
  tight.slice(0, -1).forEach((a) => assert.ok(a.end >= a.start));
  assert.equal(tight.at(-1).end, Infinity);
  assert.equal(minutesAt(500, tight), 1380);
  assert.deepEqual(buildAnchors([], { vh: 800, maxScroll: 10 }), []);
  assert.equal(minutesAt(10, []), 0);
});

test('phase boundaries: morning, midday, evening, night', () => {
  assert.equal(phaseFor(toMinutes('06:40')), 'morning');
  assert.equal(phaseFor(599), 'morning');
  assert.equal(phaseFor(600), 'day');
  assert.equal(phaseFor(toMinutes('12:40')), 'day');
  assert.equal(phaseFor(1019), 'day');
  assert.equal(phaseFor(1020), 'evening');
  assert.equal(phaseFor(toMinutes('21:30')), 'evening');
  assert.equal(phaseFor(1349), 'evening');
  assert.equal(phaseFor(1350), 'night');
  assert.equal(phaseFor(toMinutes('23:00')), 'night');
});

test('remaining steps follow the chosen goal: 7,000 after Set, 6,500 otherwise (AE1)', () => {
  assert.equal(remainingSteps(7000, 3900), 3100);
  assert.equal(remainingSteps(6500, 3900), 2600);
  assert.equal(remainingSteps(6500, 8000), 0);
  assert.equal(goalProgress(3900, 6500), 0.6);
  assert.ok(Math.abs(goalProgress(3900, 7000) - 0.5571) < 1e-3);
  assert.equal(goalProgress(9000, 7000), 1);
  assert.equal(goalProgress(10, 0), 0);
});

test('numbers format per locale: 7,000 in en and 7.000 in tr', () => {
  assert.equal(formatNumber(7000, 'en'), '7,000');
  assert.equal(formatNumber(7000, 'tr'), '7.000');
  assert.equal(formatNumber(6500, 'tr'), '6.500');
  assert.equal(formatNumber(2600.4, 'en'), '2,600');
});

test('scroll progress and easing stay inside 0..1', () => {
  assert.equal(scrollProgress(-10, 100), 0);
  assert.equal(scrollProgress(50, 100), 0.5);
  assert.equal(scrollProgress(500, 100), 1);
  assert.equal(scrollProgress(5, 0), 0);
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);
});

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const dayCss = readFileSync(join(ROOT, 'assets/css/day.css'), 'utf8');

test('without the js class every moment and card is visible (hidden states are js-scoped)', () => {
  const sections = [...html.matchAll(/<section[^>]*data-time="(\d\d:\d\d)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, ['06:40', '07:30', '12:40', '18:10', '21:30', '23:00']);
  assert.ok(/<html[^>]*data-locale="en"/.test(html));
  for (const rule of dayCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = rule;
    if (/^\s*(?:from|to|\d+%)\s*$/.test(selector)) continue;
    if (/opacity:\s*0(?![.\d])|visibility:\s*hidden|stroke-dashoffset:\s*1000|--on:\s*0\b/.test(body)) {
      assert.ok(/html\.js/.test(selector), `hidden-until-animated rule not scoped to html.js: ${selector.trim()}`);
    }
  }
});

test('landing strings live in the DOM: every day key is marked up and no data-i18n node has child tags', () => {
  const keys = [...html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)];
  assert.ok(keys.length > 40);
  for (const m of html.matchAll(/<(\w+)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
    assert.ok(!/</.test(m[3]), `data-i18n="${m[2]}" wraps child markup`);
  }
  assert.ok(!html.includes('\u2014'), 'em dash in index.html');
  assert.ok(!/gradient|backdrop-filter|blur\(/.test(dayCss), 'gradient or blur in day.css');
});

test('every App Store link on the landing carries an en-home campaign token', () => {
  const links = [...html.matchAll(/href="(https:\/\/apps\.apple\.com[^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length >= 3);
  for (const href of links) assert.match(href, /[?&]amp;ct=en-home-(?:nav|hero|close)&amp;/);
  assert.ok(html.includes('ct=en-home-banner'));
});
