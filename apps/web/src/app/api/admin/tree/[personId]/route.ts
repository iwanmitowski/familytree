import { adminProxy } from '@/server/admin-proxy';

/** Admin (unredacted) tree projection. */
export async function GET(req: Request, ctx: { params: Promise<{ personId: string }> }): Promise<Response> {
  const { personId } = await ctx.params;
  const params = new URLSearchParams(new URL(req.url).search);
  params.set('view', 'admin');
  return adminProxy(req, {
    path: `/v1/internal/tree/${encodeURIComponent(personId)}?${params.toString()}`,
  });
}
