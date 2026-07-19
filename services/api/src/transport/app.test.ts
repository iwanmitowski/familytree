import { describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { createApp } from './app';

const logger = pino({ enabled: false });

function appWith(ping: () => Promise<boolean>) {
  return createApp({ logger, ping });
}

describe('app', () => {
  it('GET /health returns only a status', async () => {
    const res = await appWith(async () => true).request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('echoes an inbound X-Request-Id', async () => {
    const res = await appWith(async () => true).request('/health', {
      headers: { 'X-Request-Id': 'corr-123' },
    });
    expect(res.headers.get('x-request-id')).toBe('corr-123');
  });

  it('generates a request id when none is provided', async () => {
    const res = await appWith(async () => true).request('/health');
    expect(res.headers.get('x-request-id')).toMatch(/[0-9a-f-]{36}/);
  });

  it('GET /ready returns 200 when the database answers', async () => {
    const res = await appWith(async () => true).request('/ready');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /ready returns 503 when the database is down', async () => {
    const res = await appWith(async () => false).request('/ready');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'unavailable' });
  });

  it('GET /ready returns 503 when the ping throws', async () => {
    const res = await appWith(async () => {
      throw new Error('boom');
    }).request('/ready');
    expect(res.status).toBe(503);
  });

  it('unknown routes return the uniform error shape', async () => {
    const res = await appWith(async () => true).request('/nope');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('not_found');
    expect(body.error.requestId).toBeTruthy();
  });
});
