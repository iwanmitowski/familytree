// Next.js 16 renamed the "middleware" convention to "proxy". Auth.js runs its
// `authorized` callback here to gate /admin and /api/admin (idea.md §5);
// /admin/login is intentionally excluded from the guard.
export { auth as proxy } from '@/server/auth';

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
