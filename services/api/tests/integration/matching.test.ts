import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { insertPerson, insertPersonEvent, insertPersonName } from '../../src/people/repo';
import { insertSubmission, insertSubmissionPerson } from '../../src/submissions/repo';
import { setMatchCandidateStatus, listMatchCandidates } from '../../src/matching/repo';
import { normalize } from '../../src/names';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'matching-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-matching';
const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('find-matches endpoint', () => {
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

  async function seedPerson(first: string, surname: string, birthYear: number): Promise<string> {
    const person = await insertPerson(ctx.db, { living_status: 'deceased' });
    await insertPersonName(ctx.db, {
      person_id: person.id,
      first_name: first,
      surname,
      normalized_name: normalize(`${first} ${surname}`),
      name_type: 'primary',
      is_preferred: true,
    });
    await insertPersonEvent(ctx.db, {
      person_id: person.id,
      event_type: 'birth',
      year_from: birthYear,
      year_to: birthYear,
      date_precision: 'year',
    });
    return person.id;
  }

  async function seedSubmissionPerson(first: string, surname: string, year: number): Promise<string> {
    const submission = await insertSubmission(ctx.db, { original_payload: '{}' });
    const sp = await insertSubmissionPerson(ctx.db, {
      submission_id: submission.id,
      local_key: 'SELF',
      first_name: first,
      surname,
      birth_year_from: year,
      birth_year_to: year,
      normalized_name: normalize(`${first} ${surname}`),
    });
    return sp.id;
  }

  function findMatches(id: string, role: 'admin' | 'public' = 'admin') {
    const signed = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method: 'POST',
      pathWithQuery: `/v1/internal/submission-people/${id}/find-matches`,
      rawBody: '',
      actorId: role === 'admin' ? 'admin@example.com' : 'public',
      actorRole: role,
      idempotencyKey: randomUUID(),
    });
    return app.request(`http://api.test/v1/internal/submission-people/${id}/find-matches`, {
      method: 'POST',
      headers: { ...signed.headers, 'Content-Type': 'application/json' },
    });
  }

  it('ranks a matching person high with Bulgarian reasons and stores candidates without linking', async () => {
    const marker = randomUUID().slice(0, 6);
    const match = await seedPerson(`Иван${marker}`, 'Митовски', 1950);
    await seedPerson(`Георги${marker}`, 'Друг', 1899); // unrelated
    const sp = await seedSubmissionPerson(`Иван${marker}`, 'Митовски', 1950);

    const res = await findMatches(sp);
    expect(res.status).toBe(200);
    const { candidates } = (await res.json()) as {
      candidates: { canonicalPersonId: string; score: number; reasons: { description: string }[]; status: string }[];
    };
    const top = candidates.find((c) => c.canonicalPersonId === match);
    expect(top).toBeDefined();
    expect(top!.score).toBeGreaterThanOrEqual(45);
    expect(top!.reasons.some((r) => r.description === 'Пълно съвпадение на името')).toBe(true);
    expect(top!.status).toBe('pending');
    expect(candidates.some((c) => c.score < 30)).toBe(false);

    // No auto-link: the submission person's matched_person_id stays null.
    const spRow = await ctx.db
      .selectFrom('submission_people')
      .selectAll()
      .where('id', '=', sp)
      .executeTakeFirstOrThrow();
    expect(spRow.matched_person_id).toBeNull();
    expect(spRow.resolution_status).toBe('pending');
  });

  it('re-running refreshes score/reasons without resetting a reviewed candidate', async () => {
    const marker = randomUUID().slice(0, 6);
    const person = await seedPerson(`Мария${marker}`, 'Иванова', 1970);
    const sp = await seedSubmissionPerson(`Мария${marker}`, 'Иванова', 1970);

    await findMatches(sp);
    const candidate = (await listMatchCandidates(ctx.db, sp))[0]!;
    await setMatchCandidateStatus(ctx.db, candidate.id, 'accepted', 'admin@example.com');

    // Second run must not duplicate the row or reset the accepted status.
    await findMatches(sp);
    const after = await listMatchCandidates(ctx.db, sp);
    const same = after.filter((c) => c.canonical_person_id === person);
    expect(same).toHaveLength(1);
    expect(same[0]!.status).toBe('accepted');
    expect(same[0]!.reviewed_by).toBe('admin@example.com');
  });

  it('returns 404 for an unknown submission person', async () => {
    expect((await findMatches(randomUUID())).status).toBe(404);
  });

  it('rejects a public actor', async () => {
    const sp = await seedSubmissionPerson('Тест', 'Тестов', 1960);
    expect((await findMatches(sp, 'public')).status).toBe(403);
  });
});
