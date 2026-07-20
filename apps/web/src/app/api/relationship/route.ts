import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { oracleFetch } from '@/server/oracle/client';
import { OracleError } from '@/server/oracle/errors';

/** Public relationship lookup (idea.md §17) — only the label + confidence. */
export async function GET(req: Request): Promise<Response> {
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  const url = new URL(req.url);
  const personA = url.searchParams.get('personA');
  const personB = url.searchParams.get('personB');
  if (!personA || !personB) {
    return NextResponse.json({ error: { code: 'missing_params', requestId } }, { status: 400 });
  }
  const params = new URLSearchParams({ personA, personB, view: 'public' });

  try {
    const res = await oracleFetch(`/v1/internal/relationship-path?${params.toString()}`, {
      method: 'GET',
      actor: { id: 'public', role: 'public' },
      requestId,
    });
    return NextResponse.json(res.data);
  } catch (err) {
    if (err instanceof OracleError) {
      return NextResponse.json({ error: { code: err.code, message: err.message, requestId } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: 'internal_error', requestId } }, { status: 500 });
  }
}
