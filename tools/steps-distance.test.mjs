// steps-distance.test.mjs: the pure steps-to-distance core behind the guides calculator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STEP_LENGTH_PER_HEIGHT,
  MESSAGE_KEYS,
  parseLocaleNumber,
  calculate,
  formatDistance,
  formatStepLength,
  describe,
} from '../assets/js/tools/steps-distance-core.js';

const metricStep = (overrides = {}) => ({ mode: 'stepLength', units: 'metric', steps: '10000', stepLength: '75', ...overrides });
const metricHeight = (overrides = {}) => ({ mode: 'height', units: 'metric', steps: '10000', height: '180', ...overrides });

test('10,000 steps at a 0.75 m step length is 7.5 km', () => {
  const r = calculate(metricStep());
  assert.equal(r.ok, true);
  assert.equal(r.unit, 'kilometer');
  assert.ok(Math.abs(r.value - 7.5) < 1e-9);
  assert.equal(formatDistance(r, 'en'), '7.5 km');
  assert.equal(formatDistance(r, 'tr'), '7,5 km');
});

test('10,000 steps at 180 cm height is about 7.5 km via the 0.415 rule of thumb', () => {
  assert.equal(STEP_LENGTH_PER_HEIGHT, 0.415);
  const r = calculate(metricHeight());
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.stepLengthM - 0.747) < 1e-9);
  assert.ok(Math.abs(r.value - 7.5) < 0.05, `got ${r.value}`);
  assert.equal(formatDistance(r, 'en'), '7.47 km');
});

test('imperial shows miles for a step length in inches and a height in feet and inches', () => {
  const byLength = calculate({ mode: 'stepLength', units: 'imperial', steps: '10000', stepLength: '30' });
  assert.equal(byLength.ok, true);
  assert.equal(byLength.unit, 'mile');
  assert.ok(Math.abs(byLength.value - (10000 * 30 * 0.0254) / 1609.344) < 1e-9);
  assert.match(formatDistance(byLength, 'en'), /^4\.73 mi$/);

  const byHeight = calculate({ mode: 'height', units: 'imperial', steps: '10000', heightFt: '5', heightIn: '11' });
  assert.equal(byHeight.ok, true);
  assert.equal(byHeight.unit, 'mile');
  assert.match(formatDistance(byHeight, 'en'), / mi$/);
  assert.equal(formatStepLength(byHeight, 'en'), '29.5 in');
});

test('a missing inches value in imperial height counts as zero', () => {
  const r = calculate({ mode: 'height', units: 'imperial', steps: '10000', heightFt: '6', heightIn: '' });
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.stepLengthM - 0.415 * 72 * 0.0254) < 1e-9);
});

test('TR input accepts a decimal comma and dotted thousands', () => {
  assert.equal(parseLocaleNumber('0,75').value, 0.75);
  assert.equal(parseLocaleNumber('10.000', { integer: true }).value, 10000);
  assert.equal(parseLocaleNumber('10,000', { integer: true }).value, 10000);
  assert.equal(parseLocaleNumber('1.234,5').value, 1234.5);
  assert.equal(parseLocaleNumber(' 7 500 ', { integer: true }).value, 7500);
  const r = calculate(metricStep({ steps: '10.000', stepLength: '74,5' }));
  assert.equal(r.ok, true);
  assert.equal(formatDistance(r, 'tr'), '7,45 km');
  assert.equal(formatStepLength(r, 'tr'), '74,5 cm');
});

const failures = [
  ['empty steps', metricStep({ steps: '' }), 'steps', 'empty'],
  ['blank steps', metricStep({ steps: '   ' }), 'steps', 'empty'],
  ['zero steps', metricStep({ steps: '0' }), 'steps', 'zero'],
  ['negative steps', metricStep({ steps: '-500' }), 'steps', 'negative'],
  ['letters in steps', metricStep({ steps: 'ten' }), 'steps', 'invalid'],
  ['fractional steps', metricStep({ steps: '10000.5' }), 'steps', 'invalid'],
  ['too many steps', metricStep({ steps: '250000' }), 'steps', 'stepsRange'],
  ['empty step length', metricStep({ stepLength: '' }), 'stepLength', 'empty'],
  ['zero step length', metricStep({ stepLength: '0' }), 'stepLength', 'zero'],
  ['negative step length', metricStep({ stepLength: '-75' }), 'stepLength', 'negative'],
  ['short step length', metricStep({ stepLength: '29' }), 'stepLength', 'stepLengthRange'],
  ['long step length', metricStep({ stepLength: '151' }), 'stepLength', 'stepLengthRange'],
  ['step length typed in metres', metricStep({ stepLength: '0.75' }), 'stepLength', 'stepLengthRange'],
  ['imperial long step length', { mode: 'stepLength', units: 'imperial', steps: '100', stepLength: '60' }, 'stepLength', 'stepLengthRangeImperial'],
  ['empty height', metricHeight({ height: '' }), 'height', 'empty'],
  ['zero height', metricHeight({ height: '0' }), 'height', 'zero'],
  ['negative height', metricHeight({ height: '-180' }), 'height', 'negative'],
  ['short height', metricHeight({ height: '99' }), 'height', 'heightRange'],
  ['tall height', metricHeight({ height: '231' }), 'height', 'heightRange'],
  ['non-numeric height', metricHeight({ height: '1,80m' }), 'height', 'invalid'],
  ['imperial empty feet', { mode: 'height', units: 'imperial', steps: '100', heightFt: '', heightIn: '5' }, 'heightFt', 'empty'],
  ['imperial negative inches', { mode: 'height', units: 'imperial', steps: '100', heightFt: '5', heightIn: '-2' }, 'heightIn', 'negative'],
  ['imperial tall height', { mode: 'height', units: 'imperial', steps: '100', heightFt: '8', heightIn: '0' }, 'heightFt', 'heightRangeImperial'],
];

for (const [label, input, field, key] of failures) {
  test(`${label} gives the ${key} message on ${field}, never NaN`, () => {
    const r = calculate(input);
    assert.deepEqual(r, { ok: false, field, key });
    assert.ok(MESSAGE_KEYS.includes(key));
    const text = describe(r, 'en', { [key]: `msg:${key}` });
    assert.equal(text, `msg:${key}`);
    assert.doesNotMatch(text, /NaN|Infinity|undefined/);
  });
}

test('describe never prints NaN, even when a message is missing', () => {
  const r = calculate(metricStep({ steps: 'abc' }));
  assert.equal(describe(r, 'en', {}), '');
});

test('an unknown mode or unit system is rejected, not computed', () => {
  assert.throws(() => calculate(metricStep({ mode: 'pace' })), /mode/);
  assert.throws(() => calculate(metricStep({ units: 'nautical' })), /units/);
});
