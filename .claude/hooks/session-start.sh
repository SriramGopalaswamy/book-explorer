#!/bin/bash
#
# SessionStart hook — ensure node_modules/ exists before the agent loop
# starts so `npm run lint`, `npm run build`, `npm run test`, and `npm run dev`
# work without hitting the npm registry mid-session.
#
# Strategy (first match wins, all idempotent):
#   1. node_modules already healthy -> noop.
#   2. vendor/node_modules.tar.gz checked in -> extract.
#   3. npm ci --prefer-offline       -> works if ~/.npm/_cacache has the deps,
#                                       or on hosts with internet access.
#   4. npm install                   -> fallback for normal dev workstations.
#   5. fail with an actionable how-to-seed message.
#
# Design notes:
# - Synchronous: blocks the session until deps are ready. Predictable for
#   tests/linters; trade-off is slower session start.
# - Web sandbox reality: registry.npmjs.org and all mirrors are blocked by the
#   egress proxy (`x-deny-reason: host_not_allowed`). Strategies 3 and 4 will
#   fail on the web unless ~/.npm/_cacache is fully populated. The intended
#   path on the web is strategy 2 (checked-in vendor tarball). One-time seed:
#     1. On a workstation with internet: `npm ci`
#     2. `mkdir -p vendor && tar -czf vendor/node_modules.tar.gz node_modules`
#     3. (recommended) configure git-lfs for vendor/*.tar.gz
#     4. Commit and push.
#

set -euo pipefail

# Only run in the repo root.
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

if [[ ! -f package.json || ! -f package-lock.json ]]; then
  echo "[session-start] no package.json or lockfile in $(pwd) — skipping" >&2
  exit 0
fi

# ── Strategy 1: already healthy ──
# `node_modules/.package-lock.json` is npm's marker; if it matches the project
# lockfile by content hash we trust the install.
already_installed() {
  [[ -d node_modules && -f node_modules/.package-lock.json ]] || return 1
  # Compare lockfile checksums; if they match, deps are in sync.
  local proj_sum modu_sum
  proj_sum=$(sha256sum package-lock.json | cut -d' ' -f1)
  modu_sum=$(sha256sum node_modules/.package-lock.json 2>/dev/null | cut -d' ' -f1 || echo "")
  [[ "$proj_sum" == "$modu_sum" ]]
}

if already_installed; then
  echo "[session-start] node_modules/ already in sync with package-lock.json — skipping install" >&2
  exit 0
fi

# ── Strategy 2: vendored tarball ──
if [[ -f vendor/node_modules.tar.gz ]]; then
  echo "[session-start] extracting vendor/node_modules.tar.gz …" >&2
  rm -rf node_modules
  tar -xzf vendor/node_modules.tar.gz
  if already_installed; then
    echo "[session-start] node_modules/ restored from tarball" >&2
    exit 0
  fi
  echo "[session-start] tarball extracted but lockfile mismatches; falling through to npm install" >&2
fi

# ── Strategy 3: offline-preferred npm ci ──
echo "[session-start] running 'npm ci --prefer-offline' …" >&2
if npm ci --prefer-offline --no-audit --no-fund --progress=false 2>&1 | tail -50 >&2; then
  echo "[session-start] npm ci succeeded" >&2
  exit 0
fi

# ── Strategy 4: regular npm install ──
echo "[session-start] 'npm ci' failed; trying 'npm install' …" >&2
if npm install --no-audit --no-fund --progress=false 2>&1 | tail -50 >&2; then
  echo "[session-start] npm install succeeded" >&2
  exit 0
fi

# ── Strategy 5: actionable failure ──
cat >&2 <<'MSG'

[session-start] FAILED to install npm dependencies.

This sandbox blocks egress to registry.npmjs.org and all common mirrors
(`x-deny-reason: host_not_allowed`), so neither `npm ci` nor `npm install`
can fetch packages from this environment.

To unblock future sessions, run ONCE on a machine with internet access:

    git checkout <this-branch>
    npm ci
    mkdir -p vendor
    tar -czf vendor/node_modules.tar.gz node_modules
    # 100+ MB tarball — strongly recommended:
    git lfs install
    git lfs track 'vendor/*.tar.gz'
    git add .gitattributes vendor/node_modules.tar.gz
    git commit -m "chore: vendor node_modules tarball for sandbox sessions"
    git push

After the next session starts the hook will detect vendor/node_modules.tar.gz
and extract it instead of calling npm.

MSG
exit 1
