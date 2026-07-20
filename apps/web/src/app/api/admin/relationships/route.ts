import { adminProxy, readJsonBody } from '@/server/admin-proxy';

/** Create a parent-child edge (idea.md §12). */
export async function POST(req: Request): Promise<Response> {
  return adminProxy(req, {
    method: 'POST',
    path: '/v1/internal/relationships/parent-child',
    body: await readJsonBody(req),
    successStatus: 201,
  });
}
