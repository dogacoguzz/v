// prerender.mjs — pure string transforms shared by build-tr.mjs and build-legal.mjs.
// Everything here is regex-over-HTML on purpose: the site has no build step and no deps.

const get = (strings, path) =>
  path.split('.').reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), strings);

export const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// flattens a nested strings object into dotted key paths, for key-parity checks
export const flattenKeys = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flattenKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );

export const keyParity = (a, b) => {
  const ka = flattenKeys(a).sort();
  const kb = flattenKeys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
};

// Bakes strings into data-i18n / data-i18n-html / data-i18n-alt / data-i18n-aria-label
// nodes; the data-i18n-* key attributes stay intact so the client script still works.
export function applyI18nStrings(html, strings) {
  const missing = [];
  const lookup = (key) => {
    const value = get(strings, key);
    if (typeof value !== 'string') { missing.push(key); return undefined; }
    return value;
  };

  for (const m of [...html.matchAll(/data-i18n="([^"]+)"/g)]) {
    const key = m[1];
    const value = lookup(key);
    if (value === undefined) continue;
    html = html.replace(
      new RegExp(`(data-i18n="${esc(key)}"[^>]*>)([^<]*)`, 'g'),
      (_, open) => `${open}${value}`
    );
  }

  html = html.replace(
    /(<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*data-i18n-html="([^"]+)"[^>]*>)[\s\S]*?(<\/\2>)/g,
    (whole, open, _tag, key, close) => {
      const value = lookup(key);
      return value === undefined ? whole : `${open}${value}${close}`;
    }
  );

  for (const attr of ['alt', 'aria-label']) {
    const tagRe = new RegExp(`<[^>]*data-i18n-${attr}="([^"]+)"[^>]*>`, 'g');
    const attrRe = new RegExp(`(\\s)${attr}="[^"]*"`);
    html = html.replace(tagRe, (tag, key) => {
      const value = lookup(key);
      if (value === undefined) return tag;
      return tag.replace(attrRe, (_, ws) => `${ws}${attr}="${value}"`);
    });
  }

  return { html, missing: [...new Set(missing)] };
}

// Turns index.html's relative asset/image/legal hrefs into root-relative ones so the
// same chrome works from /, /tr/ and the legal directories. The EULA link is already absolute.
export function rewriteRootRelativePaths(html, { localePrefix = '' } = {}) {
  return html
    .replace(/(href|src)="assets\//g, '$1="/assets/')
    .replace(/(href|src|content)="images\//g, '$1="/images/')
    .replace(/(data-(?:src|alt)-(?:en|tr))="images\//g, '$1="/images/')
    .replace(/href="privacy-policy\//g, `href="${localePrefix}/privacy-policy/`)
    .replace(/href="terms-of-service\//g, `href="${localePrefix}/terms-of-service/`);
}

export function markLangSwitch(html, locale) {
  return html.replace(
    /(<button type="button" data-locale="(en|tr)" aria-current=")(?:true|false)(")/g,
    (_, open, btnLocale, close) => `${open}${btnLocale === locale ? 'true' : 'false'}${close}`
  );
}
