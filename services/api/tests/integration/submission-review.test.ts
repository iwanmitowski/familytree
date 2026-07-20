import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { insertSubmission, insertSubmissionPerson, insertSubmissionRelationship } from '../../src/submissions/repo';
import { normalize } from '../../src/names';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'review-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-review';
const logger = pino({ enabled: false });

interface Suggestion {
  kind: 'parent_child' | 'union' | 'sibling_hint';
  viaLocalKeys: [string, string];
  a: { localKey: string; personId: string | null; label: string };
  b: { localKey: string; personId: string | null; label: string };
  status: 'ready' | 'missing_person' | 'already_exists';
  missingLocalKeys: string[];
}

describe.skipIf(!testDatabaseUrl())('submission review workspace (task-27)', () => {
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

  async function seedSubmission(tag: string): Promise<{ submissionId: string; sp: Record<string, string> }> {
    const submission = await insertSubmission(ctx.db, { original_payload: '{}' });
    await ctx.db.updateTable('submissions').set({ status: 'in_review' }).where('id', '=', submission.id).execute();

    const sp: Record<string, string> = {};
    const people: [string, string, string][] = [
      ['SELF', 'Иван', `Тест${tag}`],
      ['FATHER', 'Баща', `Тест${tag}`],
      ['MOTHER', 'Майка', `Тест${tag}`],
      ['SIBLING_1', 'Брат', `Тест${tag}`],
      ['PARTNER_1', 'Съпруга', `Тест${tag}`],
    ];
    for (const [key, first, surname] of people) {
      const row = await insertSubmissionPerson(ctx.db, {
        submission_id: submission.id,
        local_key: key,
        first_name: first,
        surname,
        normalized_name: normalize(`${first} ${surname}`),
        living_status: 'unknown',
        birth_year_from: 1950,
        birth_year_to: 1950,
      });
      sp[key] = row.id;
    }
    const rels: [string, string, 'parent' | 'sibling' | 'partner'][] = [
      ['SELF', 'FATHER', 'parent'],
      ['SELF', 'MOTHER', 'parent'],
      ['SELF', 'SIBLING_1', 'sibling'],
      ['SELF', 'PARTNER_1', 'partner'],
    ];
    for (const [from, to, type] of rels) {
      await insertSubmissionRelationship(ctx.db, {
        submission_id: submission.id,
        from_local_key: from,
        to_local_key: to,
        relationship_type: type,
      });
    }
    return { submissionId: submission.id, sp };
  }

  it('maps local keys to canonical edge suggestions, guards completion, and confirms edges', async () => {
    const tag = randomUUID().slice(0, 8);
    const { submissionId, sp } = await seedSubmission(tag);

    // Resolve SELF and FATHER to canonical people; leave the rest pending.
    const selfId = ((await (await call('POST', `/v1/internal/submission-people/${sp.SELF}/create-person`)).json()) as { id: string }).id;
    const fatherId = ((await (await call('POST', `/v1/internal/submission-people/${sp.FATHER}/create-person`)).json()) as { id: string }).id;

    // --- Suggested relationships ---
    const suggestions = ((await (await call('GET', `/v1/internal/submissions/${submissionId}/suggested-relationships`)).json()) as { items: Suggestion[] }).items;
    const byVia = (from: string, to: string) => suggestions.find((s) => s.viaLocalKeys[0] === from && s.viaLocalKeys[1] === to)!;

    const father = byVia('SELF', 'FATHER');
    expect(father.kind).toBe('parent_child');
    expect(father.a.localKey).toBe('FATHER'); // parent
    expect(father.a.personId).toBe(fatherId);
    expect(father.b.localKey).toBe('SELF'); // child
    expect(father.b.personId).toBe(selfId);
    expect(father.status).toBe('ready');

    expect(byVia('SELF', 'MOTHER').status).toBe('missing_person');
    expect(byVia('SELF', 'MOTHER').missingLocalKeys).toContain('MOTHER');
    expect(byVia('SELF', 'SIBLING_1').kind).toBe('sibling_hint');
    expect(byVia('SELF', 'PARTNER_1').kind).toBe('union');
    expect(byVia('SELF', 'PARTNER_1').status).toBe('missing_person');

    // --- Completion guard: still-pending people block it ---
    const blocked = await call('POST', `/v1/internal/submissions/${submissionId}/complete`);
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe('unresolved_people');

    // --- Confirm SELF—FATHER → confirmed edge + questionnaire evidence ---
    const confirmed = await call('POST', `/v1/internal/submissions/${submissionId}/confirm-relationship`, {
      kind: 'parent_child',
      parentPersonId: fatherId,
      childPersonId: selfId,
      relationshipType: 'biological',
    });
    expect(confirmed.status).toBe(201);

    const edge = await ctx.db
      .selectFrom('parent_child_relationships')
      .selectAll()
      .where('parent_id', '=', fatherId)
      .where('child_id', '=', selfId)
      .executeTakeFirstOrThrow();
    expect(edge.verification_status).toBe('confirmed');
    const evidence = await ctx.db
      .selectFrom('evidence')
      .selectAll()
      .where('subject_type', '=', 'parent_child_relationship')
      .where('subject_id', '=', edge.id)
      .execute();
    expect(evidence).toHaveLength(1);

    // The suggestion now reports already_exists.
    const after = ((await (await call('GET', `/v1/internal/submissions/${submissionId}/suggested-relationships`)).json()) as { items: Suggestion[] }).items;
    expect(after.find((s) => s.viaLocalKeys[1] === 'FATHER')!.status).toBe('already_exists');

    // --- Resolve the rest via defer/ignore, then complete ---
    expect((await call('POST', `/v1/internal/submission-people/${sp.MOTHER}/defer`, {})).status).toBe(200);
    expect((await call('POST', `/v1/internal/submission-people/${sp.SIBLING_1}/ignore`, { reason: 'няма данни' })).status).toBe(200);
    expect((await call('POST', `/v1/internal/submission-people/${sp.PARTNER_1}/ignore`, {})).status).toBe(200);

    const deferred = await ctx.db.selectFrom('submission_people').select('resolution_status').where('id', '=', sp.MOTHER!).executeTakeFirstOrThrow();
    expect(deferred.resolution_status).toBe('deferred');

    const done = await call('POST', `/v1/internal/submissions/${submissionId}/complete`);
    expect(done.status).toBe(200);
    const finalRow = await ctx.db.selectFrom('submissions').select(['status', 'processed_at']).where('id', '=', submissionId).executeTakeFirstOrThrow();
    expect(finalRow.status).toBe('processed');
    expect(finalRow.processed_at).not.toBeNull();
  });
});
