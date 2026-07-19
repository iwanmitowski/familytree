import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bodySha256 } from '@familytree/shared';
import { oracleFetch } from './client';
import { OracleError } from './errors';

const ENV = {
  ORACLE_API_BASE_URL: 'https://api.rod.mitovski.example',
  SERVICE_ID: 'familytree-bff-test',
  SERVICE_HMAC_SECRET: 'test-hmac-secret-0123456789abcdef',
  IP_HASH_SECRET: 'test-ip-hash-secret-0123456789ab',
};

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('oracleFetch', () => {
  it('signs the request with the full header set and returns parsed data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await oracleFetch<{ items: unknown[] }>('/v1/internal/submissions', {
      actor: { id: 'admin@example.com', role: 'admin' },
    });

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ items: [] });
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init.headers as Record<string, string>;
    for (const h of [
      'X-Service-Id',
      'X-Request-Timestamp',
      'X-Request-Nonce',
      'X-Body-SHA256',
      'X-Actor-Id',
      'X-Actor-Role',
      'X-Signature',
      'X-Request-Id',
    ]) {
      expect(headers[h]).toBeTruthy();
    }
    expect(headers['X-Actor-Role']).toBe('admin');
  });

  it('computes X-Body-SHA256 over the serialized body and sends the idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { submissionId: 'abc' }));
    vi.stubGlobal('fetch', fetchMock);

    const body = { firstName: 'Иван', surname: 'Митовски' };
    await oracleFetch('/v1/internal/submissions', {
      method: 'POST',
      body,
      actor: { id: 'public', role: 'public' },
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Body-SHA256']).toBe(bodySha256(JSON.stringify(body)));
    expect(headers['X-Idempotency-Key']).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(init.body).toBe(JSON.stringify(body));
  });

  it('forwards a provided correlation id and echoes it back', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const res = await oracleFetch('/v1/internal/people', {
      actor: { id: 'admin@example.com', role: 'admin' },
      requestId: 'corr-xyz',
    });
    expect(res.requestId).toBe('corr-xyz');
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init.headers as Record<string, string>)['X-Request-Id']).toBe('corr-xyz');
  });

  it('throws a normalized OracleError on a 4xx and does not retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(422, { error: { code: 'cycle_detected', message: 'no cycles' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      oracleFetch('/v1/internal/relationships/parent-child', {
        method: 'POST',
        body: {},
        actor: { id: 'admin@example.com', role: 'admin' },
        idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ).rejects.toMatchObject({ status: 422, code: 'cycle_detected' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries an idempotent GET on transport failure, then gives up with 502', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      oracleFetch('/v1/internal/people', { actor: { id: 'admin@example.com', role: 'admin' } }),
    ).rejects.toMatchObject({ status: 502, code: 'upstream_unreachable' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a POST on transport failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      oracleFetch('/v1/internal/submissions', {
        method: 'POST',
        body: {},
        actor: { id: 'public', role: 'public' },
      }),
    ).rejects.toBeInstanceOf(OracleError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
