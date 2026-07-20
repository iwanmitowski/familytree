import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { insertPerson } from '../../src/people/repo';
import { createUnion } from '../../src/genealogy/unions-service';
import { createParentChildEdge } from '../../src/genealogy/relationships-service';
import { getPersonAggregate } from '../../src/people/aggregate';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'unions-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-unions';
const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('family unions', () => {
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

  const person = () => insertPerson(ctx.db, { living_status: 'unknown' }).then((p) => p.id);

  function call(method: string, path: string, body?: unknown) {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const signed = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method,
      pathWithQuery: path,
      rawBody: raw,
      actorId: 'admin@example.com',
      actorRole: 'admin',
      idempotencyKey: method === 'GET' ? undefined : randomUUID(),
    });
    return app.request(`http://api.test${path}`, {
      method,
      headers: { ...signed.headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : raw,
    });
  }

  it('a person can belong to two sequential unions, both on the aggregate', async () => {
    const p = await person();
    const spouse1 = await person();
    const spouse2 = await person();
    const u1 = await createUnion(ctx.db, 'marriage', [p, spouse1], 'admin');
    const u2 = await createUnion(ctx.db, 'partnership', [p, spouse2], 'admin');
    expect(u1.ok && u2.ok).toBe(true);

    const agg = await getPersonAggregate(ctx.db, p);
    expect(agg.ok).toBe(true);
    if (agg.ok) {
      const unionIds = agg.person.unions.map((u) => (u as { id: string }).id);
      expect(unionIds).toHaveLength(2);
    }
  });

  it('rejects a duplicate partner and enforces the max of two', async () => {
    const [a, b, c] = [await person(), await person(), await person()];
    const created = await call('POST', '/v1/internal/unions', { unionType: 'marriage', partnerIds: [a, b] });
    expect(created.status).toBe(201);
    const union = (await created.json()) as { id: string };

    const dup = await call('POST', `/v1/internal/unions/${union.id}/partners`, { personId: a });
    expect(dup.status).toBe(409);

    const third = await call('POST', `/v1/internal/unions/${union.id}/partners`, { personId: c });
    expect(third.status).toBe(409); // already two partners
  });

  it('blocks deleting a union referenced by a child edge (409), allows deleting an unused one', async () => {
    const [a, b, child] = [await person(), await person(), await person()];
    const created = await call('POST', '/v1/internal/unions', { unionType: 'marriage', partnerIds: [a, b] });
    const union = (await created.json()) as { id: string };

    // Attach a child edge to this union.
    await createParentChildEdge(
      ctx.db,
      { parentId: a, childId: child, familyUnionId: union.id, verificationStatus: 'confirmed' },
      'admin',
    );

    const blocked = await call('DELETE', `/v1/internal/unions/${union.id}`);
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe('union_in_use');

    // An unused union deletes cleanly.
    const spare = await call('POST', '/v1/internal/unions', { unionType: 'unknown', partnerIds: [await person()] });
    const spareId = ((await spare.json()) as { id: string }).id;
    expect((await call('DELETE', `/v1/internal/unions/${spareId}`)).status).toBe(204);
  });

  it('GET returns partners and children', async () => {
    const [a, b, child] = [await person(), await person(), await person()];
    const created = await call('POST', '/v1/internal/unions', { unionType: 'marriage', partnerIds: [a, b] });
    const union = (await created.json()) as { id: string };
    await createParentChildEdge(
      ctx.db,
      { parentId: b, childId: child, familyUnionId: union.id, verificationStatus: 'confirmed' },
      'admin',
    );

    const res = await call('GET', `/v1/internal/unions/${union.id}`);
    const view = (await res.json()) as { partnerIds: string[]; childIds: string[] };
    expect(view.partnerIds.sort()).toEqual([a, b].sort());
    expect(view.childIds).toContain(child);
  });

  it('rejects a public actor', async () => {
    const a = await person();
    const signed = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method: 'POST',
      pathWithQuery: '/v1/internal/unions',
      rawBody: JSON.stringify({ unionType: 'marriage', partnerIds: [a] }),
      actorId: 'public',
      actorRole: 'public',
      idempotencyKey: randomUUID(),
    });
    const res = await app.request('http://api.test/v1/internal/unions', {
      method: 'POST',
      headers: { ...signed.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ unionType: 'marriage', partnerIds: [a] }),
    });
    expect(res.status).toBe(403);
  });
});
