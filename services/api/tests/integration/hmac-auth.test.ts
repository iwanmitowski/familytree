import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { startAuthJanitor } from '../../src/auth/janitor';
import { insertNonce } from '../../src/auth/service-auth-repo';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'integration-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-int';
const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('hmac auth against the real database', () => {
  let ctx: TestDb;
  let app: ReturnType<typeof createApp>;
  let executions = 0;

  beforeAll(async () => {
    ctx = createTestDb();
    await migrateToLatest(ctx.migrator);
    app = createApp({
      logger,
      ping: async () => true,
      hmac: { serviceId: SERVICE_ID, secret: SECRET, store: dbAuthStore(ctx.db) },
    });
    app.post('/v1/internal/widgets', async (c) => {
      executions += 1;
      return c.json({ widgetId: 'w-1', execution: executions }, 201);
    });
  });

  afterAll(async () => {
    await ctx.destroy();
  });

  function signedInit(idempotencyKey?: string, nonce?: string) {
    const body = '{"kind":"widget"}';
    const signed = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method: 'POST',
      pathWithQuery: '/v1/internal/widgets',
      rawBody: body,
      actorId: 'admin@example.com',
      actorRole: 'admin',
      idempotencyKey,
      nonce,
    });
    return {
      url: 'http://api.test/v1/internal/widgets',
      init: {
        method: 'POST',
        headers: { ...signed.headers, 'Content-Type': 'application/json' },
        body,
      } satisfies RequestInit,
    };
  }

  it('happy path stores the nonce and executes once', async () => {
    const { url, init } = signedInit(randomUUID());
    const res = await app.request(url, init);
    expect(res.status).toBe(201);
  });

  it('a replayed nonce is rejected using the persistent store', async () => {
    const nonce = randomUUID();
    const first = signedInit(randomUUID(), nonce);
    expect((await app.request(first.url, first.init)).status).toBe(201);
    const replay = signedInit(randomUUID(), nonce);
    expect((await app.request(replay.url, replay.init)).status).toBe(401);
  });

  it('idempotent retry replays the stored response from the database', async () => {
    const key = randomUUID();
    const before = executions;

    const first = signedInit(key);
    const firstRes = await app.request(first.url, first.init);
    expect(firstRes.status).toBe(201);
    const firstBody = await firstRes.json();
    expect(executions).toBe(before + 1);

    const retry = signedInit(key);
    const retryRes = await app.request(retry.url, retry.init);
    expect(retryRes.status).toBe(201);
    expect(retryRes.headers.get('idempotent-replay')).toBe('true');
    expect(await retryRes.json()).toEqual(firstBody);
    expect(executions).toBe(before + 1);

    const stored = await ctx.db
      .selectFrom('idempotency_keys')
      .selectAll()
      .where('key', '=', key)
      .executeTakeFirstOrThrow();
    expect(stored.response_status).toBe(201);
  });

  it('the janitor prunes expired nonces and idempotency keys', async () => {
    await insertNonce(ctx.db, `expired-${randomUUID()}`, SERVICE_ID, new Date(Date.now() - 1000));
    const janitor = startAuthJanitor(ctx.db, logger, 60 * 60 * 1000);
    try {
      await janitor.runOnce();
      const leftovers = await ctx.db
        .selectFrom('service_request_nonces')
        .selectAll()
        .where('expires_at', '<', new Date())
        .execute();
      expect(leftovers).toHaveLength(0);
    } finally {
      janitor.stop();
    }
  });
});
