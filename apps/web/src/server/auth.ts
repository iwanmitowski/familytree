import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import { NextResponse } from 'next/server';
import { isAllowedAdmin } from './admin-allowlist';
import { e2eCredentialsProvider } from './e2e-credentials';

const ADMIN_PATH = /^\/admin(?!\/login)(\/|$)/;
const ADMIN_API_PATH = /^\/api\/admin(\/|$)/;

/**
 * Providers: Google in every environment; a guarded test-credentials provider
 * ONLY when E2E_TEST_MODE=1 (and never in production — the provider throws).
 */
function buildProviders(): NextAuthConfig['providers'] {
  const providers: NextAuthConfig['providers'] = [
    Google({
      clientId: process.env.OAUTH_CLIENT_ID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET,
    }),
  ];
  if (process.env.E2E_TEST_MODE === '1') providers.push(e2eCredentialsProvider());
  return providers;
}

/**
 * Auth.js (v5) configuration for admin authentication (idea.md §5). Google
 * OAuth restricted to an email allowlist; short-lived JWT sessions; the role is
 * stamped into the token/session. The Oracle API never sees this session — the
 * BFF translates it into a signed request (ADR 0001).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: buildProviders(),
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
    updateAge: 60 * 60, // refresh at most hourly
  },
  pages: { signIn: '/admin/login', error: '/admin/login' },
  callbacks: {
    // Reject any non-allowlisted account at sign-in.
    signIn({ user }) {
      return isAllowedAdmin(user.email, process.env.ADMIN_EMAIL_ALLOWLIST);
    },
    jwt({ token }) {
      if (isAllowedAdmin(token.email, process.env.ADMIN_EMAIL_ALLOWLIST)) {
        token.role = 'admin';
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.role = token.role === 'admin' ? 'admin' : undefined;
      return session;
    },
    // Runs in middleware to gate protected routes.
    authorized({ request, auth: session }) {
      const path = request.nextUrl.pathname;
      const isAdmin = session?.user?.role === 'admin';
      // Admin API: 401 JSON (never a redirect to an HTML login page).
      if (ADMIN_API_PATH.test(path)) {
        return isAdmin
          ? true
          : NextResponse.json(
              { error: { code: 'unauthorized', message: 'Необходим е администраторски достъп' } },
              { status: 401 },
            );
      }
      // Admin pages: false → Auth.js redirects to the sign-in page.
      if (ADMIN_PATH.test(path)) return isAdmin;
      return true;
    },
  },
});
