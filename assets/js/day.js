// day.js: landing-only module for the one-day page: scroll clock, pop-ins, number tweens
// and the hero goal toggle that carries into the 12:40 card. Every string comes from the DOM.

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
} from './day-core.js';

const root = document.documentElement;
const body = document.body;
const locale = root.dataset.locale || root.lang || 'en';
const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const fmt = (n) => formatNumber(n, locale);
const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));
const str = (key) => ($(`[data-str="${key}"]`)?.textContent ?? '').trim();

const stepsEl = $('[data-steps-now]');
const state = {
  goal: Number($('[data-set-goal]')?.dataset.goalFrom) || 6500,
  steps: Number(stepsEl?.dataset.steps) || 0,
  lunchLanded: false,
};

// ---------- Number tweens ----------

const tweens = new WeakMap();

function tween(el, from, to, ms) {
  if (!el) return;
  cancelAnimationFrame(tweens.get(el));
  if (reduce.matches || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = fmt(Math.round(from + (to - from) * easeOutCubic(k)));
    if (k < 1) tweens.set(el, requestAnimationFrame(step));
  };
  tweens.set(el, requestAnimationFrame(step));
}

// ---------- Goal carry-over (AE1) ----------

function syncGoal() {
  $$('[data-goal-out]').forEach((el) => { el.textContent = fmt(state.goal); });
  const toGo = $('[data-to-go]');
  if (toGo) toGo.textContent = fmt(remainingSteps(state.goal, state.steps));
  const ring = $('[data-ring]');
  if (ring) ring.style.setProperty('--pct', goalProgress(state.steps, state.goal).toFixed(3));
}

function landLunch() {
  if (state.lunchLanded) return;
  state.lunchLanded = true;
  syncGoal();
  tween(stepsEl, Number(stepsEl?.dataset.stepsFrom) || 0, state.steps, 1300);
}

function burst(button, box) {
  if (reduce.matches || !box) return;
  const r = button.getBoundingClientRect();
  const p = box.getBoundingClientRect();
  const cx = r.left - p.left + r.width / 2;
  const cy = r.top - p.top + r.height / 2;
  const colors = ['--coach', '--data-steps', '--data-run', '--data-water', '--data-night', '--data-drink'];
  box.replaceChildren();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const d = 60 + (i % 3) * 22;
    const dot = document.createElement('i');
    dot.style.cssText = `--x:${cx}px;--y:${cy}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--c:var(${colors[i % 6]})`;
    box.appendChild(dot);
  }
}

function initGoal() {
  const button = $('[data-set-goal]');
  if (!button) return;
  const card = $('[data-goal-card]');
  const bar = $('[data-goalbar]');
  const value = $('[data-goal-value]');
  const status = $('[data-goal-status]');
  const from = Number(button.dataset.goalFrom) || 6500;
  const to = Number(button.dataset.goalTo) || 7000;

  button.addEventListener('click', () => {
    const on = button.getAttribute('aria-pressed') !== 'true';
    const previous = state.goal;
    state.goal = on ? to : from;
    button.setAttribute('aria-pressed', String(on));
    card?.setAttribute('data-goal', on ? 'set' : 'default');
    bar?.style.setProperty('--goal', String(state.goal));
    tween(value, previous, state.goal, 700);
    if (status) status.textContent = str(on ? 'goal.on' : 'goal.off');
    if (on) burst(button, $('[data-burst]', card || document));
    syncGoal();
  });
}

// ---------- Pop-ins: Coach cards and data landings only ----------

function reveal(el) {
  el.classList.add('in');
  if (el.matches('[data-lunch]')) landLunch();
}

function initPops() {
  const items = $$('[data-pop]');
  if (reduce.matches || !('IntersectionObserver' in window)) {
    items.forEach(reveal);
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      reveal(entry.target);
    });
  }, { threshold: 0.3, rootMargin: '0px 0px -8% 0px' });
  items.forEach((el) => io.observe(el));
}

// ---------- Scroll clock (KTD7): anchors measured once, scroll handler reads no layout ----------

function initClock() {
  const hh = $('[data-clock-hh]');
  const mm = $('[data-clock-mm]');
  const moments = $$('[data-time]');
  if (!hh || !mm || !moments.length) return;
  const label = $('[data-phase-label]');
  const ticks = new Map($$('[data-tick]').map((el) => [el.dataset.tick, el]));
  const cssFill = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()'));
  let anchors = [];
  let tickStarts = [];
  let maxScroll = 1;
  let queued = 0;

  function update() {
    queued = 0;
    const y = window.scrollY;
    const minutes = minutesAt(y, anchors);
    const parts = clockParts(minutes);
    if (hh.textContent !== parts.hh) hh.textContent = parts.hh;
    if (mm.textContent !== parts.mm) mm.textContent = parts.mm;
    const phase = phaseFor(minutes);
    if (body.dataset.phase !== phase) {
      body.dataset.phase = phase;
      const text = str(`phase.${phase}`);
      if (label && text) label.textContent = text;
    }
    tickStarts.forEach(([tick, start]) => tick.classList.toggle('is-hit', y >= start - 2));
    if (!cssFill) root.style.setProperty('--progress', scrollProgress(y, maxScroll).toFixed(4));
  }

  function measure() {
    const vh = window.innerHeight;
    maxScroll = Math.max(1, root.scrollHeight - vh);
    const stamps = moments.map((el) => {
      const mark = $('[data-stamp]', el) || el;
      return { t: toMinutes(el.dataset.time), top: mark.getBoundingClientRect().top + window.scrollY, id: el.id };
    });
    anchors = buildAnchors(stamps, { vh, maxScroll });
    tickStarts = [];
    stamps.forEach((s, i) => {
      const tick = ticks.get(s.id);
      if (!tick) return;
      tick.style.setProperty('--f', Math.min(1, anchors[i].start / maxScroll).toFixed(4));
      tickStarts.push([tick, anchors[i].start]);
    });
    update();
  }

  let remeasure = 0;
  const scheduleMeasure = () => {
    if (!remeasure) remeasure = requestAnimationFrame(() => { remeasure = 0; measure(); });
  };

  window.addEventListener('scroll', () => {
    if (!queued) queued = requestAnimationFrame(update);
  }, { passive: true });
  window.addEventListener('resize', scheduleMeasure);
  window.addEventListener('load', scheduleMeasure);
  if (document.fonts?.ready) document.fonts.ready.then(scheduleMeasure);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleMeasure).observe(body);
  measure();
}

initClock();
initGoal();
initPops();
syncGoal();
