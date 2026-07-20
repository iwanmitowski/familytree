import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { adminProxy } from '@/server/admin-proxy';
import { requireAdminSession } from '@/server/require-admin';
import { oracleFetch } from '@/server/oracle/client';
import { OracleError } from '@/server/oracle/errors';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** List a person's/source's files (metadata only). */
export async function GET(req: Request): Promise<Response> {
  const search = new URL(req.url).search;
  return adminProxy(req, { path: `/v1/internal/files${search}` });
}

/**
 * Accepts a multipart upload from the browser and forwards it to the API as a
 * signed JSON+base64 request (one trust boundary — ADR 0005). The raised body
 * limit lives on this route only.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await requireAdminSession(req);
  if (!auth.ok) return auth.response;
  const requestId = req.headers.get('x-request-id') ?? randomUUID();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: { code: 'invalid_form', message: 'Невалидна заявка', requestId } }, { status: 400 });
  }
  const file = form.get('file');
  const personId = (form.get('personId') as string) || undefined;
  const sourceId = (form.get('sourceId') as string) || undefined;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: { code: 'no_file', message: 'Липсва файл', requestId } }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: { code: 'file_too_large', message: 'Файлът е твърде голям (максимум 10MB)', requestId } }, { status: 413 });
  }

  const contentBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');

  try {
    const res = await oracleFetch('/v1/internal/files', {
      method: 'POST',
      actor: { id: auth.actor.email, role: 'admin' },
      idempotencyKey: randomUUID(),
      requestId,
      body: { filename: file.name, contentBase64, personId, sourceId },
    });
    return NextResponse.json(res.data, { status: res.status });
  } catch (err) {
    if (err instanceof OracleError) {
      return NextResponse.json({ error: { code: err.code, message: err.message, requestId } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: 'internal_error', message: 'Възникна грешка', requestId } }, { status: 500 });
  }
}
