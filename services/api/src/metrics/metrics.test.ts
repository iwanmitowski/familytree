import { describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { createApp } from '../transport/app';
import { hmacFailures, metricsText } from './registry';

const logger = pino({ enabled: false });

describe('metrics endpoint', () => {
  it('exposes Prometheus text with the business counters registered', async () => {
    const app = createApp({ logger, ping: async () => true });
    const res = await app.request('http://api.test/metrics');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('submissions_created_total');
    expect(text).toContain('hmac_failures_total');
    expect(text).toContain('http_requests_total');
    expect(text).toContain('rate_limit_hits_total');
  });

  it('counts an HTTP request by route/method/status', async () => {
    const app = createApp({ logger, ping: async () => true });
    await app.request('http://api.test/health');
    const text = await metricsText();
    expect(text).toMatch(/http_requests_total\{route="\/health",method="GET",status="200"\} [1-9]/);
  });

  it('increments hmac_failures on a rejected internal request', async () => {
    const before = (await hmacFailures.get()).values[0]?.value ?? 0;
    const app = createApp({
      logger,
      ping: async () => true,
      hmac: { serviceId: 's', secret: 'x'.repeat(20), store: memoryStore() },
    });
    await app.request('http://api.test/v1/internal/anything'); // unsigned → 401
    const after = (await hmacFailures.get()).values[0]?.value ?? 0;
    expect(after).toBeGreaterThan(before);
  });
});

function memoryStore() {
  return {
    insertNonce: async () => true,
    getIdempotency: async () => undefined,
    claimIdempotency: async () => true,
    saveIdempotencyResponse: async () => undefined,
  };
}
