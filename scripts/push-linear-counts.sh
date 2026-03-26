#!/bin/bash
# Updates ticket counts in status.json from Linear data
# Run locally (has Linear API access via Composio)
# Usage: TODO=7 DOING=4 DONE=34 ./scripts/push-linear-counts.sh

set -e

REPO_DIR="/tmp/status-dashboard"
STATUS_FILE="$REPO_DIR/public/status.json"

if [ ! -f "$STATUS_FILE" ]; then
  echo "Error: $STATUS_FILE not found"
  exit 1
fi

TODO="${TODO:-$(jq -r '.tickets.todo' "$STATUS_FILE")}"
DOING="${DOING:-$(jq -r '.tickets.doing' "$STATUS_FILE")}"
DONE="${DONE:-$(jq -r '.tickets.done' "$STATUS_FILE")}"

# Update just the ticket counts
jq --argjson todo "$TODO" --argjson doing "$DOING" --argjson done "$DONE" \
  '.tickets.todo = $todo | .tickets.doing = $doing | .tickets.done = $done | .lastSeen = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' \
  "$STATUS_FILE" > "${STATUS_FILE}.tmp" && mv "${STATUS_FILE}.tmp" "$STATUS_FILE"

echo "Updated ticket counts: todo=$TODO, doing=$DOING, done=$DONE"

cd "$REPO_DIR"
git add public/status.json
git diff --cached --quiet || (git commit -m "Update Linear ticket counts" && git push)
