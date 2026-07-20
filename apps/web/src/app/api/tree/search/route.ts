import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { oracleFetch } from '@/server/oracle/client';
import { OracleError } from '@/server/oracle/errors';

/**
 * Public person search for the tree root picker. Only publicly visible people
 * (deceased, family/public) are returned by the API — living people are never
 * findable publicly (idea.md §14/§15).
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  const q = new URL(req.url).searchParams.get('q') ?? '';

  try {
    const res = await oracleFetch(`/v1/internal/people/public-search?q=${encodeURIComponent(q)}`, {
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
