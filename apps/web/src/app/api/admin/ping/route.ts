import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/server/require-admin';

/** Trivial protected route for verifying admin auth (idea.md §5). */
export async function GET(req: Request): Promise<Response> {
  const result = await requireAdminSession(req);
  if (!result.ok) return result.response;
  return NextResponse.json({ ok: true, email: result.actor.email });
}
