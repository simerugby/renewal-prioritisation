#!/usr/bin/env bash
# Fails if anything key-shaped could reach a browser or a commit.
#
# Wired into `npm run check`, so a future change that marks an env var
# NEXT_PUBLIC_*, imports the API route into a client component, or commits a
# real .env breaks the build instead of shipping quietly.
#
#   npm run secret-scan          # scans the repo and the local build
#   BASE_URL=https://… npm run secret-scan   # also scans the live bundle
set -uo pipefail

SECRET_RE='sk-[A-Za-z0-9_-]{20,}'
fails=0

ok()   { printf '  ok    %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; fails=$((fails + 1)); }

echo "Secret scan"

# 1. Nothing key-shaped in the tracked tree.
if git grep -qE "$SECRET_RE" -- . 2>/dev/null; then
  bad "a key-shaped string is committed"
else
  ok "no key-shaped string in tracked files"
fi

# 2. Nothing key-shaped anywhere in history. A key that was committed and then
#    removed is still a leaked key.
if git log --all -p 2>/dev/null | grep -qE "$SECRET_RE"; then
  bad "a key-shaped string appears in git history"
else
  ok "no key-shaped string in git history"
fi

# 3. Only .env.example may be tracked, and it must carry no value.
tracked_env=$(git ls-files | grep -E '^\.env' | grep -v '^\.env\.example$' || true)
if [ -n "$tracked_env" ]; then
  bad "an env file is tracked: $tracked_env"
else
  ok "no env file tracked except .env.example"
fi
if grep -qE '^OPENAI_API_KEY=.+' .env.example 2>/dev/null; then
  bad ".env.example contains a value for OPENAI_API_KEY"
else
  ok ".env.example ships an empty key"
fi

# 4. NEXT_PUBLIC_ is inlined into the browser bundle at build time. A secret must
#    never wear that prefix.
if grep -rqE 'NEXT_PUBLIC_[A-Z_]*(KEY|SECRET|TOKEN|PASSWORD)' app lib components eval scripts 2>/dev/null; then
  bad "a secret-looking value is exposed via a NEXT_PUBLIC_ variable"
else
  ok "no secret behind a NEXT_PUBLIC_ prefix"
fi

# 5. Only server-side code may read the key.
for f in $(grep -rl 'OPENAI_API_KEY' app lib components 2>/dev/null); do
  if head -3 "$f" | grep -q "'use client'"; then
    bad "$f is a client component and reads OPENAI_API_KEY"
  fi
done
ok "no client component reads the key"

# 6. The built client bundle must not contain the key or its name.
if [ -d .next/static ]; then
  if grep -rqE "$SECRET_RE|OPENAI_API_KEY" .next/static/ 2>/dev/null; then
    bad "the client bundle references the key"
  else
    ok "client bundle is clean"
  fi
else
  printf '  skip  no local build to scan (run npm run build first)\n'
fi

# 7. Optionally scan what the deployment actually serves.
if [ -n "${BASE_URL:-}" ]; then
  chunks=$(curl -s --max-time 25 "$BASE_URL/" | grep -oE '/_next/static/chunks/[A-Za-z0-9._-]+\.js' | sort -u)
  live_hits=0
  for c in $chunks; do
    if curl -s --max-time 25 "$BASE_URL$c" | grep -qE "$SECRET_RE|OPENAI_API_KEY"; then
      live_hits=$((live_hits + 1))
    fi
  done
  if [ "$live_hits" -gt 0 ]; then
    bad "$live_hits live chunk(s) reference the key"
  else
    ok "live bundle is clean"
  fi
fi

if [ "$fails" -eq 0 ]; then
  echo "No secret exposure found."
else
  echo "$fails secret-scan check(s) failed."
  exit 1
fi
