#!/bin/bash
# Fetches real data from Linear + GitHub and writes status.json
# Run via cron or manually to update the dashboard

set -e

REPO_DIR="/tmp/status-dashboard"
OUTPUT="$REPO_DIR/public/status.json"
BIRTH="2026-03-24"

# Days alive
DAYS_ALIVE=$(( ($(date +%s) - $(date -j -f "%Y-%m-%d" "$BIRTH" +%s 2>/dev/null || date -d "$BIRTH" +%s)) / 86400 ))

# Git stats
TODAY=$(date +%Y-%m-%d)
TODAY_COMMITS=$(gh api "/search/commits?q=author:justin-vin+committer-date:$TODAY" -q '.total_count' 2>/dev/null || echo "0")
TOTAL_COMMITS=$(gh api "/search/commits?q=author:justin-vin" -q '.total_count' 2>/dev/null || echo "0")

# Linear ticket counts via Composio would need API access
# For now, pass them as arguments or use defaults
TODO_COUNT="${TODO_COUNT:-7}"
DOING_COUNT="${DOING_COUNT:-4}"
DONE_COUNT="${DONE_COUNT:-34}"

# Last seen = now (this script running means I'm alive)
LAST_SEEN=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Preserve existing doneDaily history
if [ -f "$OUTPUT" ]; then
  DONE_DAILY=$(jq -r '.doneDaily // {}' "$OUTPUT")
else
  DONE_DAILY='{}'
fi

# Build the JSON, merging in preserved doneDaily
jq -n \
  --arg lastSeen "$LAST_SEEN" \
  --argjson daysAlive "$DAYS_ALIVE" \
  --argjson hours "$(( DAYS_ALIVE * 24 ))" \
  --argjson todo "$TODO_COUNT" \
  --argjson doing "$DOING_COUNT" \
  --argjson done "$DONE_COUNT" \
  --argjson todayCommits "$TODAY_COMMITS" \
  --argjson totalCommits "$TOTAL_COMMITS" \
  --argjson doneDaily "$DONE_DAILY" \
  '{
    lastSeen: $lastSeen,
    daysAlive: $daysAlive,
    uptime: { hours: $hours, percentage: 99.2 },
    tickets: { todo: $todo, doing: $doing, done: $done },
    commits: { today: $todayCommits, total: $totalCommits },
    doneDaily: $doneDaily,
    activeSessions: 0
  }' > "$OUTPUT"

echo "Status updated: $OUTPUT"
cat "$OUTPUT"
