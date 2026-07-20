import { adminProxy } from '@/server/admin-proxy';

export async function GET(req: Request): Promise<Response> {
  return adminProxy(req, { path: '/v1/internal/contact-leads' });
}
