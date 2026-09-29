// util.mjs: small string helpers and constants every builder shares.

export const EM_DASH = '\u2014';

// Lowercase-dashed URL and campaign segment: "daily-step-goal", "g-steps".
export const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const count = (html, re) => (html.match(re) || []).length;

// Trims leading blank lines and trailing space, then removes the indent every line shares.
export const reindent = (html) => {
  const lines = html.replace(/^\s*\n|\s+$/g, '').split('\n');
  const common = Math.min(...lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)[0].length));
  return lines.map((l) => (l.trim() ? l.slice(common) : '')).join('\n');
};

export const indent = (html, pad) => html.split('\n').map((l) => (l ? pad + l : l)).join('\n');

// Prints one row per check; a check passes only when it is exactly true, a string is the reason.
export function reportChecks(pages, log) {
  let failed = false;
  for (const { path, checks } of pages) {
    for (const [name, ok] of Object.entries(checks)) {
      log(`${ok === true ? 'ok  ' : 'FAIL'} ${path}: ${name}${typeof ok === 'string' ? ` (${ok})` : ''}`);
      if (ok !== true) failed = true;
    }
  }
  if (failed) throw new Error('sanity checks failed; nothing written');
}
