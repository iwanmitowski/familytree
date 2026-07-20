import { adminProxy } from '@/server/admin-proxy';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return adminProxy(req, { path: `/v1/internal/submissions/${encodeURIComponent(id)}` });
}
