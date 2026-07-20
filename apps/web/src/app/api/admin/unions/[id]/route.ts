import { adminProxy, readJsonBody } from '@/server/admin-proxy';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return adminProxy(req, {
    method: 'PATCH',
    path: `/v1/internal/unions/${encodeURIComponent(id)}`,
    body: await readJsonBody(req),
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return adminProxy(req, {
    method: 'DELETE',
    path: `/v1/internal/unions/${encodeURIComponent(id)}`,
  });
}
