import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertE2EAllowed, authorizeE2E, e2eCredentialsProvider } from './e2e-credentials';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('assertE2EAllowed (production hard guard)', () => {
  it('throws when VERCEL_ENV is production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(() => assertE2EAllowed()).toThrow(/production/);
    expect(() => e2eCredentialsProvider()).toThrow(/production/);
  });

  it('throws when APP_ENV is production', () => {
    vi.stubEnv('APP_ENV', 'production');
    expect(() => assertE2EAllowed()).toThrow(/production/);
  });

  it('is allowed outside production', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(() => assertE2EAllowed()).not.toThrow();
  });
});

describe('authorizeE2E', () => {
  it('accepts the configured credentials', () => {
    vi.stubEnv('E2E_ADMIN_EMAIL', 'e2e@example.com');
    vi.stubEnv('E2E_ADMIN_PASSWORD', 'secret-pass');
    expect(authorizeE2E({ email: 'e2e@example.com', password: 'secret-pass' })).toEqual({
      id: 'e2e-admin',
      email: 'e2e@example.com',
    });
  });

  it('rejects a wrong password', () => {
    vi.stubEnv('E2E_ADMIN_EMAIL', 'e2e@example.com');
    vi.stubEnv('E2E_ADMIN_PASSWORD', 'secret-pass');
    expect(authorizeE2E({ email: 'e2e@example.com', password: 'nope' })).toBeNull();
  });

  it('returns null when the env is not configured', () => {
    expect(authorizeE2E({ email: 'x@example.com', password: 'y' })).toBeNull();
  });
});
