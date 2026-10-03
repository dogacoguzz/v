#!/usr/bin/env node
// build-landing.mjs: renders the home page for both locales from one source.
//
//   node tools/build-landing.mjs   (also run by: npm run build)
//
// The <main> block of index.html is the hand-edited source. Its text comes from
// assets/data/strings.<locale>.json through the data-i18n keys, so edit the JSON (both
// locales) and rerun; the head, chrome, store links, JSON-LD and QR codes are regenerated.
// Writes index.html, tr/index.html, images/qr-en.svg and images/qr-tr.svg.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  APP_NAME, LOCALES, LOCALE_PATHS, ORG_ID, SITE, WEBSITE_ID, composePage, organization, escapeAttr, fontPreloads, hashAssetRefs, hashedAssetPath, storeUrl,
  trRedirectScript,
} from './lib/page.mjs';
import { applyI18nStrings, flattenKeys, keyDiff } from './lib/prerender.mjs';
import { encodeText, toSvg } from './lib/qr.mjs';
import { EM_DASH, reindent, reportChecks } from './lib/util.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const PAGE = 'home';
export const SOURCE_PATH = 'index.html';
export const OUTPUT_PATHS = { en: 'index.html', tr: 'tr/index.html' };
export const QR_PATHS = { en: 'images/qr-en.svg', tr: 'images/qr-tr.svg' };
const ALTERNATES = { en: LOCALE_PATHS.en.home, tr: LOCALE_PATHS.tr.home };
const OG_IMAGE = '/images/og.jpg';
const THEME_COLOR = '#101417';
const BODY_ATTRS = { 'data-phase': 'morning' };
const STYLESHEETS = ['tokens', 'base', 'layout', 'components', 'day'].map((n) => `/assets/css/${n}.css`);
const MODULES = ['/assets/js/boot.js', '/assets/js/day.js'];

// --- Strings ---

export function assertKeyParity(stringsEn, strings, locale) {
  const { missing, extra } = keyDiff(stringsEn, strings);
  const problems = [
    ...(missing.length ? [`missing key(s) ${missing.join(', ')}`] : []),
    ...(extra.length ? [`key(s) not in strings.en.json ${extra.join(', ')}`] : []),
  ];
  if (problems.length) throw new Error(`strings.${locale}.json: ${problems.join('; ')}`);
}

// --- Source ---

const MAIN_RE = /<main id="main"([^>]*)>\n?([\s\S]*?)\n?[ \t]*<\/main>/;

// The <main> attributes (day.css scopes to main.day) and its inner markup, dedented so
// composePage's own indent keeps reruns byte-stable.
export function extractMain(source) {
  const m = MAIN_RE.exec(source);
  if (!m) throw new Error(`${SOURCE_PATH}: <main id="main"> block not found`);
  return { attrs: m[1], body: reindent(m[2]) };
}

function withMainAttrs(html, attrs) {
  const open = '<main id="main">';
  if (html.split(open).length !== 2) throw new Error('composePage output does not have exactly one <main id="main">');
  return html.replace(open, `<main id="main"${attrs}>`);
}

const STORE_HREF = /href="(https:\/\/apps\.apple\.com\/[^"]*)"/g;

export function localizeBody(body, locale, strings) {
  const { html, missing } = applyI18nStrings(body, strings);
  if (missing.length) throw new Error(`strings.${locale}.json: missing key(s) ${missing.join(', ')}`);
  const srcAttr = `data-src-${locale}`;
  const hrefAttr = `data-href-${locale}`;
  return html
    .replace(/<img\b[^>]*>/g, (tag) => {
      const variant = new RegExp(`\\s${srcAttr}="([^"]+)"`).exec(tag);
      return variant ? tag.replace(/(\ssrc=")[^"]*(")/, `$1${variant[1]}$2`) : tag;
    })
    .replace(/<a\b[^>]*\sdata-href-[a-z]+="[^"]*"[^>]*>/g, (tag) => {
      const variant = new RegExp(`\\s${hrefAttr}="([^"]+)"`).exec(tag);
      if (!variant) throw new Error(`${SOURCE_PATH}: localized link without ${hrefAttr}: ${tag}`);
      return tag.replace(/(\shref=")[^"]*(")/, `$1${variant[1]}$2`);
    })
    .replace(STORE_HREF, (_, href) => {
      const placement = /[?&](?:amp;)?ct=[a-z]+-[a-z0-9]+-([a-z0-9-]+)/.exec(href)?.[1];
      if (!placement) throw new Error(`${SOURCE_PATH}: App Store link without a ct campaign token: ${href}`);
      return `href="${escapeAttr(storeUrl(locale, PAGE, placement))}"`;
    });
}

// --- Head ---

const FAQ_KEY = /data-i18n="day\.about\.faq\.([a-z]+)\.q"/g;

// FAQ entries in source order; the visible <dl> and FAQPage read the same strings.
export function faqEntries(source, strings) {
  const keys = [...source.matchAll(FAQ_KEY)].map((m) => m[1]);
  if (keys.length < 4 || keys.length > 6) throw new Error(`${SOURCE_PATH}: expected 4 to 6 FAQ questions, found ${keys.length}`);
  return keys.map((key) => {
    const entry = strings.day.about?.faq?.[key];
    if (!entry?.q || !entry?.a) throw new Error(`strings: day.about.faq.${key} needs q and a`);
    return { key, q: entry.q, a: entry.a };
  });
}

// Subscription offers wait for verified store prices (F-04): only the free download is listed.
export function jsonLd(locale, strings, ogImage, source) {
  const url = `${SITE}${ALTERNATES[locale]}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization(locale),
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        url: `${SITE}/`,
        name: APP_NAME,
        inLanguage: [...LOCALES],
        publisher: { '@id': ORG_ID },
      },
      {
        '@type': 'MobileApplication',
        '@id': `${SITE}/#app`,
        name: APP_NAME,
        operatingSystem: 'iOS',
        applicationCategory: 'HealthApplication',
        inLanguage: locale,
        url,
        downloadUrl: storeUrl(locale, PAGE, 'schema'),
        image: `${SITE}${ogImage}`,
        description: strings.meta.description,
        publisher: { '@id': ORG_ID },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: strings.meta.offerDescription,
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        url,
        inLanguage: locale,
        mainEntity: faqEntries(source, strings).map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  };
}

// --- Page ---

export function qrSvg(locale) {
  return toSvg(encodeText(storeUrl(locale, PAGE, 'qr'), { ecl: 'M' }));
}

export function renderLanding({ locale, source, strings, stringsEn, rootDir = ROOT }) {
  if (!LOCALES.includes(locale)) throw new Error(`unsupported locale "${locale}"`);
  if (locale !== 'en') assertKeyParity(stringsEn, strings, locale);
  const main = extractMain(source);
  const body = localizeBody(main.body, locale, strings);
  const ogImage = hashedAssetPath(OG_IMAGE, rootDir);
  const html = composePage({
    locale,
    page: PAGE,
    strings,
    bodyAttrs: BODY_ATTRS,
    head: {
      title: strings.meta.title,
      description: strings.meta.description,
      canonicalPath: ALTERNATES[locale],
      alternates: ALTERNATES,
      ogImage,
      ogImageAlt: strings.meta.ogImageAlt,
      themeColor: THEME_COLOR,
      bannerPage: PAGE,
      preloads: fontPreloads(rootDir),
      stylesheets: STYLESHEETS,
      modules: MODULES,
      extraHead: locale === 'en' ? [trRedirectScript()] : [],
      jsonLd: jsonLd(locale, strings, ogImage, source),
    },
    body,
  });
  return hashAssetRefs(withMainAttrs(html, main.attrs), rootDir);
}

// --- Checks ---

// Keys whose EN text (4+ characters, different from the target locale) survives in the page.
export function leftoverEnglish(html, stringsEn, strings) {
  const get = (o, key) => key.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  return flattenKeys({ meta: stringsEn.meta, day: stringsEn.day })
    .filter((key) => {
      const en = get(stringsEn, key);
      return typeof en === 'string' && en.length >= 4 && en !== get(strings, key) && html.includes(en);
    });
}

export const storeLinks = (html) => [...html.matchAll(/https:\/\/apps\.apple\.com\/[^"'\s<]*/g)].map((m) => m[0]);

export function pageChecks(html, { locale, stringsEn, strings }) {
  const home = `${SITE}${ALTERNATES[locale]}`;
  const ct = new RegExp(`[?&](?:amp;)?ct=${locale}-${PAGE}-[a-z0-9-]+(?:&|$)`);
  const links = storeLinks(html);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let graph = [];
  try { graph = blocks.length === 1 ? JSON.parse(blocks[0][1])['@graph'] ?? [] : []; } catch (_) { /* reported below */ }
  const types = graph.map((n) => n['@type']);
  const app = graph.find((n) => n['@type'] === 'MobileApplication');
  const offers = [app?.offers ?? []].flat();
  const leftovers = locale === 'en' ? [] : leftoverEnglish(html, stringsEn, strings);
  return {
    'lang and data-locale': html.includes(`<html lang="${locale}" data-locale="${locale}">`),
    'canonical is the locale home': html.includes(`<link rel="canonical" href="${home}" />`),
    'hreflang pair': html.includes(`hreflang="en" href="${SITE}${ALTERNATES.en}"`) && html.includes(`hreflang="tr" href="${SITE}${ALTERNATES.tr}"`),
    'every App Store link has a campaign token': links.length >= 4 && links.every((l) => ct.test(l)) || `bad: ${links.filter((l) => !ct.test(l)).join(' ') || 'too few links'}`,
    'smart banner campaign': html.includes(`ct=${locale}-${PAGE}-banner`),
    'locale badge and QR': html.includes(`/images/badge-appstore-${locale}.svg?v=`) && html.includes(`/images/qr-${locale}.svg?v=`),
    'JSON-LD graph: Organization, WebSite, MobileApplication, FAQPage': ['Organization', 'WebSite', 'MobileApplication', 'FAQPage'].every((t) => types.includes(t)) || `types: ${types.join(', ')}`,
    'JSON-LD lists only the free offer': offers.length === 1 && offers[0].price === '0' || `${offers.length} offer(s)`,
    'redirect script only on /': html.includes("location.replace('/tr/'") === (locale === 'en'),
    'og image is content-hashed': /<meta property="og:image" content="[^"]+\?v=[0-9a-f]{8}" \/>/.test(html),
    'no inline js class script': !html.includes("classList.add('js')"),
    'no em dash': !html.includes(EM_DASH),
    'no leftover EN strings': leftovers.length === 0 || `left: ${leftovers.join(', ')}`,
  };
}

// --- Build ---

const readJson = (rootDir, path) => JSON.parse(readFileSync(join(rootDir, path), 'utf8'));

export function build({ rootDir = ROOT, outDir = rootDir, log = console.log } = {}) {
  const source = readFileSync(join(rootDir, SOURCE_PATH), 'utf8');
  const strings = Object.fromEntries(LOCALES.map((l) => [l, readJson(rootDir, `assets/data/strings.${l}.json`)]));

  // QR files come first: hashAssetRefs needs them on disk to hash the page's reference.
  for (const locale of LOCALES) {
    const file = join(outDir, QR_PATHS[locale]);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, qrSvg(locale));
  }

  const pages = LOCALES.map((locale) => {
    const html = renderLanding({ locale, source, strings: strings[locale], stringsEn: strings.en, rootDir: outDir });
    return { locale, path: OUTPUT_PATHS[locale], html, checks: pageChecks(html, { locale, stringsEn: strings.en, strings: strings[locale] }) };
  });

  reportChecks(pages, log);

  for (const p of pages) {
    const file = join(outDir, p.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, p.html);
    log(`${p.path} written.`);
  }
  return [...Object.values(QR_PATHS), ...pages.map((p) => p.path)];
}

export function main() {
  try {
    build();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
