import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  OUTPUT_PATHS, QR_PATHS, SOURCE_PATH, faqEntries, leftoverEnglish, localizeBody, pageChecks, qrSvg,
  renderLanding, storeLinks,
} from './build-landing.mjs';
import { BUILDERS } from './build.mjs';
import { APP_NAME, SITE, hashedAssetPath, storeUrl } from './lib/page.mjs';
import { keyDiff } from './lib/prerender.mjs';
import { encodeText, formatBits, reedSolomon } from './lib/qr.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const strings = { en: JSON.parse(read('assets/data/strings.en.json')), tr: JSON.parse(read('assets/data/strings.tr.json')) };
const source = read(SOURCE_PATH);
const committed = { en: read(OUTPUT_PATHS.en), tr: read(OUTPUT_PATHS.tr) };
const render = (locale, overrides = {}) =>
  renderLanding({ locale, source, strings: strings[locale], stringsEn: strings.en, rootDir: ROOT, ...overrides });
const clone = (o) => JSON.parse(JSON.stringify(o));
const graphOf = (html) => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1);
  return JSON.parse(blocks[0][1])['@graph'];
};
const node = (graph, type) => graph.find((n) => n['@type'] === type);

// --- Build wiring and determinism ---

test('build.mjs runs the landing builder in-process', () => {
  const landing = BUILDERS.find((b) => b.name === 'landing');
  assert.ok(landing);
  assert.ok(!/build-tr|spawn/.test(landing.run.toString()));
});

test('committed pages and QR codes equal a fresh render of the current sources', () => {
  for (const locale of ['en', 'tr']) {
    assert.equal(committed[locale], render(locale), `${OUTPUT_PATHS[locale]} is stale; run npm run build`);
    assert.equal(read(QR_PATHS[locale]), qrSvg(locale), `${QR_PATHS[locale]} is stale; run npm run build`);
  }
});

test('rendering the regenerated index.html again is byte-stable', () => {
  const again = renderLanding({ locale: 'en', source: committed.en, strings: strings.en, stringsEn: strings.en, rootDir: ROOT });
  assert.equal(again, committed.en);
});

test('both pages keep the source <main> attributes that scope day.css (.day)', () => {
  const attrs = /<main id="main"([^>]*)>/.exec(source)[1];
  assert.match(attrs, /\bclass="day"/);
  for (const locale of ['en', 'tr']) {
    assert.equal((committed[locale].match(/<main\b/g) || []).length, 1);
    assert.ok(committed[locale].includes(`<main id="main"${attrs}>`), `${OUTPUT_PATHS[locale]} lost <main${attrs}>`);
  }
  assert.ok(render('tr', { source: source.replace('<main id="main" class="day">', '<main id="main" class="day x">') })
    .includes('<main id="main" class="day x">'));
});

// --- Store links and locale assets ---

test('every apps.apple.com link in tr/index.html carries a tr-home- campaign token', () => {
  const links = storeLinks(committed.tr);
  assert.ok(links.length >= 4, `only ${links.length} App Store links`);
  for (const href of links) {
    const ct = new URL(href.replace(/&amp;/g, '&')).searchParams.get('ct');
    assert.match(ct ?? '', /^tr-home-[a-z]+$/, href);
  }
  const placements = links.map((h) => /ct=tr-home-([a-z]+)/.exec(h)[1]);
  assert.deepEqual([...new Set(placements)].sort(), ['close', 'hero', 'nav', 'schema']);
  assert.match(committed.tr, /<meta name="apple-itunes-app" content="app-id=\d+, affiliate-data=pt=[^&"]+&amp;ct=tr-home-banner" \/>/);
});

test('EN links stay on en-home- tokens and each locale shows its own badge and QR', () => {
  for (const href of storeLinks(committed.en)) assert.match(href, /ct=en-home-[a-z]+/);
  assert.ok(committed.en.includes('ct=en-home-banner'));
  for (const [locale, other] of [['en', 'tr'], ['tr', 'en']]) {
    const srcs = [...committed[locale].matchAll(/\ssrc="(\/images\/(?:badge-appstore|qr)-[a-z]+\.svg)\?v=[0-9a-f]{8}"/g)].map((m) => m[1]);
    assert.deepEqual(srcs.sort(), [`/images/badge-appstore-${locale}.svg`, `/images/badge-appstore-${locale}.svg`, `/images/qr-${locale}.svg`]);
    assert.ok(!new RegExp(`\\ssrc="/images/(?:badge-appstore|qr)-${other}`).test(committed[locale]));
  }
});

test('the QR renders at least 3 CSS px per module in markup and CSS', () => {
  const rule = /\.close__qr img \{([^}]*)\}/.exec(read('assets/css/day.css'))?.[1] ?? '';
  const cssWidth = Number(/\bwidth:\s*(\d+)px/.exec(rule)?.[1]);
  assert.ok(!/\bpadding\b/.test(rule), 'padding would shrink the QR inside its border box');
  for (const locale of ['en', 'tr']) {
    const modules = Number(/viewBox="0 0 (\d+) \1"/.exec(read(QR_PATHS[locale]))?.[1]);
    const tag = /<img src="\/images\/qr-[a-z]+\.svg[^>]*>/.exec(committed[locale])?.[0] ?? '';
    const attrWidth = Number(/\swidth="(\d+)"/.exec(tag)?.[1]);
    assert.ok(modules > 0 && attrWidth === cssWidth, `${locale}: img width ${attrWidth} vs CSS ${cssWidth}`);
    assert.ok(cssWidth / modules >= 3, `${locale}: ${cssWidth}px over ${modules} modules`);
  }
});

test('TR page head: lang, canonical, hreflang pair, no redirect script; EN keeps the redirect', () => {
  const tr = committed.tr;
  assert.ok(tr.includes('<html lang="tr" data-locale="tr">'));
  assert.ok(tr.includes('<link rel="canonical" href="https://velorahealthcompanion.com/tr/" />'));
  assert.ok(tr.includes('<link rel="alternate" hreflang="en" href="https://velorahealthcompanion.com/" />'));
  assert.ok(tr.includes('<link rel="alternate" hreflang="tr" href="https://velorahealthcompanion.com/tr/" />'));
  assert.ok(!tr.includes('location.replace'), 'TR page must not carry the / redirect');
  assert.ok(!tr.includes('velora-lang'));
  assert.equal((committed.en.match(/location\.replace\('\/tr\/'/g) || []).length, 1);
  for (const locale of ['en', 'tr']) {
    assert.ok(!committed[locale].includes("classList.add('js')"), `${locale}: pop-in states are gated by day.js, not an inline script`);
  }
});

test('og:image, twitter:image and the JSON-LD image carry the og.jpg content hash', () => {
  const og = `${SITE}${hashedAssetPath('/images/og.jpg', ROOT)}`;
  for (const locale of ['en', 'tr']) {
    const html = committed[locale];
    assert.ok(html.includes(`<meta property="og:image" content="${og}" />`), `${locale} og:image`);
    assert.ok(html.includes(`<meta name="twitter:image" content="${og}" />`), `${locale} twitter:image`);
    assert.equal(node(graphOf(html), 'MobileApplication').image, og, `${locale} JSON-LD image`);
  }
});

// --- Strings ---

test('a missing TR key fails the landing build and names the key', () => {
  const tr = clone(strings.tr);
  delete tr.day.hero.coachLine;
  delete tr.day.t2300.titleAccent;
  assert.throws(() => render('tr', { strings: tr }), /strings\.tr\.json: missing key\(s\) day\.hero\.coachLine, day\.t2300\.titleAccent/);
  const extra = clone(strings.tr);
  extra.day.hero.bonus = 'fazla';
  assert.throws(() => render('tr', { strings: extra }), /not in strings\.en\.json day\.hero\.bonus/);
});

test('a key the page uses but the strings lack fails and is named, for either locale', () => {
  const en = clone(strings.en);
  delete en.day.t0730.title;
  assert.throws(() => render('en', { strings: en, stringsEn: en }), /strings\.en\.json: missing key\(s\) day\.t0730\.title/);
});

test('EN and TR strings keep full key parity', () => {
  assert.deepEqual(keyDiff(strings.en, strings.tr), { missing: [], extra: [] });
});

test('the TR page has no leftover EN copy', () => {
  for (const en of ['A coach for the day you', 'actually had', 'Your average is 6,500 steps', 'Scroll the day', 'Velora Coach', 'Start your']) {
    assert.ok(!committed.tr.includes(en), `EN text left on /tr/: ${en}`);
  }
  assert.deepEqual(leftoverEnglish(committed.tr, strings.en, strings.tr), []);
  assert.ok(committed.tr.includes(strings.tr.day.hero.titleHtml));
  assert.ok(committed.tr.includes(strings.tr.day.hero.coachLine));
});

test('TR numbers match what day.js prints with Intl.NumberFormat("tr")', () => {
  for (const [key, en] of Object.entries(strings.en.day.num)) {
    const [, digits, unit = ''] = /^([\d,.]+)(.*)$/.exec(en);
    const value = Number(digits.replace(/,/g, ''));
    const tr = new Intl.NumberFormat('tr', { maximumFractionDigits: 1 }).format(value) + unit;
    assert.equal(strings.tr.day.num[key], tr, `day.num.${key}`);
  }
});

// --- Pro moments, identity and links (AE1, R1, R3, R6) ---

const moment = (html, id) => new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`).exec(html)[0];

test('AE1: the 06:40 AI coach line and the 18:10 workout card carry the Pro badge; free moments do not', () => {
  const badge = (locale) => `<span class="pro-badge" data-i18n="pro.badge">${strings[locale].pro.badge}</span>`;
  for (const locale of ['en', 'tr']) {
    const html = committed[locale];
    assert.ok(moment(html, 't0640').includes(badge(locale)), `${locale} 06:40`);
    assert.ok(moment(html, 't1810').includes(badge(locale)), `${locale} 18:10`);
    for (const id of ['coach', 't1240', 't2130', 't2300']) assert.ok(!moment(html, id).includes('pro-badge'), `${locale} ${id}`);
    assert.equal((html.match(/class="pro-badge"/g) || []).length, 2);
  }
  assert.equal(strings.en.day.close.price, 'Free to download · Coach with Velora Pro');
});

test('the H1 is the headline only; the 06:40 stamp sits outside it', () => {
  for (const locale of ['en', 'tr']) {
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(committed[locale])[1];
    assert.ok(!/\d\d:\d\d/.test(h1), `${locale}: ${h1}`);
    assert.equal(h1, strings[locale].day.hero.titleHtml);
    assert.match(moment(committed[locale], 't0640'), /<p class="hero__time tnum" data-stamp>06:40<\/p>/);
  }
});

test('the landing has a visible What is Velora block with the not-affiliated line', () => {
  for (const locale of ['en', 'tr']) {
    const about = /<section class="about"[\s\S]*?<\/section>/.exec(committed[locale])[0];
    assert.ok(about.includes(strings[locale].day.about.text));
    assert.ok(about.includes(strings[locale].day.about.notAffiliated));
  }
  assert.equal(strings.en.day.about.notAffiliated, 'Not affiliated with other products named Velora.');
});

test('titles carry the canonical name, iPhone and the category, within 70 characters', () => {
  for (const locale of ['en', 'tr']) {
    const title = /<title>([^<]+)<\/title>/.exec(committed[locale])[1];
    assert.ok(title.startsWith(`${APP_NAME} · `), title);
    assert.match(title, /iPhone/);
    assert.match(title, locale === 'en' ? /Health/ : /Sağlık/);
    assert.ok([...title].length <= 70, `${title.length} characters`);
  }
});

test('in-body guide links point at real guide pages in the page locale', () => {
  for (const locale of ['en', 'tr']) {
    const links = [...committed[locale].matchAll(/<ul class="moment__links">([\s\S]*?)<\/ul>/g)]
      .flatMap((m) => [...m[1].matchAll(/<a href="([^"]+)"/g)].map((l) => l[1]));
    assert.equal(links.length, 3);
    for (const href of links) {
      assert.ok(href.startsWith(locale === 'en' ? '/guides/' : '/tr/rehber/'), `${locale}: ${href}`);
      assert.ok(existsSync(join(ROOT, href, 'index.html')), `${locale}: ${href} has no page`);
    }
  }
  assert.throws(() => localizeBody('<a href="/x/" data-href-en="/x/">x</a>', 'tr', strings.tr), /data-href-tr/);
});

test('Coach lines stay under 12 words and start with a word in both locales (R9)', () => {
  const coachKeys = ['hero.coachLine', 't0730.coach', 't1240.coach2', 't1810.coach1', 't1810.coach2', 't1810.coach3', 't2130.coach1', 't2130.coach2'];
  for (const locale of ['en', 'tr']) {
    const day = strings[locale].day;
    const lines = coachKeys.map((k) => k.split('.').reduce((a, p) => a[p], day));
    lines.push(`${day.t1240.toGoBefore} 2600 ${day.t1240.toGoAfter}`);
    for (const line of lines) {
      assert.ok(line.split(/\s+/).length < 12, `${locale}: "${line}" has 12+ words`);
      assert.match(line, /^\p{L}/u, `${locale}: "${line}" does not open with a word`);
    }
  }
});

test('no em dash in either locale or page', () => {
  for (const locale of ['en', 'tr']) {
    assert.ok(!JSON.stringify(strings[locale]).includes('\u2014'), `strings.${locale}.json`);
    assert.ok(!committed[locale].includes('\u2014'), OUTPUT_PATHS[locale]);
  }
});

// --- JSON-LD ---

test('JSON-LD is one @graph: Organization, WebSite, MobileApplication and FAQPage, per locale', () => {
  for (const locale of ['en', 'tr']) {
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(committed[locale])[1]);
    assert.equal(ld['@context'], 'https://schema.org');
    const graph = graphOf(committed[locale]);
    assert.deepEqual(graph.map((n) => n['@type']), ['Organization', 'WebSite', 'MobileApplication', 'FAQPage']);

    const org = node(graph, 'Organization');
    assert.equal(org['@id'], `${SITE}/#org`);
    assert.equal(org.name, APP_NAME);
    assert.equal(org.logo, `${SITE}/images/apple-touch-icon.png`);
    assert.deepEqual(org.sameAs, [storeUrl(locale, 'home', 'schema')]);
    assert.ok(!org.sameAs.some((u) => u.includes('github.com')));
    assert.ok(!('founder' in org) && !('email' in org), 'developer name and support email wait for F-08');

    const site = node(graph, 'WebSite');
    assert.equal(site.name, APP_NAME);
    assert.deepEqual(site.publisher, { '@id': org['@id'] });

    const app = node(graph, 'MobileApplication');
    assert.equal(app.name, APP_NAME);
    assert.equal(app.operatingSystem, 'iOS');
    assert.equal(app.applicationCategory, 'HealthApplication');
    assert.equal(app.inLanguage, locale);
    assert.equal(app.description, strings[locale].meta.description);
    assert.equal(app.downloadUrl, storeUrl(locale, 'home', 'schema'));
    assert.deepEqual(app.publisher, { '@id': org['@id'] });
    assert.ok(!('aggregateRating' in app) && !('review' in app));
  }
});

test('F-04 open: the only offer is the free download, with the stage 1 Coach line', () => {
  for (const locale of ['en', 'tr']) {
    const app = node(graphOf(committed[locale]), 'MobileApplication');
    assert.deepEqual(app.offers, { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: strings[locale].meta.offerDescription });
    assert.match(app.offers.description, locale === 'en' ? /^Free to download, Coach with Velora Pro$/ : /^İndirmesi ücretsiz, Koç Velora Pro ile$/);
  }
  const ldRe = /(<script type="application\/ld\+json">)[\s\S]*?(<\/script>)/;
  const ld = { '@context': 'https://schema.org', '@graph': graphOf(committed.en) };
  const app = node(ld['@graph'], 'MobileApplication');
  app.offers = [app.offers, { '@type': 'Offer', price: '4.99', priceCurrency: 'USD' }];
  const tampered = committed.en.replace(ldRe, (_, open, close) => `${open}${JSON.stringify(ld)}${close}`);
  const checks = pageChecks(tampered, { locale: 'en', stringsEn: strings.en, strings: strings.en });
  assert.notEqual(checks['JSON-LD lists only the free offer'], true);
  assert.equal(pageChecks(committed.en, { locale: 'en', stringsEn: strings.en, strings: strings.en })['JSON-LD lists only the free offer'], true);
});

test('FAQPage matches the visible questions and answers word for word', () => {
  for (const locale of ['en', 'tr']) {
    const faq = node(graphOf(committed[locale]), 'FAQPage');
    const entries = faqEntries(source, strings[locale]);
    assert.ok(entries.length >= 4 && entries.length <= 6);
    assert.deepEqual(faq.mainEntity.map((q) => q.name), entries.map((e) => e.q));
    for (const [i, { key, q, a }] of entries.entries()) {
      assert.equal(faq.mainEntity[i].acceptedAnswer.text, a);
      assert.ok(committed[locale].includes(`<dt data-i18n="day.about.faq.${key}.q">${q}</dt>`), `${locale} ${key} question`);
      assert.ok(committed[locale].includes(`<dd data-i18n="day.about.faq.${key}.a">${a}</dd>`), `${locale} ${key} answer`);
    }
  }
  assert.throws(() => faqEntries(source.replace(/data-i18n="day\.about\.faq\.[a-z]+\.q"/g, ''), strings.en), /4 to 6/);
});

// --- QR code ---

// Published vectors (thonky.com QR tutorial): "HELLO WORLD" 1-M EC codewords and the
// level-M format information strings for masks 0-7.
const THONKY_FORMAT_M = ['101010000010010', '101000100100101', '101111001111100', '101101101001011',
  '100010111111001', '100000011001110', '100111110010111', '100101010100000'];

test('encoder primitives match published QR test vectors', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(reedSolomon(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  THONKY_FORMAT_M.forEach((bits, mask) => assert.equal(formatBits('M', mask).toString(2).padStart(15, '0'), bits));
});

// Independent reader: GF(256) via log tables, ISO table 9 block layout for level M, its own
// zigzag walk and mask formulas. Shares no code with tools/lib/qr.mjs.
const EXP = new Array(512); const LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const M_LAYOUT = { 1: [[1, 16, 10]], 2: [[1, 28, 16]], 3: [[1, 44, 26]], 4: [[2, 32, 18]], 5: [[2, 43, 24]], 6: [[4, 27, 16]] };
const MASK_RULES = [
  (i, j) => (i + j) % 2 === 0, (i) => i % 2 === 0, (i, j) => j % 3 === 0, (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0, (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0, (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

function readSvgMatrix(svg) {
  const dim = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)[1]);
  const grid = Array.from({ length: dim }, () => new Array(dim).fill(0));
  for (const [, x, y, n] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
    for (let k = 0; k < Number(n); k++) grid[Number(y)][Number(x) + k] = 1;
  }
  const quiet = 4;
  assert.ok(grid.slice(0, quiet).flat().every((v) => !v), 'quiet zone is not empty');
  return grid.slice(quiet, dim - quiet).map((row) => row.slice(quiet, dim - quiet));
}

function decodeQr(m) {
  const size = m.length;
  const version = (size - 17) / 4;
  assert.ok(M_LAYOUT[version], `unexpected version ${version}`);
  const fmtCoords = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  let fmt = 0;
  fmtCoords.forEach(([x, y], k) => { fmt |= m[y][x] << k; });
  const mask = THONKY_FORMAT_M.indexOf(fmt.toString(2).padStart(15, '0'));
  assert.ok(mask >= 0, 'format info is not a level-M code word');

  const c = size - 7;
  const reserved = (x, y) => (x < 9 && y < 9) || (x >= size - 8 && y < 9) || (x < 9 && y >= size - 8)
    || x === 6 || y === 6 || (version > 1 && Math.abs(x - c) <= 2 && Math.abs(y - c) <= 2);
  const bits = [];
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let t = 0; t < size; t++) {
      const y = up ? size - 1 - t : t;
      for (const x of [col, col - 1]) if (!reserved(x, y)) bits.push(m[y][x] ^ (MASK_RULES[mask](y, x) ? 1 : 0));
    }
    up = !up;
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + b, 0));

  const [[blocks, dataLen, eccLen]] = M_LAYOUT[version];
  const cw = Array.from({ length: blocks }, () => []);
  let p = 0;
  for (let i = 0; i < dataLen; i++) for (let b = 0; b < blocks; b++) cw[b].push(bytes[p++]);
  for (let i = 0; i < eccLen; i++) for (let b = 0; b < blocks; b++) cw[b].push(bytes[p++]);
  for (const block of cw) {
    for (let r = 0; r < eccLen; r++) {
      const syndrome = block.reduce((acc, v) => (acc === 0 ? 0 : EXP[LOG[acc] + r]) ^ v, 0);
      assert.equal(syndrome, 0, `Reed-Solomon syndrome ${r} is not zero`);
    }
  }
  const data = cw.flatMap((block) => block.slice(0, dataLen));
  const dbits = data.flatMap((v) => [7, 6, 5, 4, 3, 2, 1, 0].map((s) => (v >> s) & 1));
  const take = (n) => dbits.splice(0, n).reduce((a, b) => a * 2 + b, 0);
  assert.equal(take(4), 0b0100, 'not byte mode');
  const len = take(8);
  const payload = Buffer.from(Array.from({ length: len }, () => take(8))).toString('utf8');
  assert.equal(take(4), 0, 'missing terminator');
  return { version, mask, payload };
}

test('each committed QR SVG decodes to its locale\'s -qr App Store URL', () => {
  for (const locale of ['en', 'tr']) {
    const { payload, version } = decodeQr(readSvgMatrix(read(QR_PATHS[locale])));
    assert.equal(payload, storeUrl(locale, 'home', 'qr'));
    assert.match(payload, new RegExp(`[?&]ct=${locale}-home-qr&`));
    assert.ok(version <= 6);
  }
});

test('the independent reader round-trips other payloads and every forced mask', () => {
  for (const text of ['https://velorahealthcompanion.com/tr/', 'a', 'x'.repeat(100)]) {
    for (let mask = 0; mask < 8; mask++) {
      const qr = encodeText(text, { ecl: 'M', mask });
      if (!M_LAYOUT[qr.version]) continue;
      const decoded = decodeQr(qr.modules.map((row) => row.map((v) => (v ? 1 : 0))));
      assert.equal(decoded.payload, text);
      assert.equal(decoded.mask, mask);
    }
  }
});
