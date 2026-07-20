import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAdminSession } from './require-admin';
import { oracleFetch } from './oracle/client';
import { OracleError } from './oracle/errors';

export interface AdminProxyOptions {
  method?: string;
  /** Oracle API path with query string. */
  path: string;
  body?: unknown;
  successStatus?: number;
}

/**
 * Runs an admin BFF route: validates the admin session (and the CSRF marker on
 * mutations), then issues a signed request to the Oracle API as the admin
 * actor. Upstream errors are normalized so no internal detail reaches the
 * browser.
 */
export async function adminProxy(req: Request, opts: AdminProxyOptions): Promise<Response> {
  const auth = await requireAdminSession(req);
  if (!auth.ok) return auth.response;

  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  const method = opts.method ?? 'GET';
  const isMutating = method !== 'GET';

  try {
    const res = await oracleFetch(opts.path, {
      method,
      body: opts.body,
      actor: { id: auth.actor.email, role: 'admin' },
      idempotencyKey: isMutating ? randomUUID() : undefined,
      requestId,
    });
    return NextResponse.json(res.data, { status: opts.successStatus ?? res.status });
  } catch (err) {
    if (err instanceof OracleError) {
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

/** Reads and forwards a JSON body for mutating admin routes. */
export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
