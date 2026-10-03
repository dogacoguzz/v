// page.mjs: shared page library for every builder: head, chrome partials, App Store
// campaign links and content-hashed asset URLs. Pure string transforms plus file reads.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markLangSwitch } from './prerender.mjs';
import { SEGMENT, indent } from './util.mjs';

const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PARTIALS_DIR = join(TOOLS_DIR, 'partials');
export const SITE = 'https://velorahealthcompanion.com';
export const LOCALES = ['en', 'tr'];
export const APP_STORE_ID = '6748447208';
// App Store Connect provider token (pt) for campaign links.
export const APP_STORE_PROVIDER_TOKEN = '127971636';
export const MAX_CAMPAIGN_LENGTH = 40;
export const SKIP_TARGET_ID = 'main';
export const APP_NAME = 'Velora: Health Companion';
export const ORG_ID = `${SITE}/#org`;
export const WEBSITE_ID = `${SITE}/#website`;

const OG_LOCALES = { en: 'en_US', tr: 'tr_TR' };

export const LOCALE_PATHS = {
  en: { home: '/', coach: '/#coach', guides: '/guides/', privacy: '/privacy-policy/', terms: '/terms-of-service/', eula: '/eula' },
  tr: { home: '/tr/', coach: '/tr/#coach', guides: '/tr/rehber/', privacy: '/tr/privacy-policy/', terms: '/tr/terms-of-service/', eula: '/eula' },
};

export const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const assertLocale = (locale) => {
  if (!LOCALES.includes(locale)) throw new Error(`unsupported locale "${locale}" (expected ${LOCALES.join(' or ')})`);
};

function campaignToken(locale, page, placement) {
  assertLocale(locale);
  if (!SEGMENT.test(page ?? '')) throw new Error(`invalid campaign page "${page}"`);
  if (!SEGMENT.test(placement ?? '')) throw new Error(`invalid campaign placement "${placement}"`);
  const ct = `${locale}-${page}-${placement}`;
  if (ct.length > MAX_CAMPAIGN_LENGTH) {
    throw new Error(`campaign token "${ct}" is ${ct.length} characters; App Store ct allows ${MAX_CAMPAIGN_LENGTH}`);
  }
  return ct;
}

// KTD6: every App Store link goes through here so each page and placement is attributable.
export function storeUrl(locale, page, placement) {
  const ct = campaignToken(locale, page, placement);
  return `https://apps.apple.com/app/id${APP_STORE_ID}?pt=${APP_STORE_PROVIDER_TOKEN}&ct=${ct}&mt=8`;
}

// The publisher node every page's JSON-LD graph shares; logo stays unhashed so the URL is stable.
export const organization = (locale) => ({
  '@type': 'Organization',
  '@id': ORG_ID,
  name: APP_NAME,
  alternateName: 'Velora',
  url: `${SITE}/`,
  logo: `${SITE}/images/apple-touch-icon.png`,
  sameAs: [storeUrl(locale, 'home', 'schema')],
});

export function smartBannerMeta(locale, page) {
  const ct = campaignToken(locale, page, 'banner');
  const content = `app-id=${APP_STORE_ID}, affiliate-data=pt=${APP_STORE_PROVIDER_TOKEN}&ct=${ct}`;
  return `<meta name="apple-itunes-app" content="${escapeAttr(content)}" />`;
}

const absolute = (path) => (/^https?:\/\//.test(path) ? path : `${SITE}${path}`);

const jsonLdScript = (data) =>
  `<script type="application/ld+json">\n${JSON.stringify(data, null, 2).replace(/</g, '\\u003c')}\n</script>`;

export function composeHead({
  locale, title, description, canonicalPath, alternates, ogImage, ogImageAlt, jsonLd,
  preloads = [], stylesheets = [], modules = [], extraHead = [], bannerPage, themeColor = '#0c0f12',
}) {
  assertLocale(locale);
  if (!title || !description) throw new Error('composeHead: title and description are required');
  if (!canonicalPath?.startsWith('/')) throw new Error(`composeHead: canonicalPath must be root-relative, got "${canonicalPath}"`);
  if (alternates) {
    for (const l of LOCALES) if (!alternates[l]) throw new Error(`composeHead: alternates.${l} is missing`);
    if (alternates[locale] !== canonicalPath) {
      throw new Error(`composeHead: canonical ${canonicalPath} is not the ${locale} alternate ${alternates[locale]}`);
    }
  }
  const url = absolute(canonicalPath);
  const other = LOCALES.find((l) => l !== locale);

  const lines = [
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeText(title)}</title>`,
    `<meta name="description" content="${escapeAttr(description)}" />`,
    '<meta name="color-scheme" content="dark" />',
    `<meta name="theme-color" content="${escapeAttr(themeColor)}" />`,
    '',
    `<link rel="canonical" href="${url}" />`,
    ...(alternates
      ? [
          `<link rel="alternate" hreflang="en" href="${absolute(alternates.en)}" />`,
          `<link rel="alternate" hreflang="tr" href="${absolute(alternates.tr)}" />`,
          `<link rel="alternate" hreflang="x-default" href="${absolute(alternates.en)}" />`,
        ]
      : []),
    '',
    '<link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png" />',
    '<link rel="apple-touch-icon" href="/images/apple-touch-icon.png" />',
    ...(bannerPage ? [smartBannerMeta(locale, bannerPage)] : []),
    '',
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Velora" />',
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    ...(ogImage
      ? [
          `<meta property="og:image" content="${absolute(ogImage)}" />`,
          ...(ogImageAlt ? [`<meta property="og:image:alt" content="${escapeAttr(ogImageAlt)}" />`] : []),
        ]
      : []),
    `<meta property="og:locale" content="${OG_LOCALES[locale]}" />`,
    `<meta property="og:locale:alternate" content="${OG_LOCALES[other]}" />`,
    `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    ...(ogImage ? [`<meta name="twitter:image" content="${absolute(ogImage)}" />`] : []),
    '',
    ...preloads.map(({ href, as, type }) =>
      `<link rel="preload" href="${escapeAttr(href)}" as="${escapeAttr(as)}"${type ? ` type="${escapeAttr(type)}"` : ''}${as === 'font' ? ' crossorigin' : ''} />`),
    ...stylesheets.map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}" />`),
    ...modules.map((src) => `<script type="module" src="${escapeAttr(src)}"></script>`),
    ...(Array.isArray(extraHead) ? extraHead : [extraHead]),
    ...(jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]).map(jsonLdScript) : []),
  ];
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .split('\n')
    .map((line) => (line ? `  ${line}` : ''))
    .join('\n');
}

const lookup = (vars, path) =>
  path.split('.').reduce((a, k) => (a != null && a[k] !== undefined ? a[k] : undefined), vars);

// {{key}} is attribute-escaped, {{{key}}} is inserted raw; dotted keys read nested objects.
export function renderPartial(name, vars = {}, { dir = PARTIALS_DIR } = {}) {
  const file = join(dir, `${name}.html`);
  if (!/^[a-z0-9-]+$/.test(name) || !existsSync(file)) throw new Error(`renderPartial: partial not found: ${file}`);
  const unresolved = new Set();
  const value = (key) => {
    const v = lookup(vars, key);
    if (typeof v !== 'string' && typeof v !== 'number') { unresolved.add(key); return ''; }
    return String(v);
  };
  const html = readFileSync(file, 'utf8')
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, key) => value(key))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => escapeAttr(value(key)))
    .replace(/\s+$/, '');
  if (unresolved.size) throw new Error(`renderPartial(${name}): unresolved placeholder(s) ${[...unresolved].join(', ')}`);
  return html;
}

// The language switch links to the page's own hreflang alternates, or to each locale home.
export function chromeVars(locale, strings, page, alternates) {
  assertLocale(locale);
  const p = LOCALE_PATHS[locale];
  const langHref = Object.fromEntries(LOCALES.map((l) => [l, alternates?.[l] ?? LOCALE_PATHS[l].home]));
  // A bare "/" sends TR browsers back to /tr/, so the EN home link from a TR page carries ?lang=en.
  if (locale !== 'en' && langHref.en === '/') langHref.en = '/?lang=en';
  return {
    langHref,
    nav: strings.nav,
    footer: strings.footer,
    homeHref: p.home,
    coachHref: p.coach,
    guidesHref: p.guides,
    privacyHref: p.privacy,
    termsHref: p.terms,
    eulaHref: p.eula,
    storeUrlNav: storeUrl(locale, page, 'nav'),
  };
}

// Doctype + <html lang data-locale> + head + skip link + nav + <main id="main"> body + footer.
export function composePage({ locale, page, strings, head, body, bodyAttrs = {}, partialsDir = PARTIALS_DIR }) {
  assertLocale(locale);
  const headHtml = typeof head === 'string' ? head : composeHead({ locale, ...head });
  const vars = chromeVars(locale, strings, page, typeof head === 'string' ? undefined : head.alternates);
  const nav = markLangSwitch(renderPartial('nav', vars, { dir: partialsDir }), locale);
  const footer = renderPartial('footer', vars, { dir: partialsDir });
  const attrs = Object.entries(bodyAttrs).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
  return `<!DOCTYPE html>
<html lang="${locale}" data-locale="${locale}">
<head>
${headHtml}
</head>

<body${attrs}>

  <a class="skip-link" href="#${SKIP_TARGET_ID}">${escapeText(strings.nav.skipLink)}</a>

${indent(nav, '  ')}

  <main id="${SKIP_TARGET_ID}">
${indent(body.replace(/^\s*\n|\s+$/g, ''), '    ')}
  </main>

${indent(footer, '  ')}

</body>
</html>
`;
}

// Origins the page would fetch or link to, other than the site itself.
export function externalOrigins(html) {
  const origins = new Set();
  const add = (value) => {
    const url = value.trim();
    if (!/^(?:https?:)?\/\//i.test(url)) return;
    const origin = new URL(url.startsWith('//') ? `https:${url}` : url).origin;
    if (origin !== SITE) origins.add(origin);
  };
  for (const [, attr, , value] of html.matchAll(/\s(src|href|srcset|action|poster|formaction)=(["'])(.*?)\2/gis)) {
    if (attr.toLowerCase() === 'srcset') value.split(',').forEach((c) => add(c.trim().split(/\s+/)[0]));
    else add(value);
  }
  return origins;
}

// --- Content-hash cache busting (KTD4) ---

const V = '(?:\\?v=[0-9a-f]{8})?';
const HTML_REF = new RegExp(`(\\s(?:src|href)=)(["'])(\\/(?:assets|images)\\/[^"'?#\\s]+)${V}(#[^"']*)?\\2`, 'g');
const JS_REF = new RegExp(
  `(\\b(?:import|export)\\s*(?:[\\w*{}\\s,$]+?\\s*from\\s*)?)(["'])(\\.{1,2}\\/[^"'?#\\s]+|\\/[^"'?#\\s]+)${V}\\2`, 'g');
const CSS_REF = new RegExp(`url\\(\\s*(["']?)([^"'()\\s?#]+)${V}(#[^"'()\\s]*)?\\1\\s*\\)`, 'g');

const kindOf = (file) => {
  const ext = extname(file ?? '').toLowerCase();
  if (ext === '.css') return 'css';
  if (ext === '.js' || ext === '.mjs') return 'js';
  return 'html';
};

const sha8 = (content) => createHash('sha256').update(content).digest('hex').slice(0, 8);

function hashFile(abs, rootDir, ctx) {
  if (ctx.hashes.has(abs)) return ctx.hashes.get(abs);
  if (!existsSync(abs)) throw new Error(`hashAssetRefs: asset not found: ${relative(rootDir, abs)}`);
  const kind = kindOf(abs);
  let hash;
  if (kind === 'html') {
    hash = sha8(readFileSync(abs));
  } else if (ctx.visiting.has(abs)) {
    // Import cycle: fall back to the file's own text with any existing ?v= stripped.
    return sha8(readFileSync(abs, 'utf8').replace(/\?v=[0-9a-f]{8}/g, ''));
  } else {
    ctx.visiting.add(abs);
    hash = sha8(rewrite(readFileSync(abs, 'utf8'), rootDir, abs, kind, ctx));
    ctx.visiting.delete(abs);
  }
  ctx.hashes.set(abs, hash);
  return hash;
}

function rewrite(source, rootDir, file, kind, ctx) {
  const fromDir = file ? dirname(file) : rootDir;
  const target = (ref) => (ref.startsWith('/') ? join(rootDir, ref) : resolve(fromDir, ref));
  const hashed = (ref) => `${ref}?v=${hashFile(target(ref), rootDir, ctx)}`;
  if (kind === 'css') {
    return source.replace(CSS_REF, (whole, q, ref, frag = '') =>
      /^(?:data:|[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref) ? whole : `url(${q}${hashed(ref)}${frag}${q})`);
  }
  if (kind === 'js') {
    return source.replace(JS_REF, (_, lead, q, ref) => `${lead}${q}${hashed(ref)}${q}`);
  }
  return source.replace(HTML_REF, (_, lead, q, ref, frag = '') => `${lead}${q}${hashed(ref)}${frag}${q}`);
}

// Appends ?v=<sha256[0..8]> to local asset refs. A CSS/JS file's hash is taken from its
// rewritten text, so a leaf change propagates to every importer; existing ?v= is replaced.
// `file` (absolute or root-relative) locates CSS/JS sources for relative refs and sets the kind.
export function hashAssetRefs(source, rootDir, { file, kind } = {}) {
  const abs = file ? (isAbsolute(file) ? file : join(rootDir, file)) : undefined;
  const ctx = { hashes: new Map(), visiting: new Set(abs ? [abs] : []) };
  return rewrite(source, rootDir, abs, kind ?? kindOf(abs), ctx);
}

export function assetHash(path, rootDir) {
  const abs = isAbsolute(path) ? path : join(rootDir, path);
  return hashFile(abs, rootDir, { hashes: new Map(), visiting: new Set() });
}

// A root-relative asset path plus ?v=<hash>, for refs hashAssetRefs never rewrites (meta
// content, JSON-LD). assetHash would read a leading "/" as the filesystem root.
export function hashedAssetPath(path, rootDir) {
  if (!path?.startsWith('/')) throw new Error(`hashedAssetPath: path must be root-relative, got "${path}"`);
  return `${path}?v=${assetHash(join(rootDir, path.slice(1)), rootDir)}`;
}

// Rewrites CSS/JS files in place; order does not matter because hashes ignore existing ?v=.
export function hashAssetsInPlace(rootDir, files, { write = true } = {}) {
  const changed = [];
  for (const file of files) {
    const abs = isAbsolute(file) ? file : join(rootDir, file);
    const before = readFileSync(abs, 'utf8');
    const after = hashAssetRefs(before, rootDir, { file: abs });
    if (after !== before) {
      changed.push(relative(rootDir, abs));
      if (write) writeFileSync(abs, after);
    }
  }
  return changed;
}

export const FONT_PRELOAD_FILES = ['bricolage-grotesque-var.woff2', 'instrument-sans-var.woff2'];

// Hashing the returned hrefs gives the @font-face url() hash, so a font is fetched once (KTD3).
export function fontPreloads(rootDir, files = FONT_PRELOAD_FILES) {
  const css = readFileSync(join(rootDir, 'assets/css/tokens.css'), 'utf8');
  return files.map((file) => {
    const href = `/assets/fonts/${file}`;
    const declared = new RegExp(`url\\(\\s*['"]?${href.replace(/\./g, '\\.')}(?:\\?v=[0-9a-f]{8})?['"]?\\s*\\)`);
    if (!declared.test(css)) throw new Error(`assets/css/tokens.css: no @font-face url() for ${file}`);
    return { href, as: 'font', type: 'font/woff2' };
  });
}

// --- `/` pre-paint redirect to /tr/ (KTD2) ---

// Precedence: ?lang= > saved choice > the first en/tr entry in the browser languages.
// Serialized into the inline script via toString().
export function shouldRedirectToTr({ search = '', saved = null, languages = [] } = {}) {
  var m = /[?&]lang=(en|tr)(?:&|#|$)/.exec(search || '');
  if (m) return m[1] === 'tr';
  if (saved === 'tr' || saved === 'en') return saved === 'tr';
  var list = languages || [];
  for (var i = 0; i < list.length; i++) {
    var hit = /^(en|tr)(?:-|_|$)/i.exec(String(list[i]));
    if (hit) return hit[1].toLowerCase() === 'tr';
  }
  return false;
}

export function trRedirectScript() {
  return '<script>(function () { try { '
    + `var decide = ${shouldRedirectToTr.toString()}; `
    + "var saved = null; try { saved = localStorage.getItem('velora-lang'); } catch (e) {} "
    + "var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']; "
    + "if (decide({ search: location.search, saved: saved, languages: langs })) location.replace('/tr/' + location.hash); "
    + '} catch (e) {} })();</script>';
}
