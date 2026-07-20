import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { insertSubmission, insertSubmissionPerson } from '../../src/submissions/repo';
import { normalize } from '../../src/names';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'browser-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-browser';
const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('admin people browser API (task-26)', () => {
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

  async function createPerson(firstName: string, surname: string): Promise<string> {
    const res = await call('POST', '/v1/internal/people', { firstName, surname });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  it('aggregate carries a label and resolves relationship counterpart names', async () => {
    const tag = randomUUID().slice(0, 8);
    const parent = await createPerson('Баща', `Тест${tag}`);
    const child = await createPerson('Дете', `Тест${tag}`);

    const edge = await call('POST', '/v1/internal/relationships/parent-child', {
      parentId: parent,
      childId: child,
    });
    expect(edge.status).toBe(201);

    const agg = (await (await call('GET', `/v1/internal/people/${child}`)).json()) as {
      label: string;
      parents: { counterpartId: string; counterpartLabel: string }[];
      children: unknown[];
      mergeHistory: unknown[];
    };
    expect(agg.label).toBe(`Дете Тест${tag}`);
    expect(agg.parents).toHaveLength(1);
    expect(agg.parents[0]!.counterpartId).toBe(parent);
    expect(agg.parents[0]!.counterpartLabel).toBe(`Баща Тест${tag}`);
    expect(agg.mergeHistory).toEqual([]);
  });

  it('exposes per-person evidence across names and events, and years in search', async () => {
    const tag = randomUUID().slice(0, 8);
    const submission = await insertSubmission(ctx.db, { original_payload: '{}' });
    await ctx.db.updateTable('submissions').set({ status: 'in_review' }).where('id', '=', submission.id).execute();
    const sp = await insertSubmissionPerson(ctx.db, {
      submission_id: submission.id,
      local_key: 'SELF',
      first_name: 'Найден',
      surname: `Браузър${tag}`,
      normalized_name: normalize(`Найден Браузър${tag}`),
      living_status: 'deceased',
      birth_year_from: 1950,
      birth_year_to: 1950,
      death_year_from: 2010,
      death_year_to: 2010,
      birthplace_text: 'Пловдив',
    });

    const created = await call('POST', `/v1/internal/submission-people/${sp.id}/create-person`);
    expect(created.status).toBe(201);
    const personId = ((await created.json()) as { id: string }).id;

    const evidence = (await (await call('GET', `/v1/internal/people/${personId}/evidence`)).json()) as {
      items: { assertion: string; stance: string; sourceTitle: string }[];
    };
    const assertions = evidence.items.map((e) => e.assertion);
    expect(assertions).toContain('name');
    expect(assertions).toContain('birth');
    expect(evidence.items.every((e) => e.sourceTitle.length > 0)).toBe(true);

    const search = (await (await call('GET', `/v1/internal/people?q=${encodeURIComponent(`Браузър${tag}`)}`)).json()) as {
      items: { id: string; birthYear: number | null; deathYear: number | null }[];
    };
    const hit = search.items.find((p) => p.id === personId);
    expect(hit).toBeDefined();
    expect(hit!.birthYear).toBe(1950);
    expect(hit!.deathYear).toBe(2010);
  });
});
