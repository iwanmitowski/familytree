import { adminProxy } from '@/server/admin-proxy';

/** Admin relationship path — full result (path + common ancestors), unredacted. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const personA = url.searchParams.get('personA');
  const personB = url.searchParams.get('personB');
  if (!personA || !personB) {
    return Response.json({ error: { code: 'missing_params', message: 'Необходими са двама души' } }, { status: 400 });
  }
  const params = new URLSearchParams({ personA, personB, view: 'admin' });
  return adminProxy(req, { path: `/v1/internal/relationship-path?${params.toString()}` });
}
