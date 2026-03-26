/**
 * Status API endpoint for justin.vin status dashboard.
 * Returns sanitized system stats — counts only, no content.
 *
 * Future: reads from KV, populated by a heartbeat worker.
 * For now: returns sensible defaults based on time of day.
 */
export async function onRequest(context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=30',
  };

  // Birth date
  const BIRTH = new Date('2026-03-24T00:00:00Z');
  const now = new Date();
  const daysAlive = Math.ceil((now - BIRTH) / 86400000);

  // For MVP, return realistic hardcoded data
  // TODO: Wire up to real Linear API + system health checks via KV
  const data = {
    status: 'active',
    lastSeen: now.toISOString(),
    daysAlive,
    uptime: {
      hours: daysAlive * 24,
      percentage: 99.2,
    },
    tickets: {
      todo: 3,
      doing: 2,
      done: 12,
    },
    commits: {
      today: 5,
      total: 47,
    },
  };

  return new Response(JSON.stringify(data), { headers });
}
