#!/usr/bin/env bash
# check-headers.sh: verifies the live site serves the headers the Cloudflare rules should add.
# GitHub Pages ignores _headers, so these come from Cloudflare (see README, "Cloudflare runbook").
#
#   tools/check-headers.sh [https://velorahealthcompanion.com]

set -u
BASE="${1:-https://velorahealthcompanion.com}"
BASE="${BASE%/}"
fail=0

# Last value of header $2 in the final response for URL $1 (redirects followed).
header() {
  curl -sIL --max-time 20 "$1" | tr -d '\r' | grep -i "^$2:" | tail -1 | sed -E 's/^[^:]*: *//'
}

check() {
  local url="$1" name="$2" pattern="$3" value
  value="$(header "$url" "$name")"
  if [[ -n "$value" && "$value" =~ $pattern ]]; then
    echo "ok   $name on ${url#"$BASE"}: $value"
  else
    echo "FAIL $name on ${url#"$BASE"}: got '${value:-<missing>}', expected /$pattern/"
    fail=1
  fi
}

PAGE="$BASE/"
check "$PAGE" strict-transport-security 'max-age=[0-9]{7,}'
check "$PAGE" x-content-type-options '^nosniff$'
check "$PAGE" referrer-policy '.+'
check "$PAGE" permissions-policy '.+'
check "$PAGE" x-frame-options '^(DENY|SAMEORIGIN)$'

ASSET="$(curl -sL --max-time 20 "$BASE/" | grep -o '/assets/css/tokens\.css[^"]*' | head -1)"
ASSET="${ASSET:-/assets/css/tokens.css}"
# One year is 31536000 s; accept anything from about a year (8 digits starting 3 or more, or 9+ digits).
check "$BASE$ASSET" cache-control 'max-age=([3-9][0-9]{7}|[1-9][0-9]{8,})'

status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE/definitely-not-a-page-404")"
if [[ "$status" == "404" ]]; then
  echo "ok   unknown path returns 404"
else
  echo "FAIL unknown path returned $status, expected 404"
  fail=1
fi

not_cached="$(header "$BASE/definitely-not-a-page-404" cache-control)"
if [[ "$not_cached" =~ max-age=[0-9]{6,} ]]; then
  echo "FAIL 404 response is cached for a long time: $not_cached"
  fail=1
else
  echo "ok   404 response is not long-cached (${not_cached:-no cache-control})"
fi

exit "$fail"
