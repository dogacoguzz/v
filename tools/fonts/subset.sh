#!/usr/bin/env bash
# Rebuilds assets/fonts/*.woff2 from the OFL sources in google/fonts.
# Usage: tools/fonts/subset.sh <work-dir>   (needs python3 with fonttools + brotli)
set -euo pipefail
WORK="${1:?usage: subset.sh <work-dir>}"
PY="${PYTHON:-python3}"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/assets/fonts"
BASE=https://raw.githubusercontent.com/google/fonts/main/ofl
mkdir -p "$WORK" "$OUT"

curl -sfL "$BASE/bricolagegrotesque/BricolageGrotesque%5Bopsz,wdth,wght%5D.ttf" -o "$WORK/bricolage.ttf"
curl -sfL "$BASE/instrumentsans/InstrumentSans%5Bwdth,wght%5D.ttf" -o "$WORK/instrument.ttf"
curl -sfL "$BASE/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf" -o "$WORK/jbmono.ttf"
for f in bricolagegrotesque instrumentsans jetbrainsmono; do
  curl -sfL "$BASE/$f/OFL.txt" -o "$OUT/OFL-$f.txt"
done

# Pin width to 100 and trim opsz/wght to the ranges the site uses.
"$PY" -m fontTools.varLib.instancer "$WORK/bricolage.ttf" wdth=100 wght=500:800 opsz=14:96 -o "$WORK/bricolage-w.ttf"
"$PY" -m fontTools.varLib.instancer "$WORK/instrument.ttf" wdth=100 wght=400:700 -o "$WORK/instrument-w.ttf"

LATIN='U+0020-007E,U+00A0-017F,U+2013,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2192,U+00D7'
MONO='U+0020,U+0025,U+002B-003A,U+0041,U+004D,U+0050,U+0061,U+0067,U+0068,U+0069,U+006B,U+006D,U+006E,U+0070,U+0073'

sub() {
  "$PY" -m fontTools.subset "$1" --unicodes="$2" --layout-features='*' \
    --flavor=woff2 --no-hinting --desubroutinize --output-file="$OUT/$3"
}

sub "$WORK/bricolage-w.ttf"  "$LATIN" bricolage-grotesque-var.woff2
sub "$WORK/instrument-w.ttf" "$LATIN" instrument-sans-var.woff2
sub "$WORK/jbmono.ttf"       "$MONO"  jetbrains-mono-var.woff2
ls -l "$OUT"/*.woff2
