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
- **No build step** — pure HTML / CSS / ES modules. CSS is split into 5 stylesheets that HTTP/2 multiplexes; locale strings are fetched on demand.

## File Structure

```
.
├── index.html                    # DOM skeleton + meta/OG/JSON-LD + <link>/<script> tags
├── 404.html                      # Self-contained not-found page (GitHub Pages picks it up)
├── sitemap.xml                   # Single URL + hreflang alternates
├── assets/
│   ├── css/
│   │   ├── tokens.css            # CSS variables, @property --accent, multi-accent system
│   │   ├── base.css              # Reset, body, ambient orbs, focus styles, .visually-hidden
│   │   ├── layout.css            # Container, sticky nav, footer
│   │   ├── components.css        # Buttons, chips, phone frame, pillar cards, lang switch
│   │   └── sections.css          # Hero, sticky showcase, AI coach, pillars, privacy, closing CTA
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

**Target: Cloudflare Pages (Git integration).** The project must be configured as:

- Framework preset: **None**
- Build command: **empty** (do NOT run `wrangler pages deploy` inside the CI —
  Git-connected Pages projects upload the repo themselves; a wrangler deploy command
  both requires a `CLOUDFLARE_API_TOKEN` with Pages:Edit permission and fights the
  Git integration)
- Build output directory: `/`

`_headers` (caching + security) and `_redirects` take effect on Cloudflare only.

**Domain cutover checklist** (zone already uses Cloudflare nameservers):
1. Pages project → Custom domains → add `velorahealthcompanion.com` and `www.…` —
   Cloudflare creates the DNS records automatically.
2. Once the apex serves from Cloudflare, unpublish GitHub Pages
   (repo Settings → Pages → Source: None) so pushes stop triggering the legacy build.
   The `CNAME` file only matters to GitHub Pages; it is served as a harmless static
   file on Cloudflare.

## Internationalization

All user-facing strings live in `assets/data/strings.{en,tr}.json`. To add or update copy:

1. Edit the JSON files — keep keys parallel between locales, and keep Turkish in the
   informal register ("sen") except the legal disclaimer.
2. In HTML, reference keys via attributes:
   - `data-i18n="hero.sub"` — replaces `textContent`
   - `data-i18n-html="hero.h1"` — replaces `innerHTML` (used for `<br>`/`<em>` lockups)
   - `data-i18n-alt="showcase.metrics.imgAlt"` — replaces `alt`
   - `data-i18n-aria-label="nav.langGroupAria"` — replaces `aria-label`
3. For per-locale image swaps, add `data-src-en` and `data-src-tr` attributes to `<img>`.
4. Bump `STRINGS_VERSION` in `assets/js/i18n.js` so returning visitors fetch fresh strings.

The selected locale is persisted in `localStorage['velora-lang']` and mirrored to the
`?lang=` URL param. A tiny inline script in `<head>` resolves the locale before paint and
preloads the correct-locale showcase image — keep it in sync with `i18n.js`.

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
