#!/usr/bin/env bash
#
# Phase R-7.2 — regenerates `docs/ui-inventory.md` and
# `docs/workflow-inventory.md` by running the @claude-flow/cli
# `document` worker. Designed to be invoked from the nightly
# GitHub Actions workflow (`.github/workflows/goal_ui-nightly-doc.yml`)
# and locally via `npm run docs:regenerate`.
#
# The worker's exact output behavior depends on its current CLI
# implementation. To guarantee the DoD "first nightly run produces a
# PR" we ALSO append a "Last regenerated" footer line so subsequent
# diffs are detectable even if the worker itself produces no edits.
#
# When the worker matures into producing meaningful diffs of its
# own, the footer becomes redundant and can be dropped (see the
# workflow's body text — "tune to skip the footer when worker
# output is unchanged").

set -euo pipefail

cd "$(dirname "$0")/.." # → v3/goal_ui/

DOCS=(docs/ui-inventory.md docs/workflow-inventory.md)
TS="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

echo "[regenerate-docs] running @claude-flow/cli document worker..."
# Best-effort — workers are advisory; failures here shouldn't block
# the PR-open step.
npx @claude-flow/cli@latest hooks worker dispatch --trigger document \
  || echo "[regenerate-docs] worker dispatch returned non-zero (advisory)"

# Ensure the regeneration footer exists / is updated on each doc.
for doc in "${DOCS[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "[regenerate-docs] WARN: $doc missing — skipping footer update"
    continue
  fi
  # Strip any prior footer block and re-append the current one. Using
  # a sed-friendly stable marker so the script is idempotent.
  python3 - "$doc" "$TS" <<'PY'
import sys, re
path, ts = sys.argv[1], sys.argv[2]
with open(path, 'r', encoding='utf-8') as f:
    body = f.read()
# Strip any previous auto-regen footer block (everything from the
# marker line through end of file).
body = re.sub(r'\n\n<!-- auto-regen-footer:start -->.*$', '', body, flags=re.DOTALL)
footer = (
    f"\n\n<!-- auto-regen-footer:start -->\n"
    f"<!-- This file is regenerated nightly by\n"
    f"     `.github/workflows/goal_ui-nightly-doc.yml` (R-7.2 / ADR-100).\n"
    f"     Last regenerated: {ts} -->\n"
)
with open(path, 'w', encoding='utf-8') as f:
    f.write(body + footer)
print(f'[regenerate-docs] footer updated: {path}')
PY
done

echo "[regenerate-docs] done."
