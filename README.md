# Velora — Marketing Site

The static landing page for **Velora**, a privacy-first wellness app for iOS.
Built as a multi-file static bundle (no build tooling) and deployed to Cloudflare Pages.

## Highlights

- **Multi-accent design system** — purple (Metrics), orange (Trends), cyan (Activities), mirroring the app's three core surfaces. The active accent is driven by scroll position via `IntersectionObserver` and exposed through CSS custom properties.
- **Sticky-scroll showcase** — one phone is pinned while three text stages scroll past; image and accent swap as each stage activates.
- **Bilingual (EN / TR)** — all copy is locale-aware via `data-i18n` attributes; per-locale screenshot variants swap automatically.
- **Brand-locked CTAs** — primary App Store CTA and focus rings stay cyan even as the section accent changes.
- **No build step** — pure HTML / CSS / ES modules. CSS is split into 5 stylesheets that HTTP/2 multiplexes; locale strings are fetched on demand.

## File Structure

```
.
├── index.html                    # ~267 lines — DOM skeleton + <link>/<script> tags
├── assets/
│   ├── css/
│   │   ├── tokens.css            # CSS variables, font import, multi-accent system
│   │   ├── base.css              # Reset, body, ambient orbs, focus styles
│   │   ├── layout.css            # Container, sticky nav, footer
│   │   ├── components.css        # Buttons, chips, phone frame, pillar cards, lang switch
│   │   └── sections.css          # Hero, sticky showcase, pillars, privacy
│   ├── js/
│   │   ├── i18n.js               # applyLocale, localStorage persistence, JSON fetch
│   │   └── app.js                # Entry: bootstrap, lang switch, IntersectionObserver
│   └── data/
│       ├── strings.en.json
│       └── strings.tr.json
├── images/
│   ├── velora.png                # App icon / favicon
│   ├── en1.jpg, en2.jpg, en3.jpg # English screenshots (Home, Trends, Activities)
│   └── tr1.jpg, tr2.jpg, tr3.jpg # Turkish screenshots
├── app-ads.txt                   # App advertising config
├── CNAME                         # Custom domain
├── _redirects                    # Cloudflare Pages routing
└── robots.txt
```

## Local Development

The site has no build step. Serve the directory with any static server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

ES modules require an actual HTTP server — `file://` will not work for `import`.

## Deployment (Cloudflare Pages)

### Option 1: Connect via Dashboard

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages** → **Create a project** → **Connect to Git**
2. Build settings: leave **Build command** and **Output directory** empty (it's already static)
3. Save & deploy

### Option 2: Wrangler CLI

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name velora-website
```

## Internationalization

All user-facing strings live in `assets/data/strings.{en,tr}.json`. To add or update copy:

1. Edit the JSON files — keep keys parallel between locales.
2. In HTML, reference keys via attributes:
   - `data-i18n="hero.h1"` — replaces `textContent`
   - `data-i18n-alt="showcase.metrics.imgAlt"` — replaces `alt`
   - `data-i18n-aria-label="nav.langGroupAria"` — replaces `aria-label`
3. For per-locale image swaps, add `data-src-en` and `data-src-tr` attributes to `<img>`.

The selected locale is persisted in `localStorage['velora-lang']`. The first visit detects from `navigator.languages` (Turkish-prefer logic).

## Adding a New Showcase Stage

Each stage is a `<article data-showcase-section>` block in `index.html`:

```html
<article class="showcase__section"
         data-showcase-section
         data-accent="metrics|trends|activities"
         data-src-en="images/enN.jpg"
         data-src-tr="images/trN.jpg"
         data-alt-en="..."
         data-alt-tr="...">
  <span class="eyebrow" data-i18n="showcase.X.eyebrow"></span>
  <h2 data-i18n="showcase.X.h1"></h2>
  <p class="showcase__sub" data-i18n="showcase.X.sub"></p>
  <!-- mobile-only inline phone copy here -->
</article>
```

The `IntersectionObserver` in `app.js` will pick up the new section automatically. Add a matching `--accent-X` token in `tokens.css` if introducing a new accent role.

## Browser Support

`color-mix()`, `:has()`, `@layer`-free CSS, and ES modules. All evergreen browsers (Chrome, Firefox, Safari 16.2+, Edge). iOS Safari 16.4+ for `color-mix`. Reduced-motion is respected.

## License

All rights reserved. © 2026 Velora.
