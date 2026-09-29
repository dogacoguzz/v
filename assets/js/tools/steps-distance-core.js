// steps-distance-core.js: pure steps-to-distance maths for the guides calculator.
// No DOM access, so tools/steps-distance.test.mjs runs it under node:test.

// Rule of thumb: one step is about 0.415 x body height (see the guide's sources).
export const STEP_LENGTH_PER_HEIGHT = 0.415;

export const LIMITS = {
  steps: { max: 200000 },
  stepLengthM: { min: 0.3, max: 1.5 },
  heightCm: { min: 100, max: 230 },
};

export const MESSAGE_KEYS = [
  'empty', 'zero', 'negative', 'invalid',
  'stepsRange', 'stepLengthRange', 'stepLengthRangeImperial', 'heightRange', 'heightRangeImperial',
];

const CM_PER_INCH = 2.54;
const METERS_PER_MILE = 1609.344;
const MODES = ['stepLength', 'height'];
const UNIT_SYSTEMS = ['metric', 'imperial'];

// Reads "10,000", "10.000", "0,75", "1.234,5" or "7 500"; returns { kind, value }.
export function parseLocaleNumber(raw, { integer = false } = {}) {
  let s = String(raw ?? '').replace(/[\s  ]/g, '');
  if (!s) return { kind: 'empty' };
  if (integer && /^[-+]?\d{1,3}(?:[.,]\d{3})+$/.test(s)) {
    s = s.replace(/[.,]/g, '');
  } else if (s.includes('.') && s.includes(',')) {
    const decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    s = s.split(decimal === ',' ? '.' : ',').join('').replace(',', '.');
  } else {
    s = s.replace(',', '.');
  }
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(s)) return { kind: 'invalid' };
  const value = Number(s);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) return { kind: 'invalid' };
  return { kind: 'number', value };
}

const fail = (field, key) => ({ ok: false, field, key });

// Shared sign checks; returns a failure or the parsed value.
function readPositive(field, raw, { integer = false, allowZero = false } = {}) {
  const parsed = parseLocaleNumber(raw, { integer });
  if (parsed.kind !== 'number') return fail(field, parsed.kind);
  if (parsed.value < 0) return fail(field, 'negative');
  if (parsed.value === 0 && !allowZero) return fail(field, 'zero');
  return { ok: true, value: parsed.value };
}

function readStepLengthM({ units, stepLength }) {
  const read = readPositive('stepLength', stepLength);
  if (!read.ok) return read;
  const meters = units === 'imperial' ? (read.value * CM_PER_INCH) / 100 : read.value / 100;
  const { min, max } = LIMITS.stepLengthM;
  if (meters < min || meters > max) return fail('stepLength', units === 'imperial' ? 'stepLengthRangeImperial' : 'stepLengthRange');
  return { ok: true, value: meters };
}

function readHeightCm({ units, height, heightFt, heightIn }) {
  let cm;
  let field = 'height';
  if (units === 'imperial') {
    field = 'heightFt';
    const ft = readPositive('heightFt', heightFt);
    if (!ft.ok) return ft;
    const inches = parseLocaleNumber(heightIn).kind === 'empty'
      ? { ok: true, value: 0 }
      : readPositive('heightIn', heightIn, { allowZero: true });
    if (!inches.ok) return inches;
    cm = (ft.value * 12 + inches.value) * CM_PER_INCH;
  } else {
    const read = readPositive('height', height);
    if (!read.ok) return read;
    cm = read.value;
  }
  const { min, max } = LIMITS.heightCm;
  if (cm < min || cm > max) return fail(field, units === 'imperial' ? 'heightRangeImperial' : 'heightRange');
  return { ok: true, value: cm };
}

// Inputs are the raw field strings; the result is a distance or a { field, key } message.
export function calculate({ mode, units = 'metric', steps, stepLength, height, heightFt, heightIn }) {
  if (!MODES.includes(mode)) throw new Error(`calculate: unknown mode "${mode}"`);
  if (!UNIT_SYSTEMS.includes(units)) throw new Error(`calculate: unknown units "${units}"`);

  const stepCount = readPositive('steps', steps, { integer: true });
  if (!stepCount.ok) return stepCount;
  if (stepCount.value > LIMITS.steps.max) return fail('steps', 'stepsRange');

  let stepLengthM;
  if (mode === 'stepLength') {
    const read = readStepLengthM({ units, stepLength });
    if (!read.ok) return read;
    stepLengthM = read.value;
  } else {
    const read = readHeightCm({ units, height, heightFt, heightIn });
    if (!read.ok) return read;
    stepLengthM = (read.value * STEP_LENGTH_PER_HEIGHT) / 100;
  }

  const meters = stepCount.value * stepLengthM;
  const imperial = units === 'imperial';
  return {
    ok: true,
    units,
    steps: stepCount.value,
    stepLengthM,
    meters,
    value: imperial ? meters / METERS_PER_MILE : meters / 1000,
    unit: imperial ? 'mile' : 'kilometer',
  };
}

const unitFormat = (locale, unit, maximumFractionDigits) =>
  new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits });

export const formatDistance = (result, locale) => unitFormat(locale, result.unit, 2).format(result.value);

export function formatStepLength(result, locale) {
  if (result.units === 'imperial') return unitFormat(locale, 'inch', 1).format((result.stepLengthM * 100) / CM_PER_INCH);
  return unitFormat(locale, 'centimeter', 1).format(result.stepLengthM * 100);
}

// Text for the live output: a message for failures, the `result` template for a distance.
export function describe(result, locale, messages = {}) {
  if (!result.ok) return typeof messages[result.key] === 'string' ? messages[result.key] : '';
  const distance = formatDistance(result, locale);
  const template = messages.result;
  if (typeof template !== 'string') return distance;
  return template.replace('{distance}', distance).replace('{stepLength}', formatStepLength(result, locale));
}
