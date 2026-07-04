// app.js — entry point for Velora landing.
// Wires i18n, language switch, and the sticky-scroll showcase accent system.

import { applyLocale, resolveLocale, persistLocale } from './i18n.js';

function getLocale() {
  return document.documentElement.lang || 'en';
}

function attachLangSwitch() {
  document.querySelectorAll('.lang-switch button[data-locale]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.locale;
      if (!next || next === getLocale()) return;
      persistLocale(next);
      // Each locale has its own crawlable URL (matches hreflang alternates):
      // Turkish lives at the prerendered /tr/, English at the root.
      window.location.assign(next === 'tr' ? '/tr/' : '/');
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

// Decode off-screen first, then fade — avoids the hard swap flash.
async function crossfadePhone(img, src, alt) {
  if (img.getAttribute('src') === src) {
    if (alt) img.setAttribute('alt', alt);
    return;
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) img.style.opacity = '0';
  const pre = new Image();
  pre.src = src;
  try { if (pre.decode) await pre.decode(); } catch (_) {}
  img.setAttribute('src', src);
  if (alt) img.setAttribute('alt', alt);
  if (!reduce) requestAnimationFrame(() => { img.style.opacity = '1'; });
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
  if (src) crossfadePhone(phone, src, alt);
}

function attachShowcaseObserver() {
  const sections = document.querySelectorAll('[data-showcase-section]');
  if (!sections.length) return;

  // Initialize the sticky phone with the first section's image (locale-aware)
  // WITHOUT forcing the body accent — the hero keeps its own accent until
  // the user actually reaches the showcase.
  const first = sections[0];
  if (first) {
    const phone = document.querySelector('[data-showcase-phone]');
    if (phone) {
      const locale = getLocale();
      const src = first.getAttribute(locale === 'tr' ? 'data-src-tr' : 'data-src-en');
      const alt = first.getAttribute(locale === 'tr' ? 'data-alt-tr' : 'data-alt-en');
      if (src && phone.getAttribute('src') !== src) phone.setAttribute('src', src);
      if (alt) phone.setAttribute('alt', alt);
    }
  }

  const isMobile = window.matchMedia('(max-width: 900px)');

  // The hero participates too, so scrolling back up restores the brand accent.
  const hero = document.querySelector('.hero[data-accent]');
  const showcaseSet = new Set(sections);
  const watched = hero ? [hero, ...sections] : [...sections];

  const io = new IntersectionObserver((entries) => {
    // pick the entry with highest intersectionRatio that is intersecting
    let best = null;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
    }
    if (best) {
      const accent = best.target.dataset.accent;
      // Toggle active class for typography pop (showcase stages only)
      sections.forEach((s) => s.classList.toggle('is-active', s === best.target));
      if (showcaseSet.has(best.target)) {
        setBodyAccent(accent);
      } else if (accent && document.body.dataset.accent !== accent) {
        // Hero: restore brand accent but leave the showcase phone as-is
        currentAccent = accent;
        document.body.dataset.accent = accent;
      }
    }
  }, {
    // 0.15 included so the tall hero can still cross a threshold inside the
    // shrunken root band (its max possible ratio is well under 0.3).
    threshold: [0.15, 0.3, 0.5, 0.75],
    rootMargin: isMobile.matches ? '-30% 0px -30% 0px' : '-40% 0px -40% 0px'
  });

  watched.forEach((s) => io.observe(s));
}

function attachSmoothAnchorScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      const id = a.getAttribute('href').slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      ev.preventDefault();
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });
}

function attachNavScrollObserver() {
  const nav = document.querySelector('.site-nav');
  const hero = document.querySelector('.hero');
  const cta = document.querySelector('.site-nav__cta');
  if (!nav || !hero) return;

  const setScrolled = (scrolled) => {
    nav.dataset.scrolled = scrolled ? 'true' : 'false';
    if (cta) {
      cta.setAttribute('aria-hidden', scrolled ? 'false' : 'true');
      cta.setAttribute('tabindex', scrolled ? '0' : '-1');
    }
  };

  setScrolled(false);

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      // Hero out of view (accounting for sticky nav offset) => header enters scrolled state
      setScrolled(!e.isIntersecting);
    }
  }, {
    threshold: 0,
    rootMargin: '-72px 0px 0px 0px'
  });

  io.observe(hero);
}

async function bootstrap() {
  const initialLocale = resolveLocale();
  await applyLocale(initialLocale);
  attachLangSwitch();
  attachShowcaseObserver();
  attachNavScrollObserver();
  attachSmoothAnchorScroll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
