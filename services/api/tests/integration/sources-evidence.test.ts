import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { insertPerson } from '../../src/people/repo';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'sources-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-sources';
const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('sources & evidence', () => {
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

  function call(method: string, path: string, body?: unknown, role: 'admin' | 'public' = 'admin') {
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

  async function source(type = 'interview'): Promise<string> {
    const res = await call('POST', '/v1/internal/sources', { sourceType: type, title: 'Тест източник' });
    return ((await res.json()) as { id: string }).id;
  }

  it('one assertion can hold multiple sources with mixed stances', async () => {
    const person = await insertPerson(ctx.db, { living_status: 'unknown' });
    const s1 = await source('birth_certificate');
    const s2 = await source('interview');

    await call('POST', '/v1/internal/evidence', { sourceId: s1, subjectType: 'person', subjectId: person.id, assertion: 'birth', stance: 'supports' });
    await call('POST', '/v1/internal/evidence', { sourceId: s2, subjectType: 'person', subjectId: person.id, assertion: 'birth', stance: 'disputes' });

    const res = await call('GET', `/v1/internal/evidence?subjectType=person&subjectId=${person.id}`);
    const { items } = (await res.json()) as { items: { stance: string }[] };
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.stance).sort()).toEqual(['disputes', 'supports']);
  });

  it('a disputes evidence leaves the subject byte-identical', async () => {
    const person = await insertPerson(ctx.db, { living_status: 'deceased', notes: 'важна бележка' });
    const before = await ctx.db.selectFrom('people').selectAll().where('id', '=', person.id).executeTakeFirstOrThrow();
    const s = await source();
    await call('POST', '/v1/internal/evidence', { sourceId: s, subjectType: 'person', subjectId: person.id, assertion: 'living', stance: 'disputes' });
    const after = await ctx.db.selectFrom('people').selectAll().where('id', '=', person.id).executeTakeFirstOrThrow();
    expect(after).toEqual(before);
  });

  it('blocks deleting a source with evidence (409), allows an unused one (204)', async () => {
    const person = await insertPerson(ctx.db, { living_status: 'unknown' });
    const s = await source();
    await call('POST', '/v1/internal/evidence', { sourceId: s, subjectType: 'person', subjectId: person.id, assertion: 'x', stance: 'supports' });
    expect((await call('DELETE', `/v1/internal/sources/${s}`)).status).toBe(409);

    const unused = await source();
    expect((await call('DELETE', `/v1/internal/sources/${unused}`)).status).toBe(204);
  });

  it('rejects evidence about a non-existent subject (422)', async () => {
    const s = await source();
    const res = await call('POST', '/v1/internal/evidence', { sourceId: s, subjectType: 'person', subjectId: randomUUID(), assertion: 'x', stance: 'supports' });
    expect(res.status).toBe(422);
  });

  it('person aggregate reports a source count across name/event evidence', async () => {
    const person = await insertPerson(ctx.db, { living_status: 'unknown' });
    const s = await source();
    await call('POST', '/v1/internal/evidence', { sourceId: s, subjectType: 'person', subjectId: person.id, assertion: 'identity', stance: 'supports' });
    const res = await call('GET', `/v1/internal/people/${person.id}`);
    expect(((await res.json()) as { sourceCount: number }).sourceCount).toBeGreaterThanOrEqual(1);
  });

  it('rejects a public actor', async () => {
    expect((await call('POST', '/v1/internal/sources', { sourceType: 'other', title: 'x' }, 'public')).status).toBe(403);
  });
});
