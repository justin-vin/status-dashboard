#!/bin/bash
# Fetches live data from local status-api plugin and pushes to repo
# Run via OpenClaw cron or launchd every 5 minutes

set -e

REPO_DIR="/tmp/status-dashboard"
OUTPUT="$REPO_DIR/public/status.json"
API_URL="http://127.0.0.1:18789/plugins/status-api/status"

# Fetch from live API
DATA=$(curl -sf "$API_URL" 2>/dev/null)
if [[ -z "$DATA" ]]; then
  echo "ERROR: Could not reach status API at $API_URL" >&2
  exit 1
fi

# Write to status.json
echo "$DATA" | python3 -m json.tool > "$OUTPUT"

echo "Synced status.json from live API:"
cat "$OUTPUT"

# Commit and push if changed
cd "$REPO_DIR"
git add public/status.json
git diff --cached --quiet || (git commit -m "Auto-update status data" && git push)
