#!/usr/bin/env bash
set -euo pipefail

STAGING_URL="${VIEWS_STAGING_CORE_URL:-}"
OUTPUT="${VIEWS_EXTERNAL_SYNTHETIC_OUTPUT:-/tmp/stage7.15-external-synthetic.json}"
REQUIRED_CONSECUTIVE="${VIEWS_SYNTHETIC_CONSECUTIVE_SUCCESSES:-2}"
MAX_ATTEMPTS="${VIEWS_SYNTHETIC_MAX_ATTEMPTS:-6}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[ -n "$STAGING_URL" ] || fail "VIEWS_STAGING_CORE_URL is required"

set +e
node - <<'NODE'
const raw=process.env.VIEWS_STAGING_CORE_URL||"";
let url;
try{url=new URL(raw)}catch{process.exit(2)}
if(
  url.protocol!=="https:"||
  url.username||
  url.password||
  url.pathname!=="/"||
  url.search||
  url.hash
)process.exit(3);
if(url.hostname.endsWith(".trycloudflare.com"))process.exit(4);
NODE
URL_STATUS=$?
set -e

case "$URL_STATUS" in
  0) ;;
  2) fail "VIEWS_STAGING_CORE_URL must be a valid URL" ;;
  3) fail "VIEWS_STAGING_CORE_URL must be an https origin with no path/query/credentials" ;;
  4) fail "external synthetic requires a persistent hostname, not trycloudflare.com" ;;
  *) fail "staging URL validation failed" ;;
esac

case "$REQUIRED_CONSECUTIVE" in
  ''|*[!0-9]*) fail "VIEWS_SYNTHETIC_CONSECUTIVE_SUCCESSES must be an integer" ;;
esac
case "$MAX_ATTEMPTS" in
  ''|*[!0-9]*) fail "VIEWS_SYNTHETIC_MAX_ATTEMPTS must be an integer" ;;
esac
[ "$REQUIRED_CONSECUTIVE" -ge 1 ] || fail "required consecutive successes must be >= 1"
[ "$MAX_ATTEMPTS" -ge "$REQUIRED_CONSECUTIVE" ] || fail "max attempts must cover required successes"
[ "$MAX_ATTEMPTS" -le 20 ] || fail "max attempts must be <= 20"

request_status() {
  local label="$1"
  local method="$2"
  local path="$3"
  local body="$4"

  if [ "$method" = "POST" ]; then
    curl --silent       --output "/tmp/${label}.body"       --write-out '%{http_code}'       --max-time 10       --request POST       --header 'content-type: application/json'       --data "$body"       "${STAGING_URL%/}$path" || true
  else
    curl --silent       --output "/tmp/${label}.body"       --write-out '%{http_code}'       --max-time 10       "${STAGING_URL%/}$path" || true
  fi
}

consecutive=0
HEALTH_STATUS=0
READINESS_STATUS=0
GUEST_STATUS=0
ATTEMPT_USED=0

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  ATTEMPT_USED="$attempt"
  HEALTH_STATUS="$(request_status health GET /health '')"
  READINESS_STATUS="$(request_status readiness GET /readiness '')"
  GUEST_STATUS="$(
    request_status guest-auth POST /v1/guest-auth/exchange '{"token":"fixture"}'
  )"

  if     [ "$HEALTH_STATUS" = "200" ] &&     [ "$READINESS_STATUS" = "200" ] &&     [ "$GUEST_STATUS" = "401" ]; then
    consecutive=$((consecutive+1))
    if [ "$consecutive" -ge "$REQUIRED_CONSECUTIVE" ]; then
      break
    fi
  else
    consecutive=0
  fi

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    sleep 5
  fi
done

RESULT="pass"
if [ "$consecutive" -lt "$REQUIRED_CONSECUTIVE" ]; then
  RESULT="fail"
fi

export RESULT HEALTH_STATUS READINESS_STATUS GUEST_STATUS ATTEMPT_USED
umask 077
node - "$OUTPUT" <<'NODE'
const fs=require("node:fs");
const output=process.argv[2];
const url=new URL(process.env.VIEWS_STAGING_CORE_URL);
const data={
  schemaVersion:1,
  stage:"7.15",
  result:process.env.RESULT,
  transport:"external_https_synthetic",
  hostname:url.hostname,
  checkedAt:new Date().toISOString(),
  attempts:Number(process.env.ATTEMPT_USED),
  healthStatus:Number(process.env.HEALTH_STATUS),
  readinessStatus:Number(process.env.READINESS_STATUS),
  guestAuthStatus:Number(process.env.GUEST_STATUS),
  expected:{
    healthStatus:200,
    readinessStatus:200,
    guestAuthStatus:401
  }
};
fs.writeFileSync(output,JSON.stringify(data)+"\n",{mode:0o600});
NODE

node -e '
  const fs=require("node:fs");
  const parsed=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  if(!["pass","fail"].includes(parsed.result))process.exit(1);
' "$OUTPUT"

cat "$OUTPUT"

if [ "$RESULT" != "pass" ]; then
  echo "External synthetic failed: health=$HEALTH_STATUS readiness=$READINESS_STATUS guestAuth=$GUEST_STATUS" >&2
  exit 1
fi
