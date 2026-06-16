#!/usr/bin/env bash
# SECURITY: the BUILD argument runs as a shell command (bash -c). Pass only
# operator-trusted commands; never forward untrusted/derived strings here.
# lh-ba.sh — generate BEFORE (target branch) + AFTER (current branch) Lighthouse
# reports for one URL in a single command. Restores your branch + rebuild after.
# Optional dep: lighthouse CLI (npm i -g lighthouse) + Chrome. Warns if absent.
#
#   lh-ba.sh <url> <out-dir> [audit] [base-branch] [build-cmd]
#     url         e.g. http://localhost:3000/ or your local site URL
#     out-dir     where before.html / after.html land (e.g. .mr-proof)
#     audit       lighthouse --only-audits value (default: unsized-images)
#     base-branch the "before" branch (default: main)
#     build-cmd   rebuild after each checkout (default: "npm run build")
#
# AFTER = your current branch (the fix). BEFORE = base-branch.
set -euo pipefail

URL="${1:-}"; OUT="${2:-.mr-proof}"; AUDIT="${3:-unsized-images}"; BASE="${4:-main}"; BUILD="${5:-npm run build}"
[ -n "$URL" ] || { echo "usage: lh-ba.sh <url> <out-dir> [audit] [base-branch] [build-cmd]" >&2; exit 2; }
command -v lighthouse >/dev/null 2>&1 || { echo "lh-ba.sh: lighthouse CLI not found (npm i -g lighthouse)" >&2; exit 3; }
command -v git >/dev/null 2>&1 || { echo "lh-ba.sh: git required" >&2; exit 3; }
[ -n "${CHROME_PATH:-}" ] || export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

mkdir -p "$OUT"
CUR="$(git rev-parse --abbrev-ref HEAD)"
[ "$CUR" != "HEAD" ] || { echo "lh-ba.sh: detached HEAD; checkout your fix branch first" >&2; exit 1; }
restore() { git checkout "$CUR" --quiet 2>/dev/null || true; bash -c "$BUILD" >/dev/null 2>&1 || true; }
trap restore EXIT

run_lh() { # <out.html>
  lighthouse "$URL" --only-audits="$AUDIT" --output=html --output-path="$1" \
    --chrome-flags="--headless --no-sandbox" --quiet >/dev/null 2>&1
}

echo "AFTER  ($CUR)…" >&2
bash -c "$BUILD" >/dev/null 2>&1 || true
run_lh "$OUT/after.html"

echo "BEFORE ($BASE)…" >&2
git checkout "$BASE" --quiet
bash -c "$BUILD" >/dev/null 2>&1 || true
run_lh "$OUT/before.html"
# trap restores CUR + rebuild

echo "wrote $OUT/before.html + $OUT/after.html"
echo "Next: open each, isolate the audit card with capture.mjs prep, screenshot both, then before-after.mjs."
