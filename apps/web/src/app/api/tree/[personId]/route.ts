import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { oracleFetch } from '@/server/oracle/client';
import { OracleError } from '@/server/oracle/errors';

/**
 * Public tree projection (idea.md §17). No session; always the public/redacted
 * view — living people are masked by the API.
 */
export async function GET(req: Request, ctx: { params: Promise<{ personId: string }> }): Promise<Response> {
  const { personId } = await ctx.params;
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  const url = new URL(req.url);
  const params = new URLSearchParams(url.search);
  params.set('view', 'public');

  try {
    const res = await oracleFetch(`/v1/internal/tree/${encodeURIComponent(personId)}?${params.toString()}`, {
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
