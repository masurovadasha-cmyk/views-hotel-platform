#!/usr/bin/env bash
set -euo pipefail

test -f docs/STAGE4_RECOVERY_RUNBOOK.md
test -f docs/STAGE4_ACCEPTANCE.md
test -f scripts/stage4-remote-smoke.sh

bash -n scripts/stage4-remote-smoke.sh
bash -n scripts/stage4-local-e2e.sh

npx --yes wrangler@4 d1 export --help >/tmp/views-d1-export-help.txt
npx --yes wrangler@4 d1 time-travel info --help >/tmp/views-d1-tt-info-help.txt
npx --yes wrangler@4 d1 time-travel restore --help >/tmp/views-d1-tt-restore-help.txt

grep -q -- "--remote" /tmp/views-d1-export-help.txt
grep -q -- "--output" /tmp/views-d1-export-help.txt
grep -q -- "--timestamp" /tmp/views-d1-tt-info-help.txt
grep -q -- "--bookmark" /tmp/views-d1-tt-restore-help.txt

grep -q "d1 export views-staging" docs/STAGE4_RECOVERY_RUNBOOK.md
grep -q "d1 time-travel restore views-staging" docs/STAGE4_RECOVERY_RUNBOOK.md
grep -q "outbox-process" docs/STAGE4_RECOVERY_RUNBOOK.md
# Current public delivery is a static Worker, not a D1 migration deployment.
# Retain the historical recovery command/runbook validation above, but do not
# require a public preview workflow to mutate the legacy database.
grep -Eq '^main[[:space:]]*=[[:space:]]*"workers/review.ts"' wrangler.toml
grep -q 'pages_build_output_dir = "dist"' wrangler.pages.toml
grep -q 'deploy --config wrangler.toml' .github/workflows/cloudflare-staging.yml
if grep -Eq 'd1 (create|execute|migrations apply|time-travel restore)' .github/workflows/cloudflare-staging.yml; then
  echo "FAIL: static preview publication must not mutate legacy D1" >&2
  exit 1
fi

echo "PASS: legacy recovery tooling retained; static preview has no D1 mutation"
