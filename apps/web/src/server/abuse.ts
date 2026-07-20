import 'server-only';
import { oracleFetch } from './oracle/client';

/**
 * Fire-and-forget report of a client-side abuse event to the API (idea.md §6).
 * Never throws — reporting failure must not affect the user's request.
 */
export function reportAbuse(
  kind: 'turnstile_rejected' | 'honeypot' | 'too_fast' | 'rate_limited_bff',
  requestId: string,
): void {
  void oracleFetch('/v1/internal/abuse-events', {
    method: 'POST',
    actor: { id: 'public', role: 'public' },
    body: { kind },
    requestId,
  }).catch(() => undefined);
}
