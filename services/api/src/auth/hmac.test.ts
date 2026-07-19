import { describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../transport/app';
import { requireRole, type AuthStore } from './hmac';

const SECRET = 'middleware-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff';
const logger = pino({ enabled: false });

function memoryStore(): AuthStore {
  const nonces = new Set<string>();
  const idem = new Map<
    string,
    { request_hash: string; response_status: number | null; response_body: unknown }
  >();
  return {
    insertNonce: async (nonce) => {
      if (nonces.has(nonce)) return false;
      nonces.add(nonce);
      return true;
    },
    getIdempotency: async (key) => idem.get(key),
    claimIdempotency: async ({ key, request_hash }) => {
      if (idem.has(key)) return false;
      idem.set(key, { request_hash, response_status: null, response_body: null });
      return true;
    },
    saveIdempotencyResponse: async (key, status, body) => {
      const entry = idem.get(key);
      if (entry) {
        entry.response_status = status;
        entry.response_body = body;
      }
    },
  };
}

function makeApp(store: AuthStore = memoryStore()) {
  const app = createApp({
    logger,
    ping: async () => true,
    hmac: { serviceId: SERVICE_ID, secret: SECRET, store },
  });
  let executions = 0;
  app.get('/v1/internal/echo', (c) =>
    c.json({ actorId: c.get('actorId'), actorRole: c.get('actorRole') }),
  );
  app.post('/v1/internal/things', async (c) => {
    executions += 1;
    const body = await c.req.json<Record<string, unknown>>();
    return c.json({ got: body, execution: executions }, 201);
  });
  app.get('/v1/internal/admin-only', requireRole('admin'), (c) => c.json({ ok: true }));
  return { app, executionCount: () => executions };
}

interface SignedFetchOptions {
  method?: string;
  path?: string;
  body?: string;
  actorId?: string;
  actorRole?: 'admin' | 'public';
  idempotencyKey?: string;
  nonce?: string;
  timestamp?: string;
  headerOverrides?: Record<string, string>;
}

function signedRequestInit({
  method = 'GET',
  path = '/v1/internal/echo',
  body,
  actorId = 'admin@example.com',
  actorRole = 'admin',
  idempotencyKey,
  nonce,
  timestamp,
  headerOverrides = {},
}: SignedFetchOptions = {}): { url: string; init: RequestInit } {
  const signed = signRequest({
    secret: SECRET,
    serviceId: SERVICE_ID,
    method,
    pathWithQuery: path,
    rawBody: body ?? '',
    actorId,
    actorRole,
    idempotencyKey,
    nonce,
    timestamp,
  });
  return {
    url: `http://api.test${path}`,
    init: {
      method,
      headers: { ...signed.headers, 'Content-Type': 'application/json', ...headerOverrides },
      body,
    },
  };
}

describe('hmacAuth middleware', () => {
  it('accepts a valid request and exposes the signed actor', async () => {
    const { app } = makeApp();
    const { url, init } = signedRequestInit();
    const res = await app.request(url, init);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ actorId: 'admin@example.com', actorRole: 'admin' });
  });

  it('rejects a missing signature with a generic 401', async () => {
    const { app } = makeApp();
    const res = await app.request('http://api.test/v1/internal/echo');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.message).toBe('authentication failed');
  });

  it('rejects a bad signature', async () => {
    const { app } = makeApp();
    const { url, init } = signedRequestInit({
      headerOverrides: { 'X-Signature': 'f'.repeat(64) },
    });
    const res = await app.request(url, init);
    expect(res.status).toBe(401);
  });

  it('rejects an expired timestamp', async () => {
    const { app } = makeApp();
    const { url, init } = signedRequestInit({
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    expect((await app.request(url, init)).status).toBe(401);
  });

  it('rejects a future timestamp', async () => {
    const { app } = makeApp();
    const { url, init } = signedRequestInit({
      timestamp: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    expect((await app.request(url, init)).status).toBe(401);
  });

  it('rejects a reused nonce', async () => {
    const { app } = makeApp();
    const nonce = '99999999-9999-4999-8999-999999999999';
    const first = signedRequestInit({ nonce });
    expect((await app.request(first.url, first.init)).status).toBe(200);
    const second = signedRequestInit({ nonce });
    expect((await app.request(second.url, second.init)).status).toBe(401);
  });

  it('rejects a tampered actor role', async () => {
    const { app } = makeApp();
    const { url, init } = signedRequestInit({
      actorRole: 'public',
      actorId: 'public',
      headerOverrides: { 'X-Actor-Role': 'admin' },
    });
    expect((await app.request(url, init)).status).toBe(401);
  });

  it('replays the stored response for an idempotent retry without re-executing', async () => {
    const { app, executionCount } = makeApp();
    const key = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const body = '{"name":"Иван"}';

    const first = signedRequestInit({
      method: 'POST',
      path: '/v1/internal/things',
      body,
      idempotencyKey: key,
    });
    const firstRes = await app.request(first.url, first.init);
    expect(firstRes.status).toBe(201);
    const firstBody = await firstRes.json();
    expect(executionCount()).toBe(1);

    // Retry: same key + same body, fresh nonce/timestamp (as a real retry would be).
    const retry = signedRequestInit({
      method: 'POST',
      path: '/v1/internal/things',
      body,
      idempotencyKey: key,
    });
    const retryRes = await app.request(retry.url, retry.init);
    expect(retryRes.status).toBe(201);
    expect(retryRes.headers.get('idempotent-replay')).toBe('true');
    expect(await retryRes.json()).toEqual(firstBody);
    expect(executionCount()).toBe(1);
  });

  it('returns 409 for the same key with a different body', async () => {
    const { app, executionCount } = makeApp();
    const key = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    const first = signedRequestInit({
      method: 'POST',
      path: '/v1/internal/things',
      body: '{"v":1}',
      idempotencyKey: key,
    });
    expect((await app.request(first.url, first.init)).status).toBe(201);

    const conflicting = signedRequestInit({
      method: 'POST',
      path: '/v1/internal/things',
      body: '{"v":2}',
      idempotencyKey: key,
    });
    const res = await app.request(conflicting.url, conflicting.init);
    expect(res.status).toBe(409);
    const errBody = (await res.json()) as { error: { code: string } };
    expect(errBody.error.code).toBe('idempotency_conflict');
    expect(executionCount()).toBe(1);
  });

  it('requireRole blocks a public actor from admin endpoints', async () => {
    const { app } = makeApp();
    const denied = signedRequestInit({
      path: '/v1/internal/admin-only',
      actorId: 'public',
      actorRole: 'public',
    });
    expect((await app.request(denied.url, denied.init)).status).toBe(403);

    const allowed = signedRequestInit({ path: '/v1/internal/admin-only' });
    expect((await app.request(allowed.url, allowed.init)).status).toBe(200);
  });

  it('health and ready stay unauthenticated', async () => {
    const { app } = makeApp();
    expect((await app.request('http://api.test/health')).status).toBe(200);
    expect((await app.request('http://api.test/ready')).status).toBe(200);
  });
});
