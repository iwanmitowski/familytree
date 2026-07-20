import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { insertPerson, insertPersonName } from '../../src/people/repo';
import { insertSubmission, insertSubmissionPerson } from '../../src/submissions/repo';
import { upsertMatchCandidate } from '../../src/matching/repo';
import { normalize } from '../../src/names';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'promotion-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-promotion';
const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('people promotion (create/link)', () => {
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

  async function seedInReviewPerson(overrides: Record<string, unknown> = {}): Promise<string> {
    const submission = await insertSubmission(ctx.db, { original_payload: '{}' });
    await ctx.db.updateTable('submissions').set({ status: 'in_review' }).where('id', '=', submission.id).execute();
    const sp = await insertSubmissionPerson(ctx.db, {
      submission_id: submission.id,
      local_key: 'SELF',
      first_name: 'Иван',
      surname: 'Митовски',
      normalized_name: normalize('Иван Митовски'),
      living_status: 'deceased',
      birth_year_from: 1950,
      birth_year_to: 1950,
      death_year_from: 2010,
      death_year_to: 2010,
      birthplace_text: 'София',
      ...overrides,
    });
    return sp.id;
  }

  it('create-person builds names, honest-precision events, source + evidence, and marks staging created', async () => {
    const spId = await seedInReviewPerson({ birth_surname: 'Петрова' });
    const res = await call('POST', `/v1/internal/submission-people/${spId}/create-person`);
    expect(res.status).toBe(201);
    const person = (await res.json()) as {
      id: string;
      privacyLevel: string;
      names: { name_type: string }[];
      events: { event_type: string; date_precision: string; year_from: number | null }[];
      sourceCount: number;
    };
    expect(person.privacyLevel).toBe('private'); // idea.md §15
    expect(person.names.some((n) => n.name_type === 'primary')).toBe(true);
    expect(person.names.some((n) => n.name_type === 'birth')).toBe(true); // birth surname differs

    const birth = person.events.find((e) => e.event_type === 'birth')!;
    expect(birth.date_precision).toBe('year');
    expect(birth.year_from).toBe(1950);
    expect(person.events.some((e) => e.event_type === 'death')).toBe(true);
    expect(person.sourceCount).toBeGreaterThanOrEqual(1);

    const sp = await ctx.db
      .selectFrom('submission_people')
      .selectAll()
      .where('id', '=', spId)
      .executeTakeFirstOrThrow();
    expect(sp.resolution_status).toBe('created');
    expect(sp.matched_person_id).toBe(person.id);
  });

  it('stores an approximate birth year as a range/approximate precision, never a fake date', async () => {
    const spId = await seedInReviewPerson({ birth_year_from: 1948, birth_year_to: 1952, birth_surname: null });
    const res = await call('POST', `/v1/internal/submission-people/${spId}/create-person`);
    const person = (await res.json()) as { events: { event_type: string; date_precision: string; date_from: string | null }[] };
    const birth = person.events.find((e) => e.event_type === 'birth')!;
    expect(birth.date_precision).toBe('range');
    expect(birth.date_from).toBeNull();
  });

  it('link-person marks linked, adds an alias for a new name, and accepts the match candidate', async () => {
    // Existing canonical person.
    const target = await insertPerson(ctx.db, { living_status: 'deceased' });
    await insertPersonName(ctx.db, {
      person_id: target.id,
      first_name: 'Иван',
      surname: 'Митовски',
      normalized_name: normalize('Иван Митовски'),
      name_type: 'primary',
      is_preferred: true,
    });
    const spId = await seedInReviewPerson({ first_name: 'Йоан', surname: 'Митовски' });
    await upsertMatchCandidate(ctx.db, {
      submission_person_id: spId,
      canonical_person_id: target.id,
      score: 80,
      reasons: [],
    });

    const res = await call('POST', `/v1/internal/submission-people/${spId}/link-person`, { personId: target.id });
    expect(res.status).toBe(200);

    const sp = await ctx.db.selectFrom('submission_people').selectAll().where('id', '=', spId).executeTakeFirstOrThrow();
    expect(sp.resolution_status).toBe('linked');
    expect(sp.matched_person_id).toBe(target.id);

    const alias = await ctx.db
      .selectFrom('person_names')
      .selectAll()
      .where('person_id', '=', target.id)
      .where('name_type', '=', 'alias')
      .execute();
    expect(alias.some((a) => a.normalized_name === normalize('Йоан Митовски'))).toBe(true);

    const candidate = await ctx.db
      .selectFrom('match_candidates')
      .selectAll()
      .where('submission_person_id', '=', spId)
      .executeTakeFirstOrThrow();
    expect(candidate.status).toBe('accepted');
  });

  it('deduplicates the birthplace across two promotions', async () => {
    const a = await seedInReviewPerson({ birth_surname: null });
    const b = await seedInReviewPerson({ birth_surname: null });
    const ra = (await (await call('POST', `/v1/internal/submission-people/${a}/create-person`)).json()) as { events: { event_type: string; place_id: string | null }[] };
    const rb = (await (await call('POST', `/v1/internal/submission-people/${b}/create-person`)).json()) as { events: { event_type: string; place_id: string | null }[] };
    const placeA = ra.events.find((e) => e.event_type === 'birth')?.place_id;
    const placeB = rb.events.find((e) => e.event_type === 'birth')?.place_id;
    expect(placeA).toBeTruthy();
    expect(placeA).toBe(placeB);
  });

  it('guards: submission not in review → 422', async () => {
    const submission = await insertSubmission(ctx.db, { original_payload: '{}' }); // pending
    const sp = await insertSubmissionPerson(ctx.db, { submission_id: submission.id, local_key: 'SELF', first_name: 'Х' });
    const res = await call('POST', `/v1/internal/submission-people/${sp.id}/create-person`);
    expect(res.status).toBe(422);
  });

  it('link-person rejects a merged/deleted target → 422', async () => {
    const merged = await insertPerson(ctx.db, { living_status: 'unknown' });
    const other = await insertPerson(ctx.db, { living_status: 'unknown' });
    await ctx.db.updateTable('people').set({ merged_into_person_id: other.id, deleted_at: new Date() }).where('id', '=', merged.id).execute();
    const spId = await seedInReviewPerson({ birth_surname: null });
    const res = await call('POST', `/v1/internal/submission-people/${spId}/link-person`, { personId: merged.id });
    expect(res.status).toBe(422);
  });

  it('GET a merged person returns 409 with the redirect target', async () => {
    const target = await insertPerson(ctx.db, { living_status: 'unknown' });
    const merged = await insertPerson(ctx.db, { living_status: 'unknown' });
    await ctx.db.updateTable('people').set({ merged_into_person_id: target.id }).where('id', '=', merged.id).execute();
    const res = await call('GET', `/v1/internal/people/${merged.id}`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { mergedIntoPersonId: string }).mergedIntoPersonId).toBe(target.id);
  });

  it('rejects a public actor from creating people', async () => {
    const spId = await seedInReviewPerson({ birth_surname: null });
    expect((await call('POST', `/v1/internal/submission-people/${spId}/create-person`, undefined, 'public')).status).toBe(403);
  });
});
