# Stage 4 Recovery & Rollback Runbook

Scope: staging only. Production \`main\` is not changed by this runbook.

## Recovery objectives

- Preserve the last known-good staging database before destructive recovery.
- Restore D1 only after the application revision and failure window are identified.
- Re-run schema readiness and the Stage 4 remote Golden Flow after any restore.
- Never use a D1 restore as the first response to an application-only defect.

## 1. Triage first

Record:

- failing Git SHA;
- last known-good Git SHA;
- staging origin;
- UTC timestamp when the fault began;
- \`/api/health\` response;
- \`/api/readiness\` response;
- Operations observability counts, especially outbox pending/retrying/dead-letter.

If only the frontend/API revision is bad, redeploy the last known-good staging SHA and do not restore D1.

## 2. Capture a pre-recovery database export

Before a destructive D1 restore, export the current remote database:

\`\`\`bash
npx wrangler@4 d1 export views-staging \
  --remote \
  --output=./views-staging-before-recovery.sql \
  --yes
\`\`\`

Keep the export in an approved secure operator location. Do not commit database exports to Git.

## 3. Find a D1 Time Travel recovery point

Current recovery point:

\`\`\`bash
npx wrangler@4 d1 time-travel info views-staging --json
\`\`\`

Recovery point for a known UTC timestamp:

\`\`\`bash
npx wrangler@4 d1 time-travel info views-staging \
  --timestamp="2026-10-05T05:00:00Z" \
  --json
\`\`\`

## 4. Restore only after explicit operator decision

Time Travel restore overwrites the database in place.

Using a bookmark:

\`\`\`bash
npx wrangler@4 d1 time-travel restore views-staging \
  --bookmark="<BOOKMARK>"
\`\`\`

Or using a verified timestamp:

\`\`\`bash
npx wrangler@4 d1 time-travel restore views-staging \
  --timestamp="2026-10-05T05:00:00Z"
\`\`\`

## 5. Post-restore verification

Run:

\`\`\`bash
curl -fsS "$STAGING_ORIGIN/api/health"
curl -fsS "$STAGING_ORIGIN/api/readiness"
STAGING_ORIGIN="$STAGING_ORIGIN" bash scripts/stage4-remote-smoke.sh
\`\`\`

Required outcome:

- health = ok;
- readiness = ready / database ok / schema ok;
- Stage 4 remote Golden Flow = PASS;
- outbox pending = 0 after processing;
- outbox retrying = 0;
- outbox dead-letter = 0;
- no tenant/property isolation regression.

## 6. Outbox recovery

Normal processing is available to authenticated management through:

\`\`\`
POST /api/outbox-process
{"limit":50}
\`\`\`

Events fail with bounded retries. After five failed attempts they move to dead-letter state.

A reviewed dead-letter event can be returned to the retry queue with:

\`\`\`
POST /api/outbox-retry
{"id":"<OUTBOX_EVENT_ID>"}
\`\`\`

Do not retry an event until its payload or consumer failure has been understood.

## 7. Rollback decision rules

Application rollback:
- bad UI/API revision;
- schema remains compatible;
- database state is valid.

Database restore:
- confirmed destructive/corrupting write;
- migration or workflow caused invalid persisted state;
- operator has captured an export and identified a recovery point.

Stop and investigate instead of restoring:
- external provider outage;
- credentials missing;
- temporary Cloudflare availability issue;
- outbox backlog without data corruption.
