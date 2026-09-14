# Velora — Marketing Site

The static landing page for **Velora: Health Companion**, a privacy-first wellness app for iOS.
Built as a multi-file static bundle (no build tooling). **Live at
[velorahealthcompanion.com](https://velorahealthcompanion.com) on GitHub Pages** (via `CNAME`);
`_redirects` is kept only for an optional future move to Cloudflare Pages.

## Highlights

- **Multi-accent design system** — purple (Metrics), orange (Trends), cyan (Activities), mirroring the app's three core surfaces. The active accent is driven by scroll position via `IntersectionObserver`. `--accent` is a registered custom property (`@property`), and the derived tokens (`--accent-dim/soft/glow/ink`) are re-declared inside every `[data-accent]` scope — custom properties resolve `var()` where they are *declared*, so a `:root`-only declaration would freeze them to the default cyan.
- **Sticky-scroll showcase** — one phone is pinned while three text stages scroll past; the image decode-then-fades and the accent swaps as each stage activates.
- **Bilingual (EN / TR)** — all copy is locale-aware via `data-i18n` attributes; per-locale screenshot variants swap automatically. Locale priority: `?lang=` URL param → saved choice → browser language. `?lang=tr` is the crawlable Turkish entry point (see `hreflang` alternates in the head and `sitemap.xml`).
- **Brand-locked accents** — nav CTA, focus rings, and the closing-CTA glow stay cyan even as section accents change.
- **Official App Store badges** — `images/badge-appstore-{en,tr}.svg` are Apple's own artwork (downloaded from Apple's marketing toolbox; per Apple's guidelines the badge must not be restyled, and the standalone Apple logo must not be used as an icon).
- **No build step** — pure HTML / CSS / ES modules. CSS is split into 6 stylesheets that HTTP/2 multiplexes; locale strings are fetched on demand.

## File Structure

```
.
├── index.html                    # EN page — DOM skeleton + meta/OG/JSON-LD + <link>/<script> tags
├── tr/index.html                 # GENERATED Turkish page — do not edit by hand (see tools/)
├── privacy-policy/index.html     # GENERATED legal page — do not edit by hand (see tools/build-legal.mjs)
├── terms-of-service/index.html   # GENERATED legal page — do not edit by hand
├── tr/privacy-policy/index.html  # GENERATED legal page — do not edit by hand
├── tr/terms-of-service/index.html # GENERATED legal page — do not edit by hand
├── eula/index.html               # Self-contained redirect to Apple's standard EULA (noindex)
├── tools/build-tr.mjs            # Prerenders tr/index.html from index.html + strings.tr.json
├── tools/build-legal.mjs         # Generates the four legal pages from a Firebase Remote Config export
├── tools/build-legal.test.mjs    # node:test suite for the generator's pure functions
├── tools/lib/prerender.mjs       # Shared prerender helpers (i18n substitution, root-relative + locale-prefixed path rewrite)
├── 404.html                      # Self-contained not-found page (GitHub Pages picks it up)
├── sitemap.xml                   # /, /tr/ and the four legal pages with hreflang alternates
├── assets/
│   ├── css/
│   │   ├── tokens.css            # CSS variables, @property --accent, multi-accent system
│   │   ├── base.css              # Reset, body, ambient orbs, focus styles, .visually-hidden
│   │   ├── layout.css            # Container, sticky nav, footer
│   │   ├── components.css        # Buttons, chips, phone frame, pillar cards, lang switch
│   │   ├── sections.css          # Hero, sticky showcase, AI coach, pillars, privacy, closing CTA
│   │   └── legal.css             # Legal document pages (.legal scope) + print styles
│   ├── js/
│   │   ├── i18n.js               # applyLocale, ?lang= / localStorage / navigator resolution
│   │   └── app.js                # Entry: bootstrap, lang switch, IntersectionObserver, crossfade
│   └── data/
│       ├── strings.en.json
│       └── strings.tr.json
├── images/
│   ├── velora.png                # Master app icon (source asset — not referenced by pages)
│   ├── favicon-32.png            # Derived favicon
│   ├── apple-touch-icon.png      # Derived 180×180, flattened on #0c0f12
│   ├── logo-56.png               # Derived nav/footer logo (28px @2x)
│   ├── og.jpg                    # 1200×630 social share card
│   ├── en{1..3}.jpg, tr{1..3}.jpg   # Master App Store screenshots (source assets)
│   └── en{1..3}.webp, tr{1..3}.webp # Derived 680×1476 WebP actually served by the site
├── app-ads.txt                   # App advertising config
├── CNAME                         # GitHub Pages custom domain
├── _redirects                    # Only used if deployed to Cloudflare Pages
└── robots.txt                    # + Sitemap pointer
```

### Image pipeline

`velora.png` and the `*.jpg` screenshots are **source masters** — keep them. The pages only
reference the derived files. To regenerate derivatives after replacing a master: resize
screenshots to 680×1476 WebP (~q80, ≈35 KB each) and re-export the icon sizes
(32 / 56 / 180 px — the 180 px apple-touch icon should be flattened onto `#0c0f12`).
Any tool works (e.g. `cwebp`, Squoosh, or a headless-canvas script).

## Local Development

The site has no build step. Serve the directory with any static server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

ES modules require an actual HTTP server — `file://` will not work for `import`.

## Deployment

**Host: GitHub Pages.** Push to `main` and the automatic "pages build and deployment"
workflow publishes the repo root. The custom domain comes from `CNAME`; HTTPS is
enforced in repo Settings → Pages.

DNS layout (zone lives on Cloudflare nameservers):
- apex `velorahealthcompanion.com` → A records to GitHub Pages IPs (DNS only)
- `www` → Cloudflare-proxied 301 redirect to the apex

Notes:
- There must be **no Cloudflare Pages project connected to this repo** — a leftover
  Git-connected project re-runs its own (failing) build on every push. If one exists,
  delete it in Cloudflare → Workers & Pages. No `wrangler` anywhere in this setup.
- GitHub Pages cannot set custom response headers; `_headers` and `_redirects` are
  **dormant** files kept only for a potential future Cloudflare Pages migration.
- Two pushes within ~2 minutes can collide in the Pages queue ("Deployment failed,
  try again later"). Batch changes into one push, or just re-run the failed workflow.

## Internationalization

All user-facing strings live in `assets/data/strings.{en,tr}.json`. To add or update copy:

1. Edit the JSON files — keep keys parallel between locales, and keep Turkish in the
   informal register ("sen") except the legal disclaimer.
2. In HTML, reference keys via attributes:
   - `data-i18n="hero.sub"` — replaces `textContent`
   - `data-i18n-html="hero.h1"` — replaces `innerHTML` (used for `<br>`/`<em>` lockups)
   - `data-i18n-alt="showcase.metrics.imgAlt"` — replaces `alt`
   - `data-i18n-aria-label="nav.langGroupAria"` — replaces `aria-label`
3. For per-locale image swaps, add `data-src-en` and `data-src-tr` attributes to `<img>`; for per-locale link targets (e.g. footer legal links), add `data-href-en` and `data-href-tr` instead.
4. Bump `STRINGS_VERSION` in `assets/js/i18n.js` so returning visitors fetch fresh strings.
5. **Regenerate the static Turkish page and commit it:** `node tools/build-tr.mjs`.
   Turkish lives at the prerendered `/tr/` so crawlers that don't execute JavaScript
   (Bing, GPTBot, ClaudeBot, …) can read it; client-side i18n alone was Google-only.
   `node tools/build-legal.mjs <export>` regenerates the Turkish legal pages' chrome
   the same way — see [Legal Pages](#legal-pages) below for the full workflow.

Locale resolution order: `<html data-locale>` (fixed-locale generated pages) → `/tr/`
path → `?lang=` param (legacy) → saved choice → browser language. The language switch
navigates to the page's own `hreflang` alternate (same-origin pathname): on a legal
page it opens the sibling document in the other locale, and on the home pages it keeps
navigating between `/` and `/tr/`. Fixed-locale pages keep their own `<title>` and meta
description regardless of the visitor's saved language. A tiny inline script in
`<head>` of the EN page resolves the locale before paint and preloads the
correct-locale showcase image — keep it in sync with `i18n.js`.

## Legal Pages

`/privacy-policy/`, `/terms-of-service/` (English) and `/tr/privacy-policy/`,
`/tr/terms-of-service/` (Turkish) are generated pages, not hand-written. Their text
comes from the Firebase Remote Config template of project `velora-79f7c`
(parameters `privacy_policy_en` / `privacy_policy_tr` / `terms_of_service_en` /
`terms_of_service_tr`; `eula_url` is cross-checked against the constant in `eula/index.html`
so the two never drift apart).

Workflow to sync a console edit:

1. Edit the text in the Firebase console.
2. Export the template: `npx firebase-tools remoteconfig:get --project velora-79f7c -o /tmp/rc.json`.
3. Regenerate the pages: `node tools/build-legal.mjs /tmp/rc.json`.
4. Review the diff.
5. Commit the regenerated pages.

The export itself is never committed — it carries unrelated feature flags alongside
the legal parameters. The generator only touches presentation: it replaces
`\(appName)` with `Velora`, drops the App Version paragraph, strips inline styles, and
wraps tables for horizontal scroll on narrow screens; it fails loudly on a missing
parameter, an unresolved placeholder, or markup outside its known allowlist. Re-syncing
after a console edit is a manual step — nothing watches the console for changes, so
nobody is reminded to run it.

`/eula` is different: it's a hand-written `eula/index.html` that forwards to Apple's standard
EULA (`https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`) via meta
refresh, a `location.replace` script, and a visible fallback link, and is `noindex`.

Canonical URLs use the trailing-slash form (`/privacy-policy/`); GitHub Pages redirects
the slashless request to the directory index, the same as it already does for `/tr`.
`/eula` is a directory index too, so any static server (GitHub Pages, `python3 -m http.server`) redirects it to `/eula/` and serves the page.

Run the generator's test suite with `node --test tools/build-legal.test.mjs` (Node
20+; the file is named explicitly because `node --test <directory>` is not accepted on
Node 21+). The tests that exercise the real documents read the export from `/tmp/rc.json`
(override with `RC_EXPORT=<path>`) and are skipped when it is absent.

## Adding a New Showcase Stage

Each stage is a `<article data-showcase-section>` block in `index.html`:

```html
<article class="showcase__section"
         data-showcase-section
         data-accent="metrics|trends|activities"
         data-src-en="images/enN.webp"
         data-src-tr="images/trN.webp"
         data-alt-en="..."
         data-alt-tr="...">
  <span class="eyebrow" data-i18n="showcase.X.eyebrow"></span>
  <h2 data-i18n="showcase.X.h1"></h2>
  <p class="showcase__sub" data-i18n="showcase.X.sub"></p>
  <!-- mobile-only inline phone copy here -->
</article>
```

The `IntersectionObserver` in `app.js` will pick up the new section automatically. Add a
matching `--accent-X` token in `tokens.css` if introducing a new accent role.

## Browser Support

`color-mix()`, `@property`, and ES modules. All evergreen browsers (Chrome, Firefox 128+,
Safari 16.4+, Edge). Where `@property` is unavailable the accent still switches — it just
doesn't interpolate. Reduced-motion is respected (CSS and JS scrolling/fades).

## License

All rights reserved. © 2026 Velora.
