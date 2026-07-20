import { adminProxy, readJsonBody } from '@/server/admin-proxy';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return adminProxy(req, {
    method: 'POST',
    path: `/v1/internal/submission-people/${encodeURIComponent(id)}/link-person`,
    body: await readJsonBody(req),
  });
}
