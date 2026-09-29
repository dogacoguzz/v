// prerender.mjs: pure string transforms shared by the page builders (landing strings,
// key parity, the language switch state). Regex over HTML on purpose: the builders have no deps.

const get = (strings, path) =>
  path.split('.').reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), strings);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// flattens a nested strings object into dotted key paths, for key-parity checks
const flattenKeys = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flattenKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );

export const keyParity = (a, b) => {
  const ka = flattenKeys(a).sort();
  const kb = flattenKeys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
};

// Bakes strings into data-i18n / data-i18n-html / data-i18n-alt / data-i18n-aria-label
// nodes; the key attributes stay so a rebuild can re-apply them to the generated page.
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

export function markLangSwitch(html, locale) {
  return html.replace(
    /(<button type="button" data-locale="(en|tr)" aria-current=")(?:true|false)(")/g,
    (_, open, btnLocale, close) => `${open}${btnLocale === locale ? 'true' : 'false'}${close}`
  );
}
