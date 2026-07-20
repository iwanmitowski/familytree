import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { insertSubmission } from '../../src/submissions/repo';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'admin-workflow-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-admin-wf';
const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('submission admin workflow + contact leads', () => {
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

  async function seedPending(payload: unknown = {}): Promise<string> {
    const row = await insertSubmission(ctx.db, {
      status: 'pending',
      original_payload: JSON.stringify(payload),
      submitted_at: new Date(),
    });
    return row.id;
  }

  it('start-review moves pending → in_review, then rejects a repeat', async () => {
    const id = await seedPending();
    const first = await call('POST', `/v1/internal/submissions/${id}/start-review`);
    expect(first.status).toBe(200);
    expect(((await first.json()) as { status: string }).status).toBe('in_review');

    const repeat = await call('POST', `/v1/internal/submissions/${id}/start-review`);
    expect(repeat.status).toBe(409);
    expect(((await repeat.json()) as { error: { code: string } }).error.code).toBe(
      'invalid_transition',
    );
  });

  it('reject requires a reason and sets rejected_at + audit', async () => {
    const id = await seedPending();
    const missing = await call('POST', `/v1/internal/submissions/${id}/reject`, {});
    expect(missing.status).toBe(400);

    const ok = await call('POST', `/v1/internal/submissions/${id}/reject`, { reason: 'дубликат' });
    expect(ok.status).toBe(200);

    const row = await ctx.db
      .selectFrom('submissions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('rejected');
    expect(row.rejected_at).not.toBeNull();

    const audit = await ctx.db
      .selectFrom('audit_log')
      .selectAll()
      .where('entity_id', '=', id)
      .where('action', '=', 'submission.rejected')
      .execute();
    expect(audit).toHaveLength(1);
  });

  it('mark-spam from in_review works; rejected cannot transition', async () => {
    const id = await seedPending();
    await call('POST', `/v1/internal/submissions/${id}/start-review`);
    const spam = await call('POST', `/v1/internal/submissions/${id}/mark-spam`, { reason: 'бот' });
    expect(spam.status).toBe(200);
    expect(((await spam.json()) as { status: string }).status).toBe('spam');

    // A processed/rejected/spam submission cannot start review.
    const invalid = await call('POST', `/v1/internal/submissions/${id}/start-review`);
    expect(invalid.status).toBe(409);
  });

  it('404 for an unknown submission', async () => {
    const res = await call('POST', `/v1/internal/submissions/${randomUUID()}/start-review`);
    expect(res.status).toBe(404);
  });

  it('aggregates contact leads from consented participants and referrals', async () => {
    const marker = randomUUID();
    await seedPending({
      participant: { name: `Участник ${marker}`, email: 'p@example.com' },
      consents: [{ consentType: 'contact', accepted: true }],
      people: [{ localKey: 'RELATIVE_1', firstName: 'Баба', surname: marker, infoSource: 'знае родословието' }],
    });
    // A submission WITHOUT the contact consent should not yield a participant lead.
    await seedPending({
      participant: { name: `Без съгласие ${marker}` },
      consents: [{ consentType: 'data_processing', accepted: true }],
    });

    const res = await call('GET', '/v1/internal/contact-leads');
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as { items: { name: string; kind: string }[] };
    expect(items.some((l) => l.name === `Участник ${marker}` && l.kind === 'participant')).toBe(true);
    expect(items.some((l) => l.name.includes(marker) && l.kind === 'referral')).toBe(true);
    expect(items.some((l) => l.name === `Без съгласие ${marker}`)).toBe(false);
  });

  it('rejects a public actor from admin workflow endpoints', async () => {
    const id = await seedPending();
    const signed = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method: 'POST',
      pathWithQuery: `/v1/internal/submissions/${id}/start-review`,
      rawBody: '',
      actorId: 'public',
      actorRole: 'public',
      idempotencyKey: randomUUID(),
    });
    const res = await app.request(`http://api.test/v1/internal/submissions/${id}/start-review`, {
      method: 'POST',
      headers: { ...signed.headers, 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(403);
  });
});
