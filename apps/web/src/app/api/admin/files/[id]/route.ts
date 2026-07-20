import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { adminProxy } from '@/server/admin-proxy';
import { requireAdminSession } from '@/server/require-admin';
import { oracleFetch } from '@/server/oracle/client';
import { OracleError } from '@/server/oracle/errors';

/** Streams a file's bytes to the admin browser (never public). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const auth = await requireAdminSession(req);
  if (!auth.ok) return auth.response;
  const requestId = req.headers.get('x-request-id') ?? randomUUID();

  try {
    const res = await oracleFetch<{ contentBase64: string; contentType: string; originalFilename: string }>(
      `/v1/internal/files/${encodeURIComponent(id)}`,
      { actor: { id: auth.actor.email, role: 'admin' }, requestId },
    );
    const bytes = Buffer.from(res.data.contentBase64, 'base64');
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': res.data.contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(res.data.originalFilename)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    if (err instanceof OracleError) {
      return NextResponse.json({ error: { code: err.code, message: err.message, requestId } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: 'internal_error', message: 'Възникна грешка', requestId } }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return adminProxy(req, { method: 'DELETE', path: `/v1/internal/files/${encodeURIComponent(id)}` });
}
