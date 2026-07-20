import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({ auth: vi.fn() }));

import { requireAdminSession } from './require-admin';
import { auth } from './auth';

const authMock = vi.mocked(auth as unknown as () => Promise<unknown>);

function req(method: string, headers: Record<string, string> = {}): Request {
  return new Request('https://app.test/api/admin/x', { method, headers });
}

afterEach(() => vi.clearAllMocks());

describe('requireAdminSession', () => {
  it('rejects when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const result = await requireAdminSession(req('GET'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('rejects a session without the admin role', async () => {
    authMock.mockResolvedValue({ user: { email: 'x@e.com' } });
    const result = await requireAdminSession(req('GET'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('accepts an admin session and returns the actor email', async () => {
    authMock.mockResolvedValue({ user: { email: 'admin@e.com', role: 'admin' } });
    const result = await requireAdminSession(req('GET'));
    expect(result).toEqual({ ok: true, actor: { email: 'admin@e.com' } });
  });

  it('requires the X-Admin-Request marker on mutating requests', async () => {
    authMock.mockResolvedValue({ user: { email: 'admin@e.com', role: 'admin' } });
    const denied = await requireAdminSession(req('POST'));
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(403);

    const allowed = await requireAdminSession(req('POST', { 'x-admin-request': '1' }));
    expect(allowed.ok).toBe(true);
  });

  it('does not require the marker on GET', async () => {
    authMock.mockResolvedValue({ user: { email: 'admin@e.com', role: 'admin' } });
    expect((await requireAdminSession(req('GET'))).ok).toBe(true);
  });
});
