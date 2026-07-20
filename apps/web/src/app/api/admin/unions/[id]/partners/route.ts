import { adminProxy, readJsonBody } from '@/server/admin-proxy';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return adminProxy(req, {
    method: 'POST',
    path: `/v1/internal/unions/${encodeURIComponent(id)}/partners`,
    body: await readJsonBody(req),
  });
}
