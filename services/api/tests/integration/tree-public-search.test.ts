import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'pubsearch-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-pubsearch';
const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('public tree search (task-31)', () => {
  let ctx: TestDb;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    ctx = createTestDb();
    await migrateToLatest(ctx.migrator);
    app = createApp({
      logger,
      db: ctx.db,
      ping: async () => true,
      hmac: { serviceId: SERVICE_ID, secret: SECRET, store: dbAuthStore(ctx.db) },
    });
  });

  afterAll(async () => {
    await ctx.destroy();
  });

  function call(method: string, path: string, body: unknown, role: 'admin' | 'public') {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const signed = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method,
      pathWithQuery: path,
      rawBody: raw,
      actorId: role === 'admin' ? 'admin@example.com' : 'public',
      actorRole: role,
      idempotencyKey: method === 'GET' ? undefined : randomUUID(),
    });
    return app.request(`http://api.test${path}`, {
      method,
      headers: { ...signed.headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : raw,
    });
  }

  async function createPerson(first: string, surname: string, livingStatus: string, privacyLevel: string): Promise<string> {
    const res = await call('POST', '/v1/internal/people', { firstName: first, surname, livingStatus, privacyLevel }, 'admin');
    return ((await res.json()) as { id: string }).id;
  }

  it('returns only publicly visible (deceased, family/public) people to a public actor', async () => {
    const tag = randomUUID().slice(0, 8);
    const surname = `Публичен${tag}`;
    const visible = await createPerson('Дядо', surname, 'deceased', 'public');
    const family = await createPerson('Баба', surname, 'deceased', 'family');
    const living = await createPerson('Внук', surname, 'living', 'public');
    const privateDead = await createPerson('Стар', surname, 'deceased', 'private');

    const res = await call('GET', `/v1/internal/people/public-search?q=${encodeURIComponent(surname)}`, undefined, 'public');
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { items: { id: string }[] }).items.map((i) => i.id);

    expect(ids).toContain(visible);
    expect(ids).toContain(family);
    expect(ids).not.toContain(living); // living never findable publicly
    expect(ids).not.toContain(privateDead); // private masked
  });

  it('requires a query of at least two characters', async () => {
    const res = await call('GET', '/v1/internal/people/public-search?q=a', undefined, 'public');
    expect(((await res.json()) as { items: unknown[] }).items).toHaveLength(0);
  });
});
