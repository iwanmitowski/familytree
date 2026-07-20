import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { createInvite } from '../../src/invites/service';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'submissions-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-submissions';
const logger = pino({ enabled: false });

function payloadFor(name: string) {
  return {
    payloadVersion: 1,
    participant: { name },
    people: [
      { localKey: 'SELF', firstName: name, surname: 'Митовски', livingStatus: 'living', birthYear: 1980 },
      { localKey: 'FATHER', firstName: 'Петър', surname: 'Митовски', livingStatus: 'deceased', birthYear: 1950, birthYearApprox: true },
    ],
    relationships: [{ fromLocalKey: 'SELF', toLocalKey: 'FATHER', type: 'parent' }],
    consents: [{ consentType: 'data_processing', consentVersion: 'v1', accepted: true }],
    origin: { hasMaterials: 'yes' },
    meta: { startedAt: 1, durationMs: 120000 },
  };
}

describe.skipIf(!testDatabaseUrl())('submission pipeline', () => {
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

  function post(bodyObj: unknown, opts: { role?: 'admin' | 'public'; idempotencyKey?: string } = {}) {
    const body = JSON.stringify(bodyObj);
    const signed = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method: 'POST',
      pathWithQuery: '/v1/internal/submissions',
      rawBody: body,
      actorId: opts.role === 'admin' ? 'admin@example.com' : 'public',
      actorRole: opts.role ?? 'public',
      idempotencyKey: opts.idempotencyKey ?? randomUUID(),
    });
    return app.request('http://api.test/v1/internal/submissions', {
      method: 'POST',
      headers: { ...signed.headers, 'Content-Type': 'application/json' },
      body,
    });
  }

  async function peopleCount(): Promise<number> {
    const row = await ctx.db
      .selectFrom('people')
      .select((eb) => eb.fn.countAll<string>().as('c'))
      .executeTakeFirstOrThrow();
    return Number(row.c);
  }

  it('stores a pending submission with staging rows and leaves canonical tables untouched', async () => {
    const before = await peopleCount();
    const res = await post({ payload: payloadFor('Иван'), clientFingerprint: `fp-happy-${randomUUID()}` });
    expect(res.status).toBe(201);
    const { submissionId } = (await res.json()) as { submissionId: string };

    const submission = await ctx.db
      .selectFrom('submissions')
      .selectAll()
      .where('id', '=', submissionId)
      .executeTakeFirstOrThrow();
    expect(submission.status).toBe('pending');

    const people = await ctx.db
      .selectFrom('submission_people')
      .selectAll()
      .where('submission_id', '=', submissionId)
      .execute();
    expect(people.map((p) => p.local_key).sort()).toEqual(['FATHER', 'SELF']);
    const father = people.find((p) => p.local_key === 'FATHER')!;
    // Approximate birth year → a ±3 window, never a fabricated exact date.
    expect(father.birth_year_from).toBe(1947);
    expect(father.birth_year_to).toBe(1953);

    const rels = await ctx.db
      .selectFrom('submission_relationships')
      .selectAll()
      .where('submission_id', '=', submissionId)
      .execute();
    expect(rels).toHaveLength(1);

    const consents = await ctx.db
      .selectFrom('consents')
      .selectAll()
      .where('submission_id', '=', submissionId)
      .execute();
    expect(consents[0]?.consent_type).toBe('data_processing');

    // Canonical graph must be untouched by a submission (idea.md §7 / DoD §25.4).
    expect(await peopleCount()).toBe(before);
  });

  it('rate-limits a fingerprint after 3 submissions in 24h', async () => {
    const fp = `fp-limit-${randomUUID()}`;
    for (let i = 0; i < 3; i++) {
      expect((await post({ payload: payloadFor(`Пор${i}`), clientFingerprint: fp })).status).toBe(201);
    }
    const fourth = await post({ payload: payloadFor('Четвърти'), clientFingerprint: fp });
    expect(fourth.status).toBe(429);
    expect(fourth.headers.get('retry-after')).toBe('86400');
  });

  it('stores a honeypot-flagged submission as spam but still returns success', async () => {
    const res = await post({
      payload: payloadFor('Бот'),
      clientFingerprint: 'fp-spam',
      spamSignal: 'honeypot',
    });
    expect(res.status).toBe(201);
    const { submissionId } = (await res.json()) as { submissionId: string };
    const row = await ctx.db
      .selectFrom('submissions')
      .selectAll()
      .where('id', '=', submissionId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('spam');
    expect(row.spam_reason).toBe('honeypot');
  });

  it('replays the same submission for an idempotent retry (one row only)', async () => {
    const key = randomUUID();
    const fp = `fp-idem-${randomUUID()}`;
    const body = { payload: payloadFor('Идемпотент'), clientFingerprint: fp };
    const first = await post(body, { idempotencyKey: key });
    const firstId = (await first.json()) as { submissionId: string };
    const second = await post(body, { idempotencyKey: key });
    expect(second.headers.get('idempotent-replay')).toBe('true');
    expect((await second.json()) as { submissionId: string }).toEqual(firstId);

    const count = await ctx.db
      .selectFrom('submissions')
      .select((eb) => eb.fn.countAll<string>().as('c'))
      .where('client_fingerprint', '=', fp)
      .executeTakeFirstOrThrow();
    expect(Number(count.c)).toBe(1);
  });

  it('consumes a valid invite instead of applying the fingerprint limit', async () => {
    const invite = await createInvite(ctx.db, { recipientLabel: 'Покана', maxSubmissions: 1 }, 'admin');
    const res = await post({ payload: payloadFor('Поканен'), inviteToken: invite.token });
    expect(res.status).toBe(201);
    const row = await ctx.db
      .selectFrom('invites')
      .selectAll()
      .where('id', '=', invite.id)
      .executeTakeFirstOrThrow();
    expect(row.used_submissions).toBe(1);

    // Exhausted invite → rejected.
    const second = await post({ payload: payloadFor('Втори'), inviteToken: invite.token });
    expect(second.status).toBe(429);
  });

  it('admin can list and fetch submission detail; fingerprint is only a prefix', async () => {
    const fingerprint = `fp-list-${randomUUID()}`;
    const created = await post({ payload: payloadFor('Списък'), clientFingerprint: fingerprint });
    const { submissionId } = (await created.json()) as { submissionId: string };

    const listBody = '';
    const listSigned = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method: 'GET',
      pathWithQuery: '/v1/internal/submissions?status=pending',
      rawBody: listBody,
      actorId: 'admin@example.com',
      actorRole: 'admin',
    });
    const listRes = await app.request('http://api.test/v1/internal/submissions?status=pending', {
      method: 'GET',
      headers: listSigned.headers,
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { items: { id: string; status: string }[] };
    expect(Array.isArray(list.items)).toBe(true);
    expect(list.items.every((i) => i.status === 'pending')).toBe(true);

    const detailSigned = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method: 'GET',
      pathWithQuery: `/v1/internal/submissions/${submissionId}`,
      rawBody: '',
      actorId: 'admin@example.com',
      actorRole: 'admin',
    });
    const detailRes = await app.request(`http://api.test/v1/internal/submissions/${submissionId}`, {
      method: 'GET',
      headers: detailSigned.headers,
    });
    const detail = (await detailRes.json()) as {
      clientFingerprintPrefix: string;
      people: unknown[];
    };
    expect(detail.people).toHaveLength(2);
    expect(detail.clientFingerprintPrefix).toBe(fingerprint.slice(0, 12));
    expect(detail.clientFingerprintPrefix.length).toBeLessThan(fingerprint.length);
  });

  it('rejects a public actor from the admin list', async () => {
    const signed = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method: 'GET',
      pathWithQuery: '/v1/internal/submissions',
      rawBody: '',
      actorId: 'public',
      actorRole: 'public',
    });
    const res = await app.request('http://api.test/v1/internal/submissions', {
      method: 'GET',
      headers: signed.headers,
    });
    expect(res.status).toBe(403);
  });
});
