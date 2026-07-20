import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { oracleFetch } from '@/server/oracle/client';
import { OracleError } from '@/server/oracle/errors';

/**
 * Proxies invite validation so the form can show an early Bulgarian error for a
 * dead invite link (idea.md §17). Public actor.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  const token = new URL(req.url).searchParams.get('token');
  if (!token) {
    return NextResponse.json({ valid: false, reason: 'not_found' });
  }

  try {
    const res = await oracleFetch<{ valid: boolean; reason?: string }>(
      `/v1/internal/invites/validate?token=${encodeURIComponent(token)}`,
      { method: 'GET', actor: { id: 'public', role: 'public' }, requestId },
    );
    return NextResponse.json(res.data);
  } catch (err) {
    if (err instanceof OracleError) {
      return NextResponse.json({ valid: false, reason: 'not_found' });
    }
    return NextResponse.json({ error: { code: 'internal_error', requestId } }, { status: 500 });
  }
}
