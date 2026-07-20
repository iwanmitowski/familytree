import 'server-only';
import { NextResponse } from 'next/server';
import { auth } from './auth';

export interface AdminActor {
  /** Admin email — passed as actorId in signed API requests (idea.md §5). */
  email: string;
}

export type RequireAdminResult = { ok: true; actor: AdminActor } | { ok: false; response: Response };

/**
 * Guards an admin BFF route handler. Returns the actor or a 401 response.
 * Also enforces the X-Admin-Request marker on mutating requests as CSRF
 * defense-in-depth (documented in docs/security.md).
 */
export async function requireAdminSession(req?: Request): Promise<RequireAdminResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin' || !session.user.email) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'unauthorized', message: 'Необходим е администраторски достъп' } },
        { status: 401 },
      ),
    };
  }

  if (req && req.method !== 'GET' && req.headers.get('x-admin-request') !== '1') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'forbidden', message: 'Липсва потвърждение на заявката' } },
        { status: 403 },
      ),
    };
  }

  return { ok: true, actor: { email: session.user.email } };
}
