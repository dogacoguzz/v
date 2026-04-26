// app.js — entry point for Velora landing.
// Wires i18n, language switch, and the sticky-scroll showcase accent system.

import { applyLocale, resolveLocale, persistLocale } from './i18n.js';

function getLocale() {
  return document.documentElement.lang || 'en';
}

function attachLangSwitch() {
  document.querySelectorAll('.lang-switch button[data-locale]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = btn.dataset.locale;
      if (!next || next === getLocale()) return;
      persistLocale(next);
      await applyLocale(next);
      // After locale switch, refresh showcase phone if any showcase is currently active
      refreshShowcasePhone(currentAccent);
    });
  });
}

let currentAccent = 'activities';

function setBodyAccent(accent) {
  if (!accent || currentAccent === accent) return;
  currentAccent = accent;
  document.body.dataset.accent = accent;
  refreshShowcasePhone(accent);
}

function refreshShowcasePhone(accent) {
  const phone = document.querySelector('[data-showcase-phone]');
  if (!phone) return;
  const section = document.querySelector(`[data-showcase-section][data-accent="${accent}"]`);
  if (!section) return;
  const locale = getLocale();
  const srcAttr = locale === 'tr' ? 'data-src-tr' : 'data-src-en';
  const altAttr = locale === 'tr' ? 'data-alt-tr' : 'data-alt-en';
  const src = section.getAttribute(srcAttr);
  const alt = section.getAttribute(altAttr);
  if (src && phone.getAttribute('src') !== src) phone.setAttribute('src', src);
  if (alt) phone.setAttribute('alt', alt);
}

function attachShowcaseObserver() {
  const sections = document.querySelectorAll('[data-showcase-section]');
  if (!sections.length) return;

  // Initialize phone with the first section's image so users see something at load
  const first = sections[0];
  if (first) {
    document.body.dataset.accent = first.dataset.accent || 'activities';
    currentAccent = first.dataset.accent || 'activities';
    refreshShowcasePhone(currentAccent);
  }

  const isMobile = window.matchMedia('(max-width: 900px)');

  const io = new IntersectionObserver((entries) => {
    // pick the entry with highest intersectionRatio that is intersecting
    let best = null;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
    }
    if (best) {
      const accent = best.target.dataset.accent;
      // Toggle active class for typography pop
      sections.forEach((s) => s.classList.toggle('is-active', s === best.target));
      setBodyAccent(accent);
    }
  }, {
    threshold: [0.3, 0.5, 0.75],
    rootMargin: isMobile.matches ? '-30% 0px -30% 0px' : '-40% 0px -40% 0px'
  });

  sections.forEach((s) => io.observe(s));
}

function attachSmoothAnchorScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      const id = a.getAttribute('href').slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      ev.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

async function bootstrap() {
  const initialLocale = resolveLocale();
  await applyLocale(initialLocale);
  attachLangSwitch();
  attachShowcaseObserver();
  attachSmoothAnchorScroll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
