import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { serverEnv } from '@/server/env';
import { clientFingerprint, extractClientIp } from '@/server/fingerprint';
import { verifyTurnstile } from '@/server/turnstile';
import { oracleFetch } from '@/server/oracle/client';
import { OracleError } from '@/server/oracle/errors';

const MAX_BODY_BYTES = 100 * 1024;
const MIN_DURATION_MS = 60_000;

interface SubmitBody {
  payload?: { meta?: { durationMs?: number } };
  turnstileToken?: string;
  inviteToken?: string;
  idempotencyKey?: string;
  honeypot?: string;
}

function jsonError(status: number, code: string, message: string, requestId: string, extraHeaders?: HeadersInit) {
  return NextResponse.json({ error: { code, message, requestId } }, { status, headers: extraHeaders });
}

/**
 * BFF entry point for a questionnaire submission (idea.md §6, §17): size guard,
 * Turnstile verification, anti-abuse flagging, client fingerprint, then a signed
 * request to the Oracle API. Internal backend details never reach the browser.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = req.headers.get('x-request-id') ?? randomUUID();

  // 1. Body size guard before parsing.
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return jsonError(413, 'payload_too_large', 'Заявката е твърде голяма.', requestId);
  }

  let body: SubmitBody;
  try {
    body = JSON.parse(raw) as SubmitBody;
  } catch {
    return jsonError(400, 'invalid_json', 'Невалидни данни.', requestId);
  }

  if (!body.payload || typeof body.payload !== 'object') {
    return jsonError(400, 'validation_error', 'Липсват данни за изпращане.', requestId);
  }

  const env = serverEnv();

  // 2. Turnstile (server-side).
  const ip = extractClientIp(req.headers);
  const turnstileOk = await verifyTurnstile(body.turnstileToken ?? '', ip);
  if (!turnstileOk) {
    return jsonError(400, 'turnstile_failed', 'Проверката за роботи не бе успешна.', requestId);
  }

  // 3. Anti-abuse: honeypot filled or filled too fast → flag as spam silently.
  const durationMs = body.payload.meta?.durationMs;
  let spamSignal: 'honeypot' | 'too_fast' | undefined;
  if (body.honeypot && body.honeypot.trim() !== '') spamSignal = 'honeypot';
  else if (typeof durationMs === 'number' && durationMs < MIN_DURATION_MS) spamSignal = 'too_fast';

  // 4. Client fingerprint (never the raw IP).
  const fingerprint = ip ? clientFingerprint(ip, env.IP_HASH_SECRET) : undefined;

  // 5. Idempotency key (validate UUID, else generate).
  const idempotencyKey =
    body.idempotencyKey && /^[0-9a-f-]{36}$/i.test(body.idempotencyKey)
      ? body.idempotencyKey
      : randomUUID();

  try {
    const res = await oracleFetch<{ submissionId: string }>('/v1/internal/submissions', {
      method: 'POST',
      actor: { id: 'public', role: 'public' },
      idempotencyKey,
      requestId,
      body: {
        payload: body.payload,
        clientFingerprint: fingerprint,
        inviteToken: body.inviteToken,
        spamSignal,
      },
    });
    return NextResponse.json({ submissionId: res.data.submissionId }, { status: 201 });
  } catch (err) {
    if (err instanceof OracleError) {
      if (err.status === 429) {
        return jsonError(429, 'rate_limited', 'Твърде много заявки. Опитайте по-късно.', requestId, {
          'Retry-After': '86400',
        });
      }
      // A spam-flagged submission still returns success to the client (do not
      // tip off bots); genuine upstream errors surface generically.
      return jsonError(502, 'submit_failed', 'Изпращането не бе успешно. Опитайте по-късно.', requestId);
    }
    return jsonError(500, 'internal_error', 'Възникна грешка.', requestId);
  }
}
