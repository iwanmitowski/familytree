import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/env', () => ({
  serverEnv: () => ({
    IP_HASH_SECRET: 'test-ip-secret-0123456789abcdef',
    ORACLE_API_BASE_URL: 'https://api.test',
    SERVICE_ID: 's',
    SERVICE_HMAC_SECRET: 'x0123456789abcdef',
    TURNSTILE_SECRET_KEY: 'ts',
  }),
}));
vi.mock('@/server/turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/server/oracle/client', () => ({ oracleFetch: vi.fn() }));

import { POST } from './route';
import { oracleFetch } from '@/server/oracle/client';
import { verifyTurnstile } from '@/server/turnstile';
import { OracleError } from '@/server/oracle/errors';

const oracleFetchMock = vi.mocked(oracleFetch);
const verifyTurnstileMock = vi.mocked(verifyTurnstile);

const RAW_IP = '203.0.113.7';

function makeRequest(body: unknown): Request {
  return new Request('https://app.test/api/questionnaire/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `${RAW_IP}, 10.0.0.1` },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    payload: { payloadVersion: 1, people: [{ localKey: 'SELF' }], meta: { durationMs: 120000 } },
    turnstileToken: 'tok',
    idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ...overrides,
  };
}

beforeEach(() => {
  verifyTurnstileMock.mockResolvedValue(true);
  oracleFetchMock.mockResolvedValue({ data: { submissionId: 'sub-1' }, status: 201, requestId: 'r' });
});
afterEach(() => vi.clearAllMocks());

describe('POST /api/questionnaire/submit', () => {
  it('rejects an oversized body with 413 before parsing', async () => {
    const huge = 'a'.repeat(101 * 1024);
    const req = new Request('https://app.test/api/questionnaire/submit', {
      method: 'POST',
      body: JSON.stringify({ payload: { big: huge } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(oracleFetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 turnstile_failed when verification fails', async () => {
    verifyTurnstileMock.mockResolvedValue(false);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('turnstile_failed');
    expect(oracleFetchMock).not.toHaveBeenCalled();
  });

  it('forwards a hashed fingerprint and never the raw IP', async () => {
    await POST(makeRequest(validBody()));
    expect(oracleFetchMock).toHaveBeenCalledTimes(1);
    const [, opts] = oracleFetchMock.mock.calls[0]!;
    const body = opts.body as { clientFingerprint?: string; spamSignal?: string };
    expect(body.clientFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(opts)).not.toContain(RAW_IP);
    expect(opts.actor).toEqual({ id: 'public', role: 'public' });
  });

  it('flags a filled honeypot as spam', async () => {
    await POST(makeRequest(validBody({ honeypot: 'http://spam' })));
    const [, opts] = oracleFetchMock.mock.calls[0]!;
    expect((opts.body as { spamSignal?: string }).spamSignal).toBe('honeypot');
  });

  it('flags a too-fast submission as spam', async () => {
    await POST(
      makeRequest(validBody({ payload: { payloadVersion: 1, people: [], meta: { durationMs: 5000 } } })),
    );
    const [, opts] = oracleFetchMock.mock.calls[0]!;
    expect((opts.body as { spamSignal?: string }).spamSignal).toBe('too_fast');
  });

  it('returns 201 with the submission id on success', async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ submissionId: 'sub-1' });
  });

  it('passes through a 429 from the API', async () => {
    oracleFetchMock.mockRejectedValue(new OracleError(429, 'rate_limited', 'too many'));
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('86400');
  });

  it('does not leak internal details on an upstream error', async () => {
    oracleFetchMock.mockRejectedValue(new OracleError(500, 'db_exploded', 'internal db host x'));
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('internal db host x');
  });
});
