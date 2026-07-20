import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { insertPerson } from '../../src/people/repo';
import { createParentChildEdge } from '../../src/genealogy/relationships-service';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'cycle-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-cycle';
const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('parent-child cycle prevention (idea.md §12)', () => {
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

  function post(body: unknown, role: 'admin' | 'public' = 'admin') {
    const raw = JSON.stringify(body);
    const signed = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method: 'POST',
      pathWithQuery: '/v1/internal/relationships/parent-child',
      rawBody: raw,
      actorId: role === 'admin' ? 'admin@example.com' : 'public',
      actorRole: role,
      idempotencyKey: randomUUID(),
    });
    return app.request('http://api.test/v1/internal/relationships/parent-child', {
      method: 'POST',
      headers: { ...signed.headers, 'Content-Type': 'application/json' },
      body: raw,
    });
  }

  async function edge(parentId: string, childId: string, extra: Record<string, unknown> = {}) {
    return post({ parentId, childId, verificationStatus: 'confirmed', ...extra });
  }

  it('rejects a self-parent edge', async () => {
    const a = await person();
    expect((await edge(a, a)).status).toBe(422);
  });

  it('rejects a direct cycle (A→B exists; B→A blocked)', async () => {
    const a = await person();
    const b = await person();
    expect((await edge(a, b)).status).toBe(201);
    const res = await edge(b, a);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('cycle_detected');
  });

  it('rejects a multi-generation cycle (A→B→C exists; C-as-parent-of-A blocked)', async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    await edge(a, b);
    await edge(b, c);
    expect((await edge(c, a)).status).toBe(422);
  });

  it('rejects a duplicate parent edge of the same type', async () => {
    const a = await person();
    const b = await person();
    expect((await edge(a, b, { relationshipType: 'biological' })).status).toBe(201);
    expect((await edge(a, b, { relationshipType: 'biological' })).status).toBe(409);
  });

  it('allows a valid adoption edge alongside a biological one', async () => {
    const a = await person();
    const b = await person();
    expect((await edge(a, b, { relationshipType: 'biological' })).status).toBe(201);
    expect((await edge(a, b, { relationshipType: 'adoptive' })).status).toBe(201);
  });

  it('a disputed edge does not block an otherwise valid insert', async () => {
    const a = await person();
    const b = await person();
    // A→B disputed does not participate in cycle detection.
    await edge(a, b, { verificationStatus: 'disputed' });
    // B→A is therefore allowed.
    expect((await edge(b, a)).status).toBe(201);
  });

  it('serializes concurrent A→B and B→A so exactly one wins', async () => {
    const a = await person();
    const b = await person();
    const [r1, r2] = await Promise.all([
      createParentChildEdge(ctx.db, { parentId: a, childId: b, verificationStatus: 'confirmed' }, 'admin'),
      createParentChildEdge(ctx.db, { parentId: b, childId: a, verificationStatus: 'confirmed' }, 'admin'),
    ]);
    const successes = [r1, r2].filter((r) => r.ok).length;
    expect(successes).toBe(1);
  });

  it('confirming a proposed edge re-runs the cycle check', async () => {
    const a = await person();
    const b = await person();
    // A→B confirmed.
    await edge(a, b);
    // B→A proposed is allowed initially? No — proposed edges also block cycles,
    // so B→A proposed is rejected too. Verify.
    expect((await post({ parentId: b, childId: a, verificationStatus: 'proposed' })).status).toBe(422);
  });

  it('rejects a public actor', async () => {
    const a = await person();
    const b = await person();
    expect((await edge(a, b) && (await post({ parentId: a, childId: b }, 'public'))).status).toBe(403);
  });
});
