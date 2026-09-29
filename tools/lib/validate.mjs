// validate.mjs: top-level markup allowlist check shared by the legal and guide builders.

import { EM_DASH } from './util.mjs';

export const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// Elements any content fragment may use at the top level; each builder extends this set.
export const BASE_ALLOWLIST = {
  h2: [''],
  p: ['', 'last-updated'],
  ul: [''],
  table: ['data-table'],
  div: ['legal__table-scroll', 'highlight', 'warning-box', 'danger-box', 'contact-info'],
};

const attrValue = (attrs, name) => {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m ? m[1].trim() : '';
};

// Top-level elements must match the allowlist; nested markup is the document's own business.
export function assertClean(html, allowlist, { text = 'user-facing' } = {}) {
  const placeholder = /\\\([^)]*\)?/.exec(html);
  if (placeholder) throw new Error(`assertClean: unresolved placeholder ${placeholder[0]}`);
  const embedded = /<(script|style)\b/i.exec(html);
  if (embedded) throw new Error(`assertClean: embedded <${embedded[1].toLowerCase()}> element is not allowed`);
  if (html.includes(EM_DASH)) {
    throw new Error(`assertClean: em dash (U+2014) is not allowed in ${text} text`);
  }

  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let depth = 0;
  for (let m = tagRe.exec(stripped); m; m = tagRe.exec(stripped)) {
    const [, closing, rawTag, attrs] = m;
    const tag = rawTag.toLowerCase();
    if (closing) { depth = Math.max(0, depth - 1); continue; }
    const selfClosing = VOID_TAGS.has(tag) || /\/\s*$/.test(attrs);
    if (depth === 0) {
      const cls = attrValue(attrs, 'class');
      const allowed = allowlist[tag];
      if (!allowed || !allowed.includes(cls)) {
        const label = cls ? `<${tag} class="${cls}">` : `<${tag}>`;
        throw new Error(`assertClean: top-level ${label} is outside the allowlist`);
      }
    }
    if (!selfClosing) depth += 1;
  }
  if (depth !== 0) throw new Error(`assertClean: unbalanced markup, ${depth} element(s) never closed`);
}
