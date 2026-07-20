import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, RouteDeps } from '../transport/app';
import { parseJson } from '../transport/validate';
import { insertAuditEntry } from '../audit/repo';
import { rateLimitHits, spamFlagged, turnstileRejections } from './registry';

const abuseSchema = z.object({
  kind: z.enum(['turnstile_rejected', 'honeypot', 'too_fast', 'rate_limited_bff']),
});

/**
 * The BFF reports client-side abuse events (idea.md §6) — no payload details.
 * The API counts them and writes a safe audit entry.
 */
export function registerMonitoringRoutes(app: Hono<AppEnv>, deps: RouteDeps): void {
  const { db } = deps;

  app.post('/v1/internal/abuse-events', async (c) => {
    const parsed = await parseJson(c, abuseSchema);
    if ('response' in parsed) return parsed.response;
    const { kind } = parsed.data;

    if (kind === 'turnstile_rejected') turnstileRejections.inc();
    else if (kind === 'rate_limited_bff') rateLimitHits.inc();
    else spamFlagged.inc();

    await insertAuditEntry(db, {
      actor_type: 'service',
      actor_id: c.get('actorId') ?? 'bff',
      action: 'abuse.reported',
      request_id: c.get('requestId'),
      metadata: JSON.stringify({ kind }),
    });
    return c.body(null, 204);
  });
}
