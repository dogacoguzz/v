# Fonts

The site self-hosts three OFL families as subset, variable woff2 files in `assets/fonts/`.
No request goes to a font CDN.

| File | Source family | Axes kept | Glyphs |
|---|---|---|---|
| `bricolage-grotesque-var.woff2` | Bricolage Grotesque | `opsz` 14-96, `wght` 500-800 | Latin + Latin Extended-A |
| `instrument-sans-var.woff2` | Instrument Sans | `wght` 400-700 | Latin + Latin Extended-A |
| `jetbrains-mono-var.woff2` | JetBrains Mono | `wght` 100-800 | digits, `: . , - + / %`, space, `A M P a g h i k m n p s` |

Latin + Latin Extended-A covers Turkish (`ğ Ğ ş Ş ı İ ç Ç ö Ö ü Ü`). The mono file only
carries clock and unit labels, so do not use it for running text.

## Rebuild

```sh
python3 -m venv /tmp/fonts-venv
/tmp/fonts-venv/bin/python -m pip install fonttools brotli
PYTHON=/tmp/fonts-venv/bin/python tools/fonts/subset.sh /tmp/fonts-work
```

`subset.sh` downloads the upstream variable TTFs and OFL texts from `google/fonts`, pins
`wdth` to 100, trims the axis ranges, subsets with `--layout-features='*'` and writes
woff2 into `assets/fonts/`. Commit the woff2 output and the `OFL-*.txt` files.

## Wiring

`assets/css/tokens.css` declares the `@font-face` rules (`font-display: swap`) and
metric-matched local fallback faces (`Bricolage Fallback`, `Instrument Fallback`,
`JetBrains Fallback`) that reduce layout shift while the web fonts load. The build
appends a content hash to each `url()`, so a preload and its `@font-face` share one URL.
Preload at most the display and text files.
