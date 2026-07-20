import { adminProxy } from '@/server/admin-proxy';

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; personId: string }> },
): Promise<Response> {
  const { id, personId } = await ctx.params;
  return adminProxy(req, {
    method: 'DELETE',
    path: `/v1/internal/unions/${encodeURIComponent(id)}/partners/${encodeURIComponent(personId)}`,
  });
}
