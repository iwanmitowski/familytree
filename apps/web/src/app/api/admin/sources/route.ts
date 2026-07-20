import { adminProxy, readJsonBody } from '@/server/admin-proxy';

export async function GET(req: Request): Promise<Response> {
  const search = new URL(req.url).search;
  return adminProxy(req, { path: `/v1/internal/sources${search}` });
}

export async function POST(req: Request): Promise<Response> {
  return adminProxy(req, {
    method: 'POST',
    path: '/v1/internal/sources',
    body: await readJsonBody(req),
    successStatus: 201,
  });
}
