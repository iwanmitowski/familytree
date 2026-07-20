import { adminProxy, readJsonBody } from '@/server/admin-proxy';

export async function POST(req: Request): Promise<Response> {
  return adminProxy(req, {
    method: 'POST',
    path: '/v1/internal/evidence',
    body: await readJsonBody(req),
    successStatus: 201,
  });
}
