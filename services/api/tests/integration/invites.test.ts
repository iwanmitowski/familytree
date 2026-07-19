import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { consumeInvite, hashToken } from '../../src/invites/service';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'invites-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-invites';
const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('invites endpoints + consumption', () => {
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

  function request(
    method: string,
    path: string,
    opts: { body?: unknown; role?: 'admin' | 'public' } = {},
  ) {
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const signed = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method,
      pathWithQuery: path,
      rawBody: body ?? '',
      actorId: opts.role === 'public' ? 'public' : 'admin@example.com',
      actorRole: opts.role ?? 'admin',
      idempotencyKey: method === 'GET' ? undefined : randomUUID(),
    });
    return app.request(`http://api.test${path}`, {
      method,
      headers: { ...signed.headers, 'Content-Type': 'application/json' },
      body,
    });
  }

  it('creates an invite, returns the plain token once, and stores only a hash', async () => {
    const res = await request('POST', '/v1/internal/invites', {
      body: { recipientLabel: 'Дядо Иван', campaign: 'snowball', maxSubmissions: 2 },
    });
    expect(res.status).toBe(201);
    const invite = (await res.json()) as { id: string; token: string; maxSubmissions: number };
    expect(invite.token).toMatch(/^inv_/);
    expect(invite.maxSubmissions).toBe(2);

    const row = await ctx.db
      .selectFrom('invites')
      .selectAll()
      .where('id', '=', invite.id)
      .executeTakeFirstOrThrow();
    expect(row.token_hash).toBe(hashToken(invite.token));
    // The DB never contains the plain token.
    const anyPlain = await ctx.db
      .selectFrom('invites')
      .select('token_hash')
      .where('token_hash', '=', invite.token)
      .executeTakeFirst();
    expect(anyPlain).toBeUndefined();
  });

  it('lists invites without hashes or tokens', async () => {
    const res = await request('GET', '/v1/internal/invites');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Record<string, unknown>[] };
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item).not.toHaveProperty('token');
      expect(item).not.toHaveProperty('token_hash');
      expect(item).not.toHaveProperty('tokenHash');
    }
  });

  it('validates tokens and reports precise reasons', async () => {
    const created = await request('POST', '/v1/internal/invites', {
      body: { recipientLabel: 'Валиден', maxSubmissions: 1 },
    });
    const { token, id } = (await created.json()) as { token: string; id: string };

    const okRes = await request('GET', `/v1/internal/invites/validate?token=${token}`, {
      role: 'public',
    });
    expect(await okRes.json()).toEqual({ valid: true });

    const missing = await request('GET', '/v1/internal/invites/validate?token=inv_nope', {
      role: 'public',
    });
    expect(await missing.json()).toEqual({ valid: false, reason: 'not_found' });

    await request('POST', `/v1/internal/invites/${id}/revoke`);
    const revoked = await request('GET', `/v1/internal/invites/validate?token=${token}`, {
      role: 'public',
    });
    expect(await revoked.json()).toEqual({ valid: false, reason: 'revoked' });
  });

  it('revoke is idempotent and 404s for unknown ids', async () => {
    const created = await request('POST', '/v1/internal/invites', {
      body: { recipientLabel: 'За анулиране' },
    });
    const { id } = (await created.json()) as { id: string };
    expect((await request('POST', `/v1/internal/invites/${id}/revoke`)).status).toBe(200);
    expect((await request('POST', `/v1/internal/invites/${id}/revoke`)).status).toBe(200);
    expect(
      (await request('POST', `/v1/internal/invites/${randomUUID()}/revoke`)).status,
    ).toBe(404);
  });

  it('non-admin cannot create invites', async () => {
    const res = await request('POST', '/v1/internal/invites', {
      body: { recipientLabel: 'x' },
      role: 'public',
    });
    expect(res.status).toBe(403);
  });

  it('concurrent consumption never exceeds max_submissions', async () => {
    // A max-1 invite consumed twice concurrently: exactly one succeeds.
    const created = await request('POST', '/v1/internal/invites', {
      body: { recipientLabel: 'Състезание', maxSubmissions: 1 },
    });
    const { token } = (await created.json()) as { token: string };

    const [a, b] = await Promise.all([
      consumeInvite(ctx.db, token),
      consumeInvite(ctx.db, token),
    ]);
    const successes = [a, b].filter((r) => r.ok).length;
    expect(successes).toBe(1);
    const failure = [a, b].find((r) => !r.ok);
    expect(failure && !failure.ok && failure.reason).toBe('exhausted');

    const row = await ctx.db
      .selectFrom('invites')
      .selectAll()
      .where('token_hash', '=', hashToken(token))
      .executeTakeFirstOrThrow();
    expect(row.used_submissions).toBe(1);
  });
});
