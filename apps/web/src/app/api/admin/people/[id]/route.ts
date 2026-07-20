import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { adminProxy, readJsonBody } from '@/server/admin-proxy';
import { requireAdminSession } from '@/server/require-admin';
import { oracleFetch } from '@/server/oracle/client';
import { OracleError } from '@/server/oracle/errors';

/**
 * A merged person yields a 409 with `mergedIntoPersonId` upstream. We surface
 * that to the browser as a 200 redirect envelope so the person page can show a
 * "Слят с…" banner linking to the active record, rather than a bare error.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const auth = await requireAdminSession(req);
  if (!auth.ok) return auth.response;
  const requestId = req.headers.get('x-request-id') ?? randomUUID();

  try {
    const res = await oracleFetch(`/v1/internal/people/${encodeURIComponent(id)}`, {
      actor: { id: auth.actor.email, role: 'admin' },
      requestId,
    });
    return NextResponse.json(res.data, { status: res.status });
  } catch (err) {
    if (err instanceof OracleError) {
      const merged = (err.data as { mergedIntoPersonId?: unknown } | undefined)?.mergedIntoPersonId;
      if (err.status === 409 && typeof merged === 'string') {
        return NextResponse.json({ merged: true, mergedIntoPersonId: merged }, { status: 200 });
      }
      return NextResponse.json(
        { error: { code: err.code, message: err.message, requestId } },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Възникна грешка', requestId } },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return adminProxy(req, {
    method: 'PATCH',
    path: `/v1/internal/people/${encodeURIComponent(id)}`,
    body: await readJsonBody(req),
  });
}
