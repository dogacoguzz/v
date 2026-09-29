// day-core.js: pure helpers for the one-day landing (clock, phase, goal math, numbers).
// No DOM access, so tools/day.test.mjs can import it under node:test.

export const PHASES = ['morning', 'day', 'evening', 'night'];

export function toMinutes(stamp) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(stamp).trim());
  if (!m) throw new Error(`toMinutes: expected HH:MM, got "${stamp}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function clockParts(minutes) {
  const total = Math.max(0, Math.floor(minutes));
  return {
    hh: String(Math.floor(total / 60) % 24).padStart(2, '0'),
    mm: String(total % 60).padStart(2, '0'),
  };
}

// Morning before 10:00, midday before 17:00, evening before 22:30, then night.
export function phaseFor(minutes) {
  if (minutes < 600) return 'morning';
  if (minutes < 1020) return 'day';
  if (minutes < 1350) return 'evening';
  return 'night';
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Each stamp holds its time from when it crosses the reading line until it has scrolled
// past the viewport top, then the clock travels to the next stamp over the rest of the gap.
export function buildAnchors(stamps, { vh, maxScroll, readLine = 0.55, minHold = 0.45, maxHold = 0.8 }) {
  if (!Array.isArray(stamps) || !stamps.length) return [];
  const max = Math.max(0, maxScroll);
  const starts = [];
  stamps.forEach((s, i) => {
    const raw = i === 0 ? 0 : clamp(s.top - vh * readLine, 0, max);
    starts.push(i === 0 ? 0 : Math.min(max, Math.max(raw, starts[i - 1] + 1)));
  });
  return stamps.map((s, i) => {
    const start = starts[i];
    if (i === stamps.length - 1) return { t: s.t, start, end: Infinity };
    const gap = Math.max(0, starts[i + 1] - start);
    const end = clamp(Math.max(start + gap * minHold, s.top), start, start + gap * maxHold);
    return { t: s.t, start, end };
  });
}

// Minutes shown at scroll offset y; never past the next anchor's stamp.
export function minutesAt(y, anchors) {
  if (!anchors.length) return 0;
  let i = 0;
  for (let k = 0; k < anchors.length; k++) if (anchors[k].start <= y) i = k;
  const a = anchors[i];
  const b = anchors[i + 1];
  if (!b || y <= a.end) return a.t;
  const span = b.start - a.end;
  if (span <= 0) return a.t;
  return a.t + (b.t - a.t) * clamp((y - a.end) / span, 0, 1);
}

export function remainingSteps(goal, steps) {
  return Math.max(0, Math.round(goal) - Math.round(steps));
}

export function goalProgress(steps, goal) {
  return goal > 0 ? clamp(steps / goal, 0, 1) : 0;
}

export function scrollProgress(y, maxScroll) {
  return maxScroll > 0 ? clamp(y / maxScroll, 0, 1) : 0;
}

export function formatNumber(value, locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function easeOutCubic(k) {
  const x = clamp(k, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}
