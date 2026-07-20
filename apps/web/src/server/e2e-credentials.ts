import 'server-only';
import Credentials from 'next-auth/providers/credentials';

/**
 * HARD GUARD (idea.md §23, docs/security.md): the E2E credentials provider must
 * NEVER exist in a real production deployment. Registration throws if we detect
 * a production environment, so a stray `E2E_TEST_MODE=1` in prod fails closed.
 */
export function assertE2EAllowed(): void {
  if (process.env.VERCEL_ENV === 'production' || process.env.APP_ENV === 'production') {
    throw new Error('E2E_TEST_MODE must never be enabled in a production environment');
  }
}

/** Validates the test admin credentials against the env-configured pair. */
export function authorizeE2E(
  creds: Partial<Record<'email' | 'password', unknown>> | undefined,
): { id: string; email: string } | null {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) return null;
  if (creds?.email === email && creds?.password === password) {
    return { id: 'e2e-admin', email };
  }
  return null;
}

/** The gated Credentials provider; only wired when E2E_TEST_MODE=1. */
export function e2eCredentialsProvider() {
  assertE2EAllowed();
  return Credentials({
    name: 'E2E Test Login',
    credentials: { email: {}, password: {} },
    authorize: (creds) => authorizeE2E(creds),
  });
}
