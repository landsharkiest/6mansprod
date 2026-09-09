#!/bin/bash
# Build the frontend against the production API and push it to Amplify Hosting as a manual deployment.
# Usage (from repo root, Git Bash or Linux): bash infra/deploy-web.sh
# Requires: aws CLI configured, python3. Once the Amplify app is linked to GitHub this script is unnecessary.
set -euo pipefail
APP_ID="${AMPLIFY_APP_ID:-d3pgjll6yayekc}"
BRANCH="${AMPLIFY_BRANCH:-master}"
API_ORIGIN="${VITE_API_ORIGIN:-https://backend.6mansdle.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="${TMPDIR:-/tmp}/6mansdle-web-$$.zip"
# Pick an interpreter that actually runs: on Windows, `python3` may be the Store stub that only prints an error.
PY=""
for c in python3 python py; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'pass' >/dev/null 2>&1; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "no working python found"; exit 1; }

cd "$ROOT"
VITE_API_ORIGIN="$API_ORIGIN" npm run build -w apps/web

# Zip with forward-slash entry names; PowerShell's Compress-Archive writes backslashes, which Amplify mis-stores.
"$PY" - "$ROOT/apps/web/dist" "$ZIP" <<'PY'
import os, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in files:
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, src).replace(os.sep, "/"))
PY

dep=$(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --output json)
job=$(echo "$dep" | "$PY" -c 'import json,sys; print(json.load(sys.stdin)["jobId"])')
url=$(echo "$dep" | "$PY" -c 'import json,sys; print(json.load(sys.stdin)["zipUploadUrl"])')
curl -fsS -X PUT -H "Content-Type: application/zip" --upload-file "$ZIP" "$url" >/dev/null
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$job" --query 'jobSummary.status' --output text
for _ in $(seq 1 40); do
  st=$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$job" --query 'job.summary.status' --output text)
  case "$st" in SUCCEED) echo "deployed job $job"; rm -f "$ZIP"; exit 0;; FAILED|CANCELLED) echo "deploy $st"; exit 1;; esac
  sleep 5
done
echo "timed out waiting for job $job"; exit 1
