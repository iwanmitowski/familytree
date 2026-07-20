import { adminProxy } from '@/server/admin-proxy';

export async function GET(req: Request): Promise<Response> {
  const search = new URL(req.url).search;
  return adminProxy(req, { path: `/v1/internal/submissions${search}` });
}
