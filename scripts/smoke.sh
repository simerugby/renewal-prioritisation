#!/usr/bin/env bash
# End-to-end smoke test against a running server.
#
#   npm run build && npm start &
#   npm run smoke                        # defaults to http://localhost:3000
#   BASE_URL=https://... npm run smoke   # or against the deployment
#
# Exists because two of the defects found while building this were invisible to
# unit tests and to the type checker: an unknown customer id returned the right
# page under an HTTP 200, and the AI endpoint's failure path had never been
# exercised without a key. Both are asserted below.
set -uo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
fails=0

check() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  ok    %-46s %s\n' "$desc" "$actual"
  else
    printf '  FAIL  %-46s expected %s, got %s\n' "$desc" "$expected" "$actual"
    fails=$((fails + 1))
  fi
}

status() { curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$1"; }
body() { curl -s --max-time 25 "$1"; }

echo "Smoke testing $BASE"

check "portfolio responds"            200 "$(status "$BASE/")"
check "method page responds"          200 "$(status "$BASE/method")"
check "known account responds"        200 "$(status "$BASE/customer/CUST-1001")"
check "unknown account is a real 404" 404 "$(status "$BASE/customer/NOPE-9999")"
check "unmatched route is a 404"      404 "$(status "$BASE/no-such-page")"

# Content, not just status: a 200 rendering an empty shell is worse than a 500.
#
# Uses bash pattern matching rather than `echo … | grep -q`. Under `pipefail`,
# grep -q closes the pipe on its first match, echo takes SIGPIPE, and the
# pipeline reports 141 — so a *passing* assertion read as a failure. The first
# version of this file had that bug and blamed the app for it.
contains() { case "$1" in *"$2"*) return 0 ;; *) return 1 ;; esac; }

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if contains "$haystack" "$needle"; then
    printf '  ok    %-46s\n' "$desc"
  else
    printf '  FAIL  %-46s missing %s\n' "$desc" "$needle"
    fails=$((fails + 1))
  fi
}

home=$(body "$BASE/")
assert_contains "portfolio lists ranked accounts" "$home" "Northstar"
assert_contains "portfolio totals the book"       "$home" "4,431,000"

detail=$(body "$BASE/customer/CUST-1025")
assert_contains "account page shows its evidence" "$detail" "Evidence behind the score"
assert_contains "account page shows the raw note" "$detail" "moves roles on 1 August"

# The AI endpoint must answer usefully with or without a key.
second=$(curl -s --max-time 30 -X POST "$BASE/api/second-read" \
  -H 'Content-Type: application/json' -d '{"customerId":"CUST-1025"}')
assert_contains "second read returns a result"  "$second" '"findings"'
if contains "$second" '"source":"llm"'; then
  printf '  note  %-46s\n' "second read came from the model (key configured)"
else
  printf '  note  %-46s\n' "second read used the fallback or the committed batch"
fi

check "second read rejects an unknown account"  404 \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 -X POST "$BASE/api/second-read" \
     -H 'Content-Type: application/json' -d '{"customerId":"NOPE"}')"
check "second read rejects a malformed body"    400 \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 -X POST "$BASE/api/second-read" \
     -H 'Content-Type: application/json' -d 'not json')"

if [ "$fails" -eq 0 ]; then
  echo "All smoke checks passed."
else
  echo "$fails smoke check(s) failed."
  exit 1
fi
