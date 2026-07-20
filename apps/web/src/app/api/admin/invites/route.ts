import { adminProxy, readJsonBody } from '@/server/admin-proxy';

export async function GET(req: Request): Promise<Response> {
  return adminProxy(req, { path: '/v1/internal/invites' });
}

export async function POST(req: Request): Promise<Response> {
  return adminProxy(req, {
    method: 'POST',
    path: '/v1/internal/invites',
    body: await readJsonBody(req),
    successStatus: 201,
  });
}
